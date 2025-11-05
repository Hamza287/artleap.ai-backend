const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const PaymentRecord = require("./../models/recordPayment_model");

class PaymentReversalService {
  constructor() {
    this.googleAuth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_KEY_PATH,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  async reverseApplePayment(transactionId, userId, planId, reason) {
    try {
      const paymentRecord = await PaymentRecord.findOne({
        transactionId: transactionId,
        userId: userId,
        planId: planId
      });

      if (!paymentRecord) {
        console.error(`[PaymentReversalService] Payment record not found for reversal: ${transactionId}`);
        return { success: false, error: "Payment record not found" };
      }

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "refunded",
            refundedAt: new Date(),
            refundReason: reason
          }
        }
      );

      return { 
        success: true, 
        message: "Payment successfully refunded",
        transactionId: transactionId
      };
    } catch (error) {
      console.error(`[PaymentReversalService] Error reversing Apple payment:`, error);
      return { success: false, error: error.message };
    }
  }

  async reverseGooglePayment(purchaseToken, userId, planId, reason) {
    try {
      const authClient = await this.googleAuth.getClient();
      google.options({ auth: authClient });

      const paymentRecord = await PaymentRecord.findOne({
        receiptData: purchaseToken,
        userId: userId,
        planId: planId
      });

      if (!paymentRecord) {
        console.error(`[PaymentReversalService] Payment record not found for reversal: ${purchaseToken}`);
        return { success: false, error: "Payment record not found" };
      }

      await androidpublisher.purchases.subscriptions.revoke({
        packageName: process.env.PACKAGE_NAME,
        subscriptionId: paymentRecord.planSnapshot?.googleProductId || "default",
        token: purchaseToken,
      });

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "refunded",
            refundedAt: new Date(),
            refundReason: reason
          }
        }
      );

      return { 
        success: true, 
        message: "Payment successfully revoked and refunded",
        purchaseToken: purchaseToken
      };
    } catch (error) {
      console.error(`[PaymentReversalService] Error reversing Google payment:`, error);
      
      await PaymentRecord.updateOne(
        { receiptData: purchaseToken },
        {
          $set: {
            status: "refund_pending",
            refundRequestedAt: new Date(),
            refundReason: reason
          }
        }
      );

      return { 
        success: false, 
        error: error.message,
        fallbackAction: "marked_as_refund_pending"
      };
    }
  }

  async reverseStripePayment(paymentIntentId, userId, planId, reason) {
    try {
  
      const paymentRecord = await PaymentRecord.findOne({
        transactionId: paymentIntentId,
        userId: userId,
        planId: planId
      });

      if (!paymentRecord) {
        console.error(`[PaymentReversalService] Payment record not found for reversal: ${paymentIntentId}`);
        return { success: false, error: "Payment record not found" };
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer'
      });

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "refunded",
            refundedAt: new Date(),
            refundReason: reason,
            stripeRefundId: refund.id
          }
        }
      );

      return { 
        success: true, 
        message: "Payment successfully refunded",
        refundId: refund.id,
        paymentIntentId: paymentIntentId
      };
    } catch (error) {
      console.error(`[PaymentReversalService] Error reversing Stripe payment:`, error);
      
      await PaymentRecord.updateOne(
        { transactionId: paymentIntentId },
        {
          $set: {
            status: "refund_pending",
            refundRequestedAt: new Date(),
            refundReason: reason
          }
        }
      );

      return { 
        success: false, 
        error: error.message,
        fallbackAction: "marked_as_refund_pending"
      };
    }
  }

  async handleFailedSubscription(userId, planId, paymentMethod, verificationData, error) {
    try {
      let reversalResult;

      switch (paymentMethod) {
        case 'apple':
          const transactionId = verificationData.transactionId || verificationData.originalTransactionId;
          reversalResult = await this.reverseApplePayment(
            transactionId, 
            userId, 
            planId, 
            `Subscription creation failed: ${error.message}`
          );
          break;

        case 'google_play':
        case 'google_pay':
          reversalResult = await this.reverseGooglePayment(
            verificationData.purchaseToken,
            userId,
            planId,
            `Subscription creation failed: ${error.message}`
          );
          break;

        case 'stripe':
          reversalResult = await this.reverseStripePayment(
            verificationData.paymentIntentId,
            userId,
            planId,
            `Subscription creation failed: ${error.message}`
          );
          break;

        default:
          reversalResult = { success: false, error: `Unsupported payment method: ${paymentMethod}` };
      }

      return reversalResult;

    } catch (reversalError) {
      console.error(`[PaymentReversalService] Error in handleFailedSubscription:`, reversalError);
      return { success: false, error: reversalError.message };
    }
  }

  async getRefundStatus(transactionId, paymentMethod) {
    try {
      const paymentRecord = await PaymentRecord.findOne({
        $or: [
          { transactionId: transactionId },
          { receiptData: transactionId }
        ]
      });

      if (!paymentRecord) {
        return { success: false, error: "Payment record not found" };
      }

      let refundDetails = null;

      if (paymentMethod === 'stripe' && paymentRecord.stripeRefundId) {
        try {
          const refund = await stripe.refunds.retrieve(paymentRecord.stripeRefundId);
          refundDetails = {
            id: refund.id,
            status: refund.status,
            amount: refund.amount,
            currency: refund.currency,
            created: refund.created
          };
        } catch (error) {
          console.error(`[PaymentReversalService] Error fetching Stripe refund details:`, error);
        }
      }

      return {
        success: true,
        paymentStatus: paymentRecord.status,
        refundedAt: paymentRecord.refundedAt,
        refundReason: paymentRecord.refundReason,
        refundDetails: refundDetails
      };

    } catch (error) {
      console.error(`[PaymentReversalService] Error getting refund status:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PaymentReversalService();