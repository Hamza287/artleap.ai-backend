const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require("../../models/user");
const UserSubscription = require("../../models/user_subscription");
const SubscriptionPlan = require("../../models/subscriptionPlan_model");

class AppleCancellationHandler {
  constructor() {
    this.bundleId = process.env.PACKAGE_NAME;
    this.issuerId = process.env.APPLE_ISSUER_ID;
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKey = fs.readFileSync(
      process.env.APPLE_PRIVATE_KEY_PATH,
      "utf8"
    );
    this.debug = true;
  }

  logDebug(message, data = null) {
    if (this.debug) {
      console.log(`[AppleCancellationHandler][DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  logError(message, error) {
    console.error(`[AppleCancellationHandler][ERROR] ${message}`, {
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });
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
          bid: this.bundleId,
        },
        this.privateKey,
        {
          algorithm: "ES256",
          header: { kid: this.keyId, typ: "JWT" },
        }
      );
    } catch (error) {
      this.logError("Failed to generate JWT:", error);
      throw new Error("Failed to generate App Store Connect API token");
    }
  }

  async getSubscriptionStatus(originalTransactionId) {
    try {
      this.logDebug("Getting subscription status", { originalTransactionId });

      const token = await this.generateToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${originalTransactionId}`;
      
      const response = await axios.get(url, { headers });
      this.logDebug("API Response data", response.data);

      return response.data;
    } catch (error) {
      this.logError("Error fetching subscription status:", error);

      if (error.response?.status === 404) {
        this.logDebug("Subscription not found (404)", { originalTransactionId });
        return { status: "NOT_FOUND" };
      }

      if (error.response?.status === 401) {
        throw new Error("Invalid App Store Connect API credentials");
      }

      throw error;
    }
  }

  async getAllSubscriptionsFromAppStore() {
    try {
      this.logDebug("Fetching all subscriptions from App Store");
      
      const allPaymentRecords = await PaymentRecord.find({
        platform: "ios",
        $or: [
          { originalTransactionId: { $exists: true, $ne: null } },
          { transactionId: { $exists: true, $ne: null } }
        ]
      });

      this.logDebug(`Found ${allPaymentRecords.length} payment records to check with App Store`);

      const results = {
        processed: 0,
        updated: 0,
        errors: 0,
        details: []
      };

      for (const paymentRecord of allPaymentRecords) {
        try {
          this.logDebug(`Checking payment record ${results.processed + 1}/${allPaymentRecords.length}`, {
            paymentId: paymentRecord._id,
            originalTransactionId: paymentRecord.originalTransactionId,
            transactionId: paymentRecord.transactionId,
            currentStatus: paymentRecord.status
          });

          const transactionId = paymentRecord.originalTransactionId || paymentRecord.transactionId;
          if (!transactionId) {
            this.logDebug("No transaction ID found, skipping");
            results.processed++;
            continue;
          }

          const appStoreStatus = await this.getSubscriptionStatusFromAppStore(transactionId);
          
          if (appStoreStatus) {
            const needsUpdate = await this.compareAndUpdateLocalRecords(paymentRecord, appStoreStatus);
            if (needsUpdate) {
              results.updated++;
            }
            results.details.push({
              paymentId: paymentRecord._id,
              transactionId: transactionId,
              localStatus: paymentRecord.status,
              appStoreStatus: appStoreStatus.finalStatus,
              updated: needsUpdate
            });
          }

          results.processed++;
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          results.errors++;
          this.logError(`Error processing payment record ${paymentRecord._id}:`, error);
        }
      }

      this.logDebug("Completed syncing all subscriptions with App Store", results);
      return results;

    } catch (error) {
      this.logError("Error fetching all subscriptions from App Store:", error);
      throw error;
    }
  }

  async getSubscriptionStatusFromAppStore(transactionId) {
    try {
      this.logDebug("Getting subscription status from App Store", { transactionId });

      const subscriptionStatus = await this.getSubscriptionStatus(transactionId);

      if (subscriptionStatus.status === "NOT_FOUND") {
        this.logDebug("Subscription not found in App Store", { transactionId });
        return {
          isCancelledOrExpired: true,
          cancellationType: "expired",
          isInGracePeriod: false,
          isExpired: true,
          expiryTime: new Date(),
          finalStatus: "cancelled",
          autoRenewing: false,
          foundInAppStore: false
        };
      }

      const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);
      this.logDebug("App Store status analysis", cancellationInfo);

      return {
        ...cancellationInfo,
        foundInAppStore: true
      };

    } catch (error) {
      this.logError("Error getting subscription status from App Store:", error);
      return null;
    }
  }

