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
      // Validate transaction ID format first
      if (!this.isValidTransactionId(originalTransactionId)) {
        return { status: "INVALID_ID" };
      }

      const token = await this.generateToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${originalTransactionId}`;
      
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return { 
          status: "NOT_FOUND",
          errorCode: error.response?.data?.errorCode,
          errorMessage: error.response?.data?.errorMessage
        };
      }

      if (error.response?.status === 401) {
        throw new Error("Invalid App Store Connect API credentials");
      }

      this.logError("Error fetching subscription status:", error);
      return { 
        status: "ERROR", 
        error: error.message 
      };
    }
  }

  isValidTransactionId(transactionId) {
    if (!transactionId) return false;
    if (typeof transactionId !== 'string') return false;
    if (transactionId.length < 10) return false;
    
    // Apple transaction IDs are typically numeric
    return /^\d+$/.test(transactionId);
  }

  async getAllSubscriptionsFromAppStore() {
    try {
      const allPaymentRecords = await PaymentRecord.find({
        platform: "ios",
        $or: [
          { originalTransactionId: { $exists: true, $ne: null } },
          { transactionId: { $exists: true, $ne: null } }
        ]
      });

      const results = {
        processed: 0,
        updated: 0,
        errors: 0,
        details: []
      };

      for (const paymentRecord of allPaymentRecords) {
        try {
          const transactionId = paymentRecord.originalTransactionId || paymentRecord.transactionId;
          if (!transactionId) {
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

      return results;

    } catch (error) {
      this.logError("Error fetching all subscriptions from App Store:", error);
      throw error;
    }
  }

  async getSubscriptionStatusFromAppStore(transactionId) {
    try {
      const subscriptionStatus = await this.getSubscriptionStatus(transactionId);

      if (subscriptionStatus.status === "NOT_FOUND") {
        const shouldDowngrade = await this.shouldDowngradeNotFoundSubscription(transactionId);
        
        return {
          isCancelledOrExpired: shouldDowngrade,
          cancellationType: shouldDowngrade ? "subscription_not_found" : "active",
          isInGracePeriod: false,
          isExpired: shouldDowngrade,
          expiryTime: shouldDowngrade ? new Date() : null,
          finalStatus: shouldDowngrade ? "cancelled" : "active",
          autoRenewing: !shouldDowngrade,
          foundInAppStore: false
        };
      }

      if (subscriptionStatus.status === "INVALID_ID") {
        return {
          isCancelledOrExpired: false,
          cancellationType: "active",
          isInGracePeriod: false,
          isExpired: false,
          expiryTime: null,
          finalStatus: "active",
          autoRenewing: true,
          foundInAppStore: false
        };
      }

      const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);
      return {
        ...cancellationInfo,
        foundInAppStore: true
      };

    } catch (error) {
      this.logError("Error getting subscription status from App Store:", error);
      return null;
    }
  }

  async shouldDowngradeNotFoundSubscription(transactionId) {
    try {
      const paymentRecord = await PaymentRecord.findOne({
        $or: [
          { originalTransactionId: transactionId },
          { transactionId: transactionId }
        ]
      });

      if (!paymentRecord) {
        return false;
      }
      const createdAt = new Date(paymentRecord.createdAt);
      const now = new Date();
      const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
      
      if (paymentRecord.expiryDate) {
        const expiryDate = new Date(paymentRecord.expiryDate);
        return expiryDate < now && daysSinceCreation > 30;
      }
      
      return daysSinceCreation > 60;
    } catch (error) {
      this.logError("Error checking if should downgrade not found subscription:", error);
      return false;
    }
  }

  async syncAllSubscriptionsWithAppStore() {
    return await this.getAllSubscriptionsFromAppStore();
  }

  async compareAndUpdateLocalRecords(paymentRecord, appStoreStatus) {
    try {
      if (paymentRecord.status === appStoreStatus.finalStatus) {
        return false;
      }

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

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return true;
      }

      const userSubscription = await UserSubscription.findOne({
        userId: userId,
        $or: [{ isActive: true }, { status: { $in: ["active", "grace_period", "cancelled"] } }]
      });

      if (appStoreStatus.finalStatus === "cancelled" && appStoreStatus.isExpired) {
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: true,
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

      return true;

    } catch (error) {
      this.logError("Error comparing and updating local records:", error);
      return false;
    }
  }

  async updateUserForActiveSubscription(userId, autoRenewing) {
    try {
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.isSubscribed = true;
        user.subscriptionStatus = 'active';
        user.autoRenew = autoRenewing;
        await user.save();
      }
    } catch (error) {
      this.logError("Error updating user for active subscription:", error);
    }
  }

  async updateUserForGracePeriod(userId) {
    try {
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = 'grace_period';
        user.planName = 'Premium (Grace Period)';
        await user.save();
      }
    } catch (error) {
      this.logError("Error updating user for grace period:", error);
    }
  }

  async updateUserForCancelledButActive(userId, cancellationType, expiryTime) {
    try {
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = 'cancelled';
        user.cancellationReason = cancellationType;
        user.isSubscribed = true;
        await user.save();
      }
    } catch (error) {
      this.logError("Error updating user for cancelled but active:", error);
    }
  }

  analyzeCancellationStatus(subscriptionData) {
    if (!subscriptionData) {
      return { 
        isCancelled: false, 
        willCancel: false,
        finalStatus: "active"
      };
    }

    if (subscriptionData.status === "NOT_FOUND" || subscriptionData.status === "INVALID_ID") {
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
    
    return now <= gracePeriodEnd;
  }

  async processAppleSubscriptionCancellation(originalTransactionId) {
    try {
      const subscriptionStatus = await this.getSubscriptionStatus(originalTransactionId);

      if (subscriptionStatus.status === "NOT_FOUND" || subscriptionStatus.status === "INVALID_ID") {
        return false;
      }

      const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);

      if (cancellationInfo.isCancelled || cancellationInfo.willCancel) {
        await this.handleCancelledAppleSubscription(originalTransactionId, cancellationInfo);
        return true;
      }

      return false;
    } catch (error) {
      this.logError("Error processing Apple cancellation:", error);
      return false;
    }
  }

  async handleCancelledAppleSubscription(originalTransactionId, cancellationInfo) {
    try {
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

      const userId = paymentRecord.userId;
      const user = await User.findOne({ _id: userId });

      if (!user) {
        this.logError("User not found:", { userId });
        return;
      }

      const newStatus = cancellationInfo.isInGracePeriod ? "grace_period" : "cancelled";

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
        if (cancellationInfo.finalStatus === "cancelled" && cancellationInfo.isExpired) {
          await this.downgradeToFreePlan(userId, cancellationInfo.cancellationType);
        } else if (cancellationInfo.finalStatus === "cancelled" && !cancellationInfo.isExpired) {
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

    } catch (error) {
      this.logError("Error handling Apple cancellation:", error);
      throw error;
    }
  }

  async downgradeToFreePlan(userId, cancellationType = "unknown") {
    try {
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
      }
    } catch (error) {
      this.logError("Error downgrading to free plan:", error);
      throw error;
    }
  }

  async checkAllActiveAppleSubscriptions() {
    try {
      const activePayments = await PaymentRecord.find({
        paymentMethod: "apple",
        status: "completed",
        $or: [
          { expiryDate: { $gt: new Date() } },
          { expiryDate: { $exists: false } },
        ],
      });

      for (const payment of activePayments) {
        try {
          const transactionId = payment.originalTransactionId || payment.transactionId;
          if (transactionId) {
            await this.processAppleSubscriptionCancellation(transactionId);
          }
        } catch (error) {
          this.logError(`Error checking payment ${payment._id}:`, error);
        }
      }

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