const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const googleCredentials = require("../../google-credentials.json");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require("../../models/user");
const UserSubscription = require("../../models/user_subscription");
const SubscriptionPlan = require("../../models/subscriptionPlan_model");

class GoogleCancellationHandler {
  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    this.debug = true;
  }

  logDebug(message, data = null) {
    if (this.debug) {
      console.log(`[GoogleCancellationHandler][DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  logError(message, error) {
    console.error(`[GoogleCancellationHandler][ERROR] ${message}`, {
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });
  }

  async getBillingClient() {
    try {
      this.logDebug("Initializing Google Play Billing client");
      const authClient = await this.auth.getClient();
      this.logDebug("Billing client initialized successfully");
      return androidpublisher;
    } catch (error) {
      this.logError("Failed to fetch billing client:", error);
      throw new Error("Failed to initialize Google Play Billing client.");
    }
  }

  async getAllSubscriptionsFromPlayStore(packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      this.logDebug("Fetching all subscriptions from Play Store");
      
      const client = await this.getBillingClient();
      const allPaymentRecords = await PaymentRecord.find({
        platform: "android",
        receiptData: { $exists: true, $ne: null }
      });

      this.logDebug(`Found ${allPaymentRecords.length} payment records to check with Play Store`);

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
            purchaseToken: paymentRecord.receiptData,
            currentStatus: paymentRecord.status
          });

          const playStoreStatus = await this.getSubscriptionStatusFromPlayStore(paymentRecord.receiptData, packageName);
          
          if (playStoreStatus) {
            const needsUpdate = await this.compareAndUpdateLocalRecords(paymentRecord, playStoreStatus);
            if (needsUpdate) {
              results.updated++;
            }
            results.details.push({
              paymentId: paymentRecord._id,
              purchaseToken: paymentRecord.receiptData,
              localStatus: paymentRecord.status,
              playStoreStatus: playStoreStatus.finalStatus,
              updated: needsUpdate
            });
          }

          results.processed++;
          
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (error) {
          results.errors++;
          this.logError(`Error processing payment record ${paymentRecord._id}:`, error);
        }
      }

      this.logDebug("Completed syncing all subscriptions with Play Store", results);
      return results;

    } catch (error) {
      this.logError("Error fetching all subscriptions from Play Store:", error);
      throw error;
    }
  }

  async getSubscriptionStatusFromPlayStore(purchaseToken, packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      this.logDebug("Getting subscription status from Play Store", { purchaseToken });

      const client = await this.getBillingClient();
      const response = await client.purchases.subscriptionsv2.get({
        packageName,
        token: purchaseToken,
        auth: this.auth
      });

      const subscription = response.data;
      this.logDebug("Raw Play Store subscription data", subscription);

      if (!subscription) {
        this.logDebug("No subscription data found in Play Store");
        return null;
      }

      const lineItem = subscription.lineItems?.[0];
      if (!lineItem) {
        this.logDebug("No line items found in Play Store subscription");
        return null;
      }

      const cancellationInfo = this.analyzePlayStoreSubscriptionStatus(lineItem, subscription);
      this.logDebug("Play Store status analysis", cancellationInfo);

      return cancellationInfo;

    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      
      if (message.includes("not found") || message.includes("invalid")) {
        this.logDebug("Subscription not found in Play Store - treating as expired");
        return {
          isCancelledOrExpired: true,
          cancellationType: "expired",
          isInGracePeriod: false,
          isExpired: true,
          expiryTime: new Date(),
          finalStatus: "cancelled",
          autoRenewing: false,
          foundInPlayStore: false
        };
      }

      this.logError("Error getting subscription status from Play Store:", error);
      return null;
    }
  }

  analyzePlayStoreSubscriptionStatus(lineItem, subscription) {
    const now = new Date();
    
    const autoRenewing = lineItem.autoRenewingPlan?.autoRenewEnabled ?? false;
    this.logDebug("Play Store auto renewing status", { autoRenewing });
    
    const expiryTime = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;
    const isExpired = expiryTime ? expiryTime < now : true;
    this.logDebug("Play Store expiry check", { expiryTime, isExpired, currentTime: now });
    
    const cancellationReason = lineItem.canceledReason;
    const userCancellationTime = lineItem.userCancellationTime ? 
      new Date(lineItem.userCancellationTime) : null;
    this.logDebug("Play Store cancellation details", { cancellationReason, userCancellationTime });

    const isInGracePeriod = this.isInGracePeriod(expiryTime, isExpired, userCancellationTime);
    
    const isRefunded = lineItem.refunded ?? false;
    const isRevoked = subscription.revocationReason ? true : false;
    this.logDebug("Play Store additional status", { isRefunded, isRevoked });
    
    let isCancelledOrExpired = false;
    let cancellationType = "active";
    let finalStatus = "active";
    
    if (isExpired) {
      isCancelledOrExpired = true;
      cancellationType = "expired";
      finalStatus = "cancelled";
      this.logDebug("Play Store: Subscription EXPIRED");
    } else if (!autoRenewing && userCancellationTime) {
      isCancelledOrExpired = true;
      cancellationType = "user_cancelled";
      finalStatus = isInGracePeriod ? "grace_period" : "cancelled";
      this.logDebug("Play Store: User CANCELLED", { finalStatus });
    } else if (isRefunded) {
      isCancelledOrExpired = true;
      cancellationType = "refunded";
      finalStatus = "cancelled";
      this.logDebug("Play Store: Subscription REFUNDED");
    } else if (isRevoked) {
      isCancelledOrExpired = true;
      cancellationType = "revoked";
      finalStatus = "cancelled";
      this.logDebug("Play Store: Subscription REVOKED");
    } else if (cancellationReason) {
      isCancelledOrExpired = true;
      cancellationType = cancellationReason;
      finalStatus = "cancelled";
      this.logDebug("Play Store: Subscription cancelled with reason:", cancellationReason);
    } else if (autoRenewing) {
      finalStatus = "active";
      this.logDebug("Play Store: Subscription ACTIVE and auto-renewing");
    } else {
      finalStatus = "active";
      this.logDebug("Play Store: Subscription ACTIVE but not auto-renewing");
    }

    return {
      isCancelledOrExpired,
      cancellationType,
      autoRenewing,
      expiryTime,
      isExpired,
      isInGracePeriod,
      userCancellationTime,
      isRefunded,
      isRevoked,
      cancellationReason,
      finalStatus,
      foundInPlayStore: true
    };
  }

  async compareAndUpdateLocalRecords(paymentRecord, playStoreStatus) {
    try {
      this.logDebug("Comparing local records with Play Store status", {
        paymentId: paymentRecord._id,
        localStatus: paymentRecord.status,
        playStoreStatus: playStoreStatus.finalStatus
      });

      if (paymentRecord.status === playStoreStatus.finalStatus) {
        this.logDebug("Local status matches Play Store - no update needed");
        return false;
      }

      this.logDebug("Local status differs from Play Store - updating records", {
        currentLocalStatus: paymentRecord.status,
        newPlayStoreStatus: playStoreStatus.finalStatus
      });

      const userId = paymentRecord.userId;
      
      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: playStoreStatus.finalStatus,
            cancelledAt: playStoreStatus.finalStatus === "cancelled" ? new Date() : paymentRecord.cancelledAt,
            cancellationType: playStoreStatus.cancellationType,
            lastChecked: new Date(),
            expiryDate: playStoreStatus.expiryTime
          }
        }
      );

      this.logDebug("Payment record updated to match Play Store");

      const user = await User.findOne({ _id: userId });
      if (!user) {
        this.logDebug("User not found for payment record", { userId });
        return true;
      }

      const userSubscription = await UserSubscription.findOne({
        userId: userId,
        $or: [{ isActive: true }, { status: { $in: ["active", "grace_period", "cancelled"] } }]
      });

      if (playStoreStatus.finalStatus === "cancelled" && playStoreStatus.isExpired) {
        this.logDebug("Play Store shows expired - downgrading user to free plan");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: false,
                cancelledAt: new Date(),
                cancellationReason: playStoreStatus.cancellationType,
                status: "cancelled",
                endDate: new Date(),
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.downgradeToFreePlan(userId, playStoreStatus.cancellationType);
        
      } else if (playStoreStatus.finalStatus === "cancelled" && !playStoreStatus.isExpired) {
        this.logDebug("Play Store shows cancelled but not expired - turning off auto renew but keeping plan");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: playStoreStatus.cancellationType,
                status: "cancelled",
                endDate: playStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForCancelledButActive(userId, playStoreStatus.cancellationType, playStoreStatus.expiryTime);
        
      } else if (playStoreStatus.finalStatus === "grace_period") {
        this.logDebug("Play Store shows grace period - updating status");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                cancelledAt: new Date(),
                cancellationReason: playStoreStatus.cancellationType,
                status: "grace_period",
                endDate: playStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForGracePeriod(userId);
        
      } else if (playStoreStatus.finalStatus === "active") {
        this.logDebug("Play Store shows active - ensuring local records are correct");
        
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: playStoreStatus.autoRenewing,
                isActive: true,
                status: "active",
                endDate: playStoreStatus.expiryTime,
                lastUpdated: new Date()
              }
            }
          );
        }
        
        await this.updateUserForActiveSubscription(userId, playStoreStatus.autoRenewing);
      }

      this.logDebug("Successfully updated local records to match Play Store");
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

  async downgradeToFreePlan(userId, cancellationType = "unknown") {
    try {
      this.logDebug("Downgrading user to free plan", { userId, cancellationType });
      
      const freePlan = await SubscriptionPlan.findOne({ type: 'free' });
      
      if (!freePlan) {
        console.error("[GoogleCancellationHandler] Free plan not found");
        return;
      }

      const user = await User.findOne({ _id: userId });
       const userSubscription = await UserSubscription.findOne({
        userId: userId,
      });
      if (user && userSubscription) {
        const previousPlan = user.planType;
        
        user.isSubscribed = false;
        user.subscriptionStatus = 'cancelled';
        user.cancellationReason = cancellationType;
        user.planName = 'Free';
        user.planType = 'free';
        user.watermarkEnabled = true;
        user.totalCredits = 4;
        user.dailyCredits = 4;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 4;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
        user.planDowngradedAt = new Date();

        userSubscription.isActive = true;
        userSubscription.planId = freePlan._id;
        userSubscription.planSnapshot = {
          name: freePlan.name,
          type: freePlan.type,
          price: freePlan.price,
          features: freePlan.features,
          totalCredits: freePlan.totalCredits,
          imageGenerationCredits: freePlan.imageGenerationCredits,
          promptGenerationCredits: freePlan.promptGenerationCredits
        };
        
        await user.save();
        await userSubscription.save(); 


        this.logDebug("User downgraded to free plan", {
          userId,
          previousPlan,
          newPlan: user.planType,
          cancellationType
        });
      } else {
        console.warn("[GoogleCancellationHandler] User not found for downgrade:", userId);
      }
    } catch (error) {
      this.logError("Error downgrading to free plan:", error);
      throw error;
    }
  }

  isInGracePeriod(expiryTime, isExpired, userCancellationTime) {
    if (isExpired) {
      this.logDebug("Subscription expired - NO grace period");
      return false;
    }
    
    if (!expiryTime) return false;
    
    const now = new Date();
    const gracePeriodDays = 7;
    const gracePeriodEnd = new Date(expiryTime);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
    
    const isInGrace = now <= gracePeriodEnd;
    
    this.logDebug(`Grace period calculation`, {
      now,
      expiryTime,
      gracePeriodEnd,
      isInGrace,
      gracePeriodDays
    });
    
    return isInGrace;
  }

  async syncAllSubscriptionsWithPlayStore() {
    return await this.getAllSubscriptionsFromPlayStore();
  }

  async checkAllActiveSubscriptions() {
    return await this.getAllSubscriptionsFromPlayStore();
  }

  async forceExpireSubscription(purchaseToken) {
    this.logDebug("Force expiring subscription", { purchaseToken });
    
    const paymentRecord = await PaymentRecord.findOne({ receiptData: purchaseToken });
    if (paymentRecord) {
      await this.compareAndUpdateLocalRecords(paymentRecord, {
        isCancelledOrExpired: true,
        cancellationType: "force_expired",
        isInGracePeriod: false,
        isExpired: true,
        expiryTime: new Date(),
        finalStatus: "cancelled",
        autoRenewing: false,
        foundInPlayStore: true
      });
    }
  }
}

module.exports = GoogleCancellationHandler;