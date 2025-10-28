const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require('../../models/user');
const UserSubscription = require('../../models/user_subscription');
const SubscriptionPlan = require('../../models/subscriptionPlan_model');

class AppleCancellationHandler {
  constructor() {
    this.bundleId = process.env.PACKAGE_NAME;
    this.issuerId = process.env.APPLE_ISSUER_ID;
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKey = fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8");
  }

  async generateToken() {
    try {
      const now = Math.floor(Date.now() / 1000);
      return jwt.sign(
        {
          iss: this.issuerId,
          iat: now,
          exp: now + 20 * 60,
          aud: "appstoreconnect-v1",
          bid: this.bundleId
        },
        this.privateKey,
        {
          algorithm: "ES256",
          header: { kid: this.keyId, typ: "JWT" },
        }
      );
    } catch (error) {
      console.error("[AppleCancellationHandler] Failed to generate JWT:", error);
      throw new Error("Failed to generate App Store Connect API token");
    }
  }

  async getSubscriptionStatus(originalTransactionId) {
    try {
      const token = await this.generateToken();
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${originalTransactionId}`;
      const response = await axios.get(url, { headers });

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { status: 'EXPIRED' };
      }
      
      console.error("[AppleCancellationHandler] Error fetching subscription status:", error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new Error("Invalid App Store Connect API credentials");
      }
      
      throw error;
    }
  }

  async verifySubscriptionWithAppStore(originalTransactionId) {
    try {
      const token = await this.generateToken();
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const requestBody = {
        transactionId: originalTransactionId
      };
      
      const url = 'https://api.storekit.itunes.apple.com/inApps/v1/transactionHistory';
      
      const response = await axios.post(url, requestBody, { headers });
      
      return response.data;
    } catch (error) {
      console.error("[AppleCancellationHandler] Error verifying subscription with App Store:", error.response?.data || error.message);
      throw error;
    }
  }

  async processAppleSubscriptionCancellation(originalTransactionId) {
    try {
      let subscriptionStatus;
      try {
        subscriptionStatus = await this.getSubscriptionStatus(originalTransactionId);
      } catch (error) {
        console.error(`[AppleCancellationHandler] Failed to get subscription status, trying alternative method: ${error.message}`);
        
        try {
          subscriptionStatus = await this.verifySubscriptionWithAppStore(originalTransactionId);
        } catch (secondError) {
          console.error(`[AppleCancellationHandler] Both methods failed for: ${originalTransactionId}`);
          return false;
        }
      }
      
      const isCancelled = this.isSubscriptionCancelled(subscriptionStatus);
      
      if (isCancelled) {
        await this.handleCancelledAppleSubscription(originalTransactionId, subscriptionStatus);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[AppleCancellationHandler] Error processing Apple cancellation:", error);
      return false;
    }
  }

  isSubscriptionCancelled(subscriptionData) {
    if (!subscriptionData) return true;
    
    if (subscriptionData.status === 'EXPIRED') return true;
    
    if (subscriptionData.data && Array.isArray(subscriptionData.data)) {
      const latestTransaction = subscriptionData.data[0];
      if (latestTransaction) {
        const expiresDate = new Date(latestTransaction.expiresDate);
        const now = new Date();
        return expiresDate < now;
      }
    }
    
    if (subscriptionData.lastTransactions && Array.isArray(subscriptionData.lastTransactions)) {
      const latestTransaction = subscriptionData.lastTransactions[0];
      if (latestTransaction) {
        const expiresDate = new Date(latestTransaction.expiresDate);
        const now = new Date();
        return expiresDate < now;
      }
    }
    
    return false;
  }

  async handleCancelledAppleSubscription(originalTransactionId, subscriptionData) {
  try {
    const paymentRecord = await PaymentRecord.findOne({ 
      $or: [
        { transactionId: originalTransactionId },
        { originalTransactionId: originalTransactionId }
      ]
    });

    if (!paymentRecord) {
      console.error("[AppleCancellationHandler] Payment record not found for transaction:", originalTransactionId);
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
  } catch (error) {
    console.error("[AppleCancellationHandler] Error handling Apple cancellation:", error);
    throw error;
  }
}

  async checkAllActiveAppleSubscriptions() {
    try {
      const activePayments = await PaymentRecord.find({
        paymentMethod: 'apple',
        status: 'completed',
        $or: [
          { expiryDate: { $gt: new Date() } },
          { expiryDate: { $exists: false } }
        ]
      });
      let cancelledCount = 0;
      
      for (const payment of activePayments) {
        try {
          const transactionId = payment.transactionId || payment.originalTransactionId;
          if (transactionId) {
            const wasCancelled = await this.processAppleSubscriptionCancellation(transactionId);
            if (wasCancelled) {
              cancelledCount++;
            }
          }
        } catch (error) {
          console.error(`[AppleCancellationHandler] Error checking payment ${payment._id}:`, error);
        }
      }
    } catch (error) {
      console.error("[AppleCancellationHandler] Error checking all Apple subscriptions:", error);
      throw error;
    }
  }

  async checkSubscriptionWithReceipt(originalTransactionId) {
    try {
      const url = process.env.APPLE_SANDBOX === "true" 
        ? "https://sandbox.itunes.apple.com/verifyReceipt"
        : "https://buy.itunes.apple.com/verifyReceipt";

      const paymentRecord = await PaymentRecord.findOne({
        $or: [
          { transactionId: originalTransactionId },
          { originalTransactionId: originalTransactionId }
        ]
      });

      if (!paymentRecord || !paymentRecord.receiptData) {
        throw new Error("No receipt data found for transaction");
      }

      const requestBody = {
        'receipt-data': paymentRecord.receiptData,
        password: process.env.APPLE_SHARED_SECRET,
        'exclude-old-transactions': false
      };

      const response = await axios.post(url, requestBody);
      const receiptInfo = response.data;

      if (receiptInfo.status !== 0) {
        throw new Error(`Receipt verification failed with status: ${receiptInfo.status}`);
      }

      const latestReceipts = receiptInfo.latest_receipt_info || [];
      const activeSubscription = latestReceipts.find(receipt => 
        receipt.original_transaction_id === originalTransactionId &&
        new Date(parseInt(receipt.expires_date_ms)) > new Date()
      );

      return !activeSubscription;
    } catch (error) {
      console.error("[AppleCancellationHandler] Error checking subscription with receipt:", error);
      throw error;
    }
  }
}

module.exports = AppleCancellationHandler;