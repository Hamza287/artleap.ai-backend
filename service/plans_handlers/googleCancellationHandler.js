const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const googleCredentials = require("../../google-credentials.json");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require('../../models/user');
const UserSubscription = require('../../models/user_subscription');
const SubscriptionPlan = require('../../models/subscriptionPlan_model');

class GoogleCancellationHandler {
  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  async getBillingClient() {
    try {
      await this.auth.getClient();
      return androidpublisher;
    } catch (error) {
      console.error("[GoogleCancellationHandler] Failed to fetch billing client:", error);
      throw error;
    }
  }

  async processGoogleSubscriptionCancellation(purchaseToken, packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      const client = await this.getBillingClient();
      
      const response = await client.purchases.subscriptions.get({
        auth: this.auth,
        packageName: packageName,
        subscriptionId: this.extractSubscriptionId(purchaseToken),
        token: purchaseToken,
      });

      const subscription = response.data;
      
      if (subscription.paymentState === 1 || subscription.autoRenewing === false) {
        await this.handleCancelledSubscription(purchaseToken, subscription);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("[GoogleCancellationHandler] Error checking subscription:", error);
      throw error;
    }
  }

  async extractSubscriptionId(purchaseToken){
    const paymentRecord = await PaymentRecord.findOne({ 
      receiptData: purchaseToken 
    });
    
    if (paymentRecord && paymentRecord.planSnapshot) {
      return paymentRecord.planSnapshot.googleProductId;
    }
    
    return null;
  }

  async handleCancelledSubscription(purchaseToken, subscriptionData) {
    try {
      const paymentRecord = await PaymentRecord.findOne({ 
        receiptData: purchaseToken 
      });

      if (!paymentRecord) {
        console.error("[GoogleCancellationHandler] Payment record not found for token:", purchaseToken);
        return;
      }

      const userId = paymentRecord.userId;
      
     await PaymentRecord.updateOne(
      { _id: paymentRecord._id },
      { 
        $set: { 
          status: 'cancelled',
          cancelledAt: new Date()
        }
      }
    );

      await UserSubscription.updateMany(
           { 
             userId: userId,
             isActive: true 
           },
           { 
             $set: { 
               autoRenew: false,
               cancelledAt: new Date()
             }
           }
         );

      console.log(`[GoogleCancellationHandler] Subscription cancelled for user: ${userId}`);
    } catch (error) {
      console.error("[GoogleCancellationHandler] Error handling cancellation:", error);
      throw error;
    }
  }

  async checkAllActiveSubscriptions() {
    try {
      const activePayments = await PaymentRecord.find({
        status: 'completed',
        expiryDate: { $gt: new Date() }
      });

      for (const payment of activePayments) {
        if (payment.receiptData && payment.platform === 'android') {
          await this.processGoogleSubscriptionCancellation(payment.receiptData);
        }
      }
    } catch (error) {
      console.error("[GoogleCancellationHandler] Error checking all subscriptions:", error);
      throw error;
    }
  }
}

module.exports = GoogleCancellationHandler;