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
      console.log(`[AppleCancellationHandler] Getting subscription status for originalTransactionId: ${originalTransactionId}`);
      
      const token = await this.generateToken();
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${originalTransactionId}`;
      console.log(`[AppleCancellationHandler] Making API call to: ${url}`);
      
      const response = await axios.get(url, { headers });
      console.log(`[AppleCancellationHandler] API Response status: ${response.status}`);
      console.log(`[AppleCancellationHandler] API Response data:`, JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error) {
      console.error("[AppleCancellationHandler] Error fetching subscription status:", {
        originalTransactionId: originalTransactionId,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      if (error.response?.status === 404) {
        console.log(`[AppleCancellationHandler] Subscription not found (404) for originalTransactionId: ${originalTransactionId}`);
        // Don't mark as expired for 404 - this could be a new transaction
        return { status: 'NOT_FOUND' };
      }
      
      if (error.response?.status === 401) {
        throw new Error("Invalid App Store Connect API credentials");
      }
      
      throw error;
    }
  }

  async processAppleSubscriptionCancellation(originalTransactionId) {
    try {
      console.log(`[AppleCancellationHandler] Processing cancellation check for originalTransactionId: ${originalTransactionId}`);
      
      const subscriptionStatus = await this.getSubscriptionStatus(originalTransactionId);
      console.log(`[AppleCancellationHandler] Raw subscription status:`, JSON.stringify(subscriptionStatus, null, 2));
      
      // If subscription not found, don't cancel - it might be a new transaction
      if (subscriptionStatus.status === 'NOT_FOUND') {
        console.log(`[AppleCancellationHandler] Subscription not found in Apple system, skipping cancellation check`);
        return false;
      }
      
      const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);
      console.log(`[AppleCancellationHandler] Cancellation analysis:`, cancellationInfo);
      
      if (cancellationInfo.isCancelled || cancellationInfo.willCancel) {
        console.log(`[AppleCancellationHandler] Subscription needs cancellation handling:`, cancellationInfo);
        await this.handleCancelledAppleSubscription(originalTransactionId, cancellationInfo);
        return true;
      }
      
      console.log(`[AppleCancellationHandler] Subscription is still active: ${originalTransactionId}`);
      return false;
    } catch (error) {
      console.error("[AppleCancellationHandler] Error processing Apple cancellation:", {
        originalTransactionId: originalTransactionId,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  analyzeCancellationStatus(subscriptionData) {
    console.log(`[AppleCancellationHandler] Analyzing cancellation status:`, JSON.stringify(subscriptionData, null, 2));
    
    if (!subscriptionData) {
      console.log(`[AppleCancellationHandler] No subscription data - skipping cancellation`);
      return { isCancelled: false, willCancel: false };
    }

    if (subscriptionData.status === 'NOT_FOUND') {
      console.log(`[AppleCancellationHandler] Subscription not found in Apple system - skipping cancellation`);
      return { isCancelled: false, willCancel: false };
    }

    if (subscriptionData.status === 'EXPIRED') {
      console.log(`[AppleCancellationHandler] Subscription status is EXPIRED`);
      return { isCancelled: true, reason: 'expired', gracePeriod: false };
    }

    if (subscriptionData.data && Array.isArray(subscriptionData.data)) {
      console.log(`[AppleCancellationHandler] Processing data array with ${subscriptionData.data.length} items`);
      
      const latestTransaction = subscriptionData.data[0];
      if (latestTransaction) {
        console.log(`[AppleCancellationHandler] Latest transaction:`, latestTransaction);
        
        const expiresDate = new Date(latestTransaction.expiresDate);
        const now = new Date();
        const isExpired = expiresDate < now;
        
        console.log(`[AppleCancellationHandler] Expiry check - Expires: ${expiresDate}, Now: ${now}, IsExpired: ${isExpired}`);
        
        if (isExpired) {
          const gracePeriod = this.isInGracePeriod(expiresDate);
          console.log(`[AppleCancellationHandler] Subscription expired. Grace period: ${gracePeriod}`);
          
          return { 
            isCancelled: true, 
            reason: 'expired', 
            expiryDate: expiresDate,
            gracePeriod: gracePeriod
          };
        }

        const willAutoRenew = latestTransaction.autoRenewStatus === 1;
        console.log(`[AppleCancellationHandler] Auto-renew status: ${willAutoRenew}`);
        
        if (!willAutoRenew) {
          console.log(`[AppleCancellationHandler] Auto-renew is OFF - subscription will cancel at expiry`);
          return { 
            willCancel: true, 
            reason: 'auto_renew_off', 
            expiryDate: expiresDate 
          };
        }
        
        console.log(`[AppleCancellationHandler] Subscription is active and auto-renewing`);
      } else {
        console.log(`[AppleCancellationHandler] No latest transaction found in data array`);
      }
    } else {
      console.log(`[AppleCancellationHandler] No data array found in subscription response`);
    }

    return { isCancelled: false, willCancel: false };
  }

  isInGracePeriod(expiryDate) {
    const gracePeriodDays = 7;
    const gracePeriodEnd = new Date(expiryDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
    const now = new Date();
    const inGracePeriod = now <= gracePeriodEnd;
    
    console.log(`[AppleCancellationHandler] Grace period check - Expiry: ${expiryDate}, Grace End: ${gracePeriodEnd}, Now: ${now}, InGrace: ${inGracePeriod}`);
    
    return inGracePeriod;
  }

  async handleCancelledAppleSubscription(originalTransactionId, cancellationInfo) {
    try {
      console.log(`[AppleCancellationHandler] Handling cancelled subscription:`, {
        originalTransactionId: originalTransactionId,
        cancellationInfo: cancellationInfo
      });

      // Find payment record by originalTransactionId OR transactionId
      const paymentRecord = await PaymentRecord.findOne({ 
        $or: [
          { originalTransactionId: originalTransactionId },
          { transactionId: originalTransactionId }
        ]
      });

      if (!paymentRecord) {
        console.error("[AppleCancellationHandler] Payment record not found for originalTransactionId:", originalTransactionId);
        return;
      }

      console.log(`[AppleCancellationHandler] Found payment record:`, {
        id: paymentRecord._id,
        userId: paymentRecord.userId,
        status: paymentRecord.status,
        expiryDate: paymentRecord.expiryDate,
        transactionId: paymentRecord.transactionId,
        originalTransactionId: paymentRecord.originalTransactionId
      });

      const userId = paymentRecord.userId;
      const user = await User.findOne({ _id: userId });
      
      if (!user) {
        console.error("[AppleCancellationHandler] User not found:", userId);
        return;
      }

      console.log(`[AppleCancellationHandler] Found user:`, {
        id: user._id,
        isSubscribed: user.isSubscribed,
        planName: user.planName
      });

      const newStatus = cancellationInfo.gracePeriod ? 'grace_period' : 'cancelled';
      console.log(`[AppleCancellationHandler] Updating payment record status to: ${newStatus}`);

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        { 
          $set: { 
            status: newStatus,
            cancelledAt: new Date(),
            cancellationReason: cancellationInfo.reason
          }
        }
      );

      const activeSubscription = await UserSubscription.findOne({
        userId: userId,
        isActive: true
      });

      if (activeSubscription) {
        console.log(`[AppleCancellationHandler] Found active subscription:`, {
          id: activeSubscription._id,
          planId: activeSubscription.planId,
          endDate: activeSubscription.endDate,
          isActive: activeSubscription.isActive
        });

        if (cancellationInfo.willCancel) {
          console.log(`[AppleCancellationHandler] Setting auto-renew to false for pending cancellation`);
          await UserSubscription.updateOne(
            { _id: activeSubscription._id },
            { 
              $set: { 
                autoRenew: false,
                cancelledAt: new Date()
              }
            }
          );
        } else if (cancellationInfo.isCancelled) {
          if (cancellationInfo.gracePeriod) {
            console.log(`[AppleCancellationHandler] Handling grace period - keeping subscription active until: ${cancellationInfo.expiryDate}`);
            await UserSubscription.updateOne(
              { _id: activeSubscription._id },
              { 
                $set: { 
                  isActive: true,
                  autoRenew: false,
                  cancelledAt: new Date(),
                  endDate: cancellationInfo.expiryDate
                }
              }
            );
          } else {
            console.log(`[AppleCancellationHandler] Immediate cancellation - downgrading to free plan`);
            await this.downgradeToFreePlan(userId, activeSubscription);
          }
        }
      } else {
        console.log(`[AppleCancellationHandler] No active subscription found for user: ${userId}`);
      }

      console.log(`[AppleCancellationHandler] Successfully handled cancellation for: ${originalTransactionId}`);
    } catch (error) {
      console.error("[AppleCancellationHandler] Error handling Apple cancellation:", {
        originalTransactionId: originalTransactionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async downgradeToFreePlan(userId, subscription) {
    try {
      console.log(`[AppleCancellationHandler] Downgrading user ${userId} to free plan`);

      const freePlan = await SubscriptionPlan.findOne({ type: 'free' });
      
      if (!freePlan) {
        console.error("[AppleCancellationHandler] Free plan not found");
        return;
      }

      console.log(`[AppleCancellationHandler] Found free plan:`, freePlan._id);

      await UserSubscription.updateOne(
        { _id: subscription._id },
        { 
          $set: { 
            isActive: false,
            autoRenew: false,
            cancelledAt: new Date()
          }
        }
      );

      const user = await User.findOne({ _id: userId });
      if (user) {
        console.log(`[AppleCancellationHandler] Updating user data for free plan`);
        
        user.isSubscribed = false;
        user.subscriptionStatus = 'cancelled';
        user.planName = 'Free';
        user.planType = 'free';
        user.watermarkEnabled = true;
        user.totalCredits = 10;
        user.dailyCredits = 10;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 10;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
        
        await user.save();
        console.log(`[AppleCancellationHandler] User successfully downgraded to free plan`);
      }
    } catch (error) {
      console.error("[AppleCancellationHandler] Error downgrading to free plan:", {
        userId: userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async checkAllActiveAppleSubscriptions() {
    try {
      console.log(`[AppleCancellationHandler] Checking all active Apple subscriptions`);
      
      // Look for payments that have originalTransactionId OR transactionId
      const activePayments = await PaymentRecord.find({
        paymentMethod: 'apple',
        status: 'completed',
        $or: [
          { expiryDate: { $gt: new Date() } },
          { expiryDate: { $exists: false } }
        ]
      });

      console.log(`[AppleCancellationHandler] Found ${activePayments.length} active Apple payments to check`);

      for (const payment of activePayments) {
        try {
          // Prefer originalTransactionId over transactionId for Apple subscriptions
          const transactionId = payment.originalTransactionId || payment.transactionId;
          console.log(`[AppleCancellationHandler] Checking payment:`, {
            paymentId: payment._id,
            transactionId: transactionId,
            originalTransactionId: payment.originalTransactionId,
            transactionIdInRecord: payment.transactionId,
            userId: payment.userId
          });
          
          if (transactionId) {
            const wasCancelled = await this.processAppleSubscriptionCancellation(transactionId);
            console.log(`[AppleCancellationHandler] Payment ${payment._id} cancellation status: ${wasCancelled}`);
          } else {
            console.warn(`[AppleCancellationHandler] No transaction ID found for payment: ${payment._id}`);
          }
        } catch (error) {
          console.error(`[AppleCancellationHandler] Error checking payment ${payment._id}:`, error);
        }
      }
      
      console.log(`[AppleCancellationHandler] Completed checking all Apple subscriptions`);
    } catch (error) {
      console.error("[AppleCancellationHandler] Error checking all Apple subscriptions:", {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = AppleCancellationHandler;