  async syncAllSubscriptionsWithAppStore() {
    return await this.getAllSubscriptionsFromAppStore();
  }

  async compareAndUpdateLocalRecords(paymentRecord, appStoreStatus) {
    try {
      this.logDebug("Comparing local records with App Store status", {
        paymentId: paymentRecord._id,
        localStatus: paymentRecord.status,
        appStoreStatus: appStoreStatus.finalStatus
      });

      if (paymentRecord.status === appStoreStatus.finalStatus) {
        this.logDebug("Local status matches App Store - no update needed");
        return false;
      }

      this.logDebug("Local status differs from App Store - updating records", {
        currentLocalStatus: paymentRecord.status,
        newAppStoreStatus: appStoreStatus.finalStatus
      });

      const userId = paymentRecord.userId;
      
      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: appStoreStatus.finalStatus,
            cancelledAt: appStoreStatus.finalStatus === "cancelled" ? new Date() : paymentRecord.cancelledAt,
            cancellationType: appStoreStatus.cancellationType,
            lastChecked: new Date(),
            expiryDate: appStoreStatus.expiryTime
          }
        }
      );

      this.logDebug("Payment record updated to match App Store");

      const user = await User.findOne({ _id: userId });
      if (!user) {
        this.logDebug("User not found for payment record", { userId });
        return true;
      }

      const userSubscription = await UserSubscription.findOne({
        userId: userId,
        $or: [{ isActive: true }, { status: { $in: ["active", "grace_period", "cancelled"] } }]
      });

      if (appStoreStatus.finalStatus === "cancelled" && appStoreStatus.isExpired) {
        this.logDebug("App Store shows expired - downgrading user to free plan");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: false,
                cancelledAt: new Date(),
                cancellationReason: appStoreStatus.cancellationType,
                status: "cancelled",
                endDate: new Date(),
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.downgradeToFreePlan(userId, appStoreStatus.cancellationType);
        
      } else if (appStoreStatus.finalStatus === "cancelled" && !appStoreStatus.isExpired) {
        this.logDebug("App Store shows cancelled but not expired - turning off auto renew but keeping plan");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: appStoreStatus.cancellationType,
                status: "cancelled",
                endDate: appStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForCancelledButActive(userId, appStoreStatus.cancellationType, appStoreStatus.expiryTime);
        
      } else if (appStoreStatus.finalStatus === "grace_period") {
        this.logDebug("App Store shows grace period - updating status");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: appStoreStatus.cancellationType,
                status: "grace_period",
                endDate: appStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForGracePeriod(userId);
        
      } else if (appStoreStatus.finalStatus === "active") {
        this.logDebug("App Store shows active - ensuring local records are correct");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: appStoreStatus.autoRenewing,
                isActive: true,
                status: "active",
                endDate: appStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForActiveSubscription(userId, appStoreStatus.autoRenewing);
      }

      this.logDebug("Successfully updated local records to match App Store");
      return true;

    } catch (error) {
      this.logError("Error comparing and updating local records:", error);
      return false;
    }
  }

  async updateUserForActiveSubscription(userId, autoRenewing) {
    try {
      this.logDebug("Updating user for active subscription", { userId, autoRenewing });
      
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.isSubscribed = true;
        user.subscriptionStatus = 'active';
        user.autoRenew = autoRenewing;
        await user.save();
        
        this.logDebug("User updated for active subscription", {
          userId,
          subscriptionStatus: user.subscriptionStatus,
          autoRenew: user.autoRenew
        });
      }
    } catch (error) {
      this.logError("Error updating user for active subscription:", error);
    }
  }

  async updateUserForGracePeriod(userId) {
    try {
      this.logDebug("Updating user for grace period", { userId });
      
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = 'grace_period';
        user.planName = 'Premium (Grace Period)';
        await user.save();
        
        this.logDebug("User updated for grace period", {
          userId,
          newStatus: user.subscriptionStatus
        });
      }
    } catch (error) {
      this.logError("Error updating user for grace period:", error);
    }
  }

  async updateUserForCancelledButActive(userId, cancellationType, expiryTime) {
    try {
      this.logDebug("Updating user for cancelled but active subscription", { 
        userId, 
        cancellationType,
        expiryTime 
      });
      
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = 'cancelled';
        user.cancellationReason = cancellationType;
        user.isSubscribed = true;
        await user.save();
        
        this.logDebug("User updated for cancelled but active", {
          userId,
          subscriptionStatus: user.subscriptionStatus,
          isSubscribed: user.isSubscribed
        });
      }
    } catch (error) {
      this.logError("Error updating user for cancelled but active:", error);
    }
  }

  analyzeCancellationStatus(subscriptionData) {
    this.logDebug("Analyzing cancellation status", subscriptionData);

    if (!subscriptionData) {
      this.logDebug("No subscription data - skipping cancellation");
      return { 
        isCancelled: false, 
        willCancel: false,
        finalStatus: "active"
      };
    }

    if (subscriptionData.status === "NOT_FOUND") {
      this.logDebug("Subscription not found in Apple system - skipping cancellation");
      return { 
        isCancelled: false, 
        willCancel: false,
        finalStatus: "active"
      };
    }

    let finalStatus = "active";
    let isCancelled = false;
    let willCancel = false;
    let cancellationType = "active";
    let isExpired = false;
    let isInGracePeriod = false;
    let expiryTime = null;
    let autoRenewing = true;

    if (subscriptionData.status === "EXPIRED") {
      this.logDebug("Subscription status is EXPIRED");
      finalStatus = "cancelled";
      isCancelled = true;
      cancellationType = "expired";
      isExpired = true;
    } else if (subscriptionData.data && Array.isArray(subscriptionData.data)) {
      const latestTransaction = subscriptionData.data[0];
      if (latestTransaction) {
        expiryTime = new Date(latestTransaction.expiresDate);
        const now = new Date();
        isExpired = expiryTime < now;
        autoRenewing = latestTransaction.autoRenewStatus === 1;

        this.logDebug("Transaction analysis", {
          expiryTime,
          isExpired,
          autoRenewing,
          now
        });

        if (isExpired) {
          isInGracePeriod = this.isInGracePeriod(expiryTime);
          finalStatus = isInGracePeriod ? "grace_period" : "cancelled";
          isCancelled = true;
          cancellationType = "expired";
        } else if (!autoRenewing) {
          finalStatus = "cancelled";
          willCancel = true;
          cancellationType = "auto_renew_off";
        }
      }
    }

    return {
      isCancelledOrExpired: isCancelled || willCancel,
      cancellationType,
      autoRenewing,
      expiryTime,
      isExpired,
      isInGracePeriod,
      finalStatus,
      isCancelled,
      willCancel
    };
  }

  isInGracePeriod(expiryTime) {
    if (!expiryTime) return false;
    
    const gracePeriodDays = 7;
    const gracePeriodEnd = new Date(expiryTime);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
    const now = new Date();
    const isInGrace = now <= gracePeriodEnd;

    this.logDebug("Grace period calculation", {
      expiryTime,
      gracePeriodEnd,
      now,
      isInGrace
    });

    return isInGrace;
  }

  async processAppleSubscriptionCancellation(originalTransactionId) {
    try {
      this.logDebug("Processing cancellation check", { originalTransactionId });

      const subscriptionStatus = await this.getSubscriptionStatus(originalTransactionId);

      if (subscriptionStatus.status === "NOT_FOUND") {
        this.logDebug("Subscription not found in Apple system, skipping cancellation check");
        return false;
      }

      const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);
      this.logDebug("Cancellation analysis", cancellationInfo);

      if (cancellationInfo.isCancelled || cancellationInfo.willCancel) {
        this.logDebug("Subscription needs cancellation handling", cancellationInfo);
        await this.handleCancelledAppleSubscription(originalTransactionId, cancellationInfo);
        return true;
      }

      this.logDebug("Subscription is still active", { originalTransactionId });
      return false;
    } catch (error) {
      this.logError("Error processing Apple cancellation:", error);
      return false;
    }
  }

  async handleCancelledAppleSubscription(originalTransactionId, cancellationInfo) {
    try {
      this.logDebug("Handling cancelled subscription", { 
        originalTransactionId, 
        cancellationInfo 
      });

      const paymentRecord = await PaymentRecord.findOne({
        $or: [
          { originalTransactionId: originalTransactionId },
          { transactionId: originalTransactionId },
        ],
      });

      if (!paymentRecord) {
        this.logError("Payment record not found for transaction:", { originalTransactionId });
        return;
      }

      this.logDebug("Found payment record", {
        paymentId: paymentRecord._id,
        userId: paymentRecord.userId,
        currentStatus: paymentRecord.status
      });

      const userId = paymentRecord.userId;
      const user = await User.findOne({ _id: userId });

      if (!user) {
        this.logError("User not found:", { userId });
        return;
      }

      const newStatus = cancellationInfo.isInGracePeriod ? "grace_period" : "cancelled";
      this.logDebug("Updating payment record status", { newStatus });

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: newStatus,
            cancelledAt: new Date(),
            cancellationReason: cancellationInfo.cancellationType,
            lastChecked: new Date(),
            expiryDate: cancellationInfo.expiryTime
          }
        }
      );

      const activeSubscription = await UserSubscription.findOne({
        userId: userId,
        isActive: true,
      });

      if (activeSubscription) {
        this.logDebug("Found active subscription", {
          subscriptionId: activeSubscription._id
        });

        if (cancellationInfo.finalStatus === "cancelled" && cancellationInfo.isExpired) {
          this.logDebug("Immediate cancellation - downgrading to free plan");
          await this.downgradeToFreePlan(userId, cancellationInfo.cancellationType);
        } else if (cancellationInfo.finalStatus === "cancelled" && !cancellationInfo.isExpired) {
          this.logDebug("Cancelled but not expired - turning off auto renew");
          await UserSubscription.updateOne(
            { _id: activeSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: cancellationInfo.cancellationType,
                status: "cancelled",
                endDate: cancellationInfo.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
          await this.updateUserForCancelledButActive(userId, cancellationInfo.cancellationType, cancellationInfo.expiryTime);
        } else if (cancellationInfo.finalStatus === "grace_period") {
          this.logDebug("Grace period - keeping subscription active");
          await UserSubscription.updateOne(
            { _id: activeSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: cancellationInfo.cancellationType,
                status: "grace_period",
                endDate: cancellationInfo.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
          await this.updateUserForGracePeriod(userId);
        }
      }

      this.logDebug("Successfully handled cancellation", { originalTransactionId });

    } catch (error) {
      this.logError("Error handling Apple cancellation:", error);
      throw error;
    }
  }

  async downgradeToFreePlan(userId, cancellationType = "unknown") {
    try {
      this.logDebug("Downgrading user to free plan", { userId, cancellationType });
      
      const freePlan = await SubscriptionPlan.findOne({ type: "free" });

      if (!freePlan) {
        console.error("[AppleCancellationHandler] Free plan not found");
        return;
      }

      const user = await User.findOne({ _id: userId });
      if (user) {
        user.isSubscribed = false;
        user.subscriptionStatus = "cancelled";
        user.cancellationReason = cancellationType;
        user.planName = "Free";
        user.planType = "free";
        user.watermarkEnabled = true;
        user.totalCredits = 4;
        user.dailyCredits = 4;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 4;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
        user.planDowngradedAt = new Date();

        await user.save();
        this.logDebug("User successfully downgraded to free plan", { userId });
      }
    } catch (error) {
      this.logError("Error downgrading to free plan:", error);
      throw error;
    }
  }

  async checkAllActiveAppleSubscriptions() {
    try {
      this.logDebug("Checking all active Apple subscriptions");

      const activePayments = await PaymentRecord.find({
        paymentMethod: "apple",
        status: "completed",
        $or: [
          { expiryDate: { $gt: new Date() } },
          { expiryDate: { $exists: false } },
        ],
      });

      this.logDebug(`Found ${activePayments.length} active Apple payments to check`);

      for (const payment of activePayments) {
        try {
          const transactionId = payment.originalTransactionId || payment.transactionId;
          if (transactionId) {
            const wasCancelled = await this.processAppleSubscriptionCancellation(transactionId);
            this.logDebug(`Payment cancellation status`, {
              paymentId: payment._id,
              wasCancelled
            });
          } else {
            this.logDebug("No transaction ID found for payment", { paymentId: payment._id });
          }
        } catch (error) {
          this.logError(`Error checking payment ${payment._id}:`, error);
        }
      }

      this.logDebug("Completed checking all Apple subscriptions");

    } catch (error) {
      this.logError("Error checking all Apple subscriptions:", error);
      throw error;
    }
  }

  async getSubscriptionStats() {
    try {
      const totalSubscriptions = await PaymentRecord.countDocuments({ platform: "ios" });
      const activeSubscriptions = await PaymentRecord.countDocuments({ 
        platform: "ios", 
        status: "completed" 
      });
      const cancelledSubscriptions = await PaymentRecord.countDocuments({ 
        platform: "ios", 
        status: "cancelled" 
      });
      const gracePeriodSubscriptions = await PaymentRecord.countDocuments({ 
        platform: "ios", 
        status: "grace_period" 
      });

      return {
        total: totalSubscriptions,
        active: activeSubscriptions,
        cancelled: cancelledSubscriptions,
        gracePeriod: gracePeriodSubscriptions
      };
    } catch (error) {
      this.logError("Error getting subscription stats:", error);
      return {};
    }
  }
}

module.exports = AppleCancellationHandler;