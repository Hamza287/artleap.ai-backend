const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const googleCredentials = require("../../google-credentials.json");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require("../../models/user");
const UserSubscription = require("../../models/user_subscription");
const SubscriptionPlan = require("../../models/subscriptionPlan_model");

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildPlanSnapshot(plan) {
  return {
    name: plan?.name || "",
    type: plan?.type || "",
    price: num(plan?.price),
    totalCredits: num(plan?.totalCredits),
    imageGenerationCredits: num(plan?.imageGenerationCredits),
    promptGenerationCredits: num(plan?.promptGenerationCredits),
    features: Array.isArray(plan?.features) ? plan.features : [],
    version: (plan?.version ?? "").toString() || "1"
  };
}

class GoogleCancellationHandler {
  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"]
    });
    this.debug = true;
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
      await this.auth.getClient();
      return androidpublisher;
    } catch (error) {
      this.logError("Failed to fetch billing client:", error);
      throw new Error("Failed to initialize Google Play Billing client.");
    }
  }

  async getAllSubscriptionsFromPlayStore(packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      await this.getBillingClient();
      const allPaymentRecords = await PaymentRecord.find({
        platform: "android",
        receiptData: { $exists: true, $ne: null }
      });
      const results = { processed: 0, updated: 0, errors: 0, details: [] };

      for (const paymentRecord of allPaymentRecords) {
        try {
          const playStoreStatus = await this.getSubscriptionStatusFromPlayStore(
            paymentRecord.receiptData,
            packageName
          );

          if (playStoreStatus) {
            const needsUpdate = await this.compareAndUpdateLocalRecords(
              paymentRecord,
              playStoreStatus
            );
            if (needsUpdate) results.updated++;
            results.details.push({
              paymentId: paymentRecord._id,
              purchaseToken: paymentRecord.receiptData,
              localStatus: paymentRecord.status,
              playStoreStatus: playStoreStatus.finalStatus,
              updated: needsUpdate
            });
          }

          results.processed++;
          await new Promise((r) => setTimeout(r, 50));
        } catch (error) {
          results.errors++;
          this.logError(`Error processing payment record ${paymentRecord._id}:`, error);
        }
      }
      return results;
    } catch (error) {
      this.logError("Error fetching all subscriptions from Play Store:", error);
      throw error;
    }
  }

  async getSubscriptionStatusFromPlayStore(purchaseToken, packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      const client = await this.getBillingClient();
      const response = await client.purchases.subscriptionsv2.get({
        packageName,
        token: purchaseToken,
        auth: this.auth
      });

      const subscription = response.data;

      if (!subscription) return null;
      const lineItem = subscription.lineItems?.[0];
      if (!lineItem) return null;

      return this.analyzePlayStoreSubscriptionStatus(lineItem, subscription);
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      this.logError("PlayStore status fetch error", error);
      if (message.includes("not found") || message.includes("invalid")) {
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
      return null;
    }
  }

  analyzePlayStoreSubscriptionStatus(lineItem, subscription) {
    const now = new Date();
    const autoRenewing = lineItem.autoRenewingPlan?.autoRenewEnabled ?? false;
    const expiryTime = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;
    const isExpired = expiryTime ? expiryTime < now : true;
    const cancellationReason = lineItem.canceledReason;
    const userCancellationTime = lineItem.userCancellationTime ? new Date(lineItem.userCancellationTime) : null;
    const isInGracePeriod =
      !!userCancellationTime && !isExpired && expiryTime
        ? now <= new Date(new Date(expiryTime).setDate(expiryTime.getDate() + 7))
        : false;
    const isRefunded = lineItem.refunded ?? false;
    const isRevoked = !!subscription.revocationReason;

    let cancellationType = "active";
    let finalStatus = "active";

    if (isExpired) {
      cancellationType = "expired";
      finalStatus = "cancelled";
    } else if (!autoRenewing && userCancellationTime) {
      cancellationType = "user_cancelled";
      finalStatus = isInGracePeriod ? "grace_period" : "cancelled";
    } else if (isRefunded) {
      cancellationType = "refunded";
      finalStatus = "cancelled";
    } else if (isRevoked) {
      cancellationType = "revoked";
      finalStatus = "cancelled";
    } else if (cancellationReason) {
      cancellationType = cancellationReason;
      finalStatus = "cancelled";
    } else {
      finalStatus = "active";
    }

    return {
      isCancelledOrExpired: finalStatus !== "active",
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

      const user = await User.findById(userId);
      if (!user) return true;

      let userSubscription = await UserSubscription.findOne({
        userId: userId,
        $or: [{ isActive: true }, { status: { $in: ["active", "grace_period", "cancelled"] } }]
      }).populate("planId");

      if (playStoreStatus.finalStatus === "cancelled" && playStoreStatus.isExpired) {
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: true,
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
        return true;
      }

      if (playStoreStatus.finalStatus === "cancelled" && !playStoreStatus.isExpired) {
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: true,
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
        return true;
      }

      if (playStoreStatus.finalStatus === "grace_period") {
        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: false,
                isActive: true,
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
        return true;
      }

      if (playStoreStatus.finalStatus === "active") {
        const prevEnd = userSubscription?.endDate ? new Date(userSubscription.endDate) : null;
        const nextEnd = playStoreStatus.expiryTime ? new Date(playStoreStatus.expiryTime) : null;
        const expiryChanged = !!(prevEnd && nextEnd && nextEnd.getTime() !== prevEnd.getTime());

        if (userSubscription) {
          await UserSubscription.updateOne(
            { _id: userSubscription._id },
            {
              $set: {
                autoRenew: playStoreStatus.autoRenewing,
                isActive: true,
                status: "active",
                endDate: nextEnd,
                lastUpdated: new Date()
              }
            }
          );
        }

        await this.updateUserForActiveWithExpiryCheck(userId, userSubscription, expiryChanged);

        if (!userSubscription) {
          await this.ensureActiveSubscriptionRecord(userId, nextEnd);
        }

        return true;
      }

      return false;
    } catch (error) {
      this.logError("Error comparing and updating local records:", error);
      return false;
    }
  }

  async updateUserForActiveWithExpiryCheck(userId, userSubscriptionDoc, expiryChanged) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      let planDoc = null;
      if (userSubscriptionDoc?.planId) {
        planDoc =
          typeof userSubscriptionDoc.planId === "object" && userSubscriptionDoc.planId._id
            ? userSubscriptionDoc.planId
            : await SubscriptionPlan.findById(userSubscriptionDoc.planId);
      }
      if (!planDoc) {
        const activeSub = await UserSubscription.findOne({
          userId,
          isActive: true,
          status: "active"
        }).populate("planId");
        planDoc = activeSub?.planId || null;
      }
      if (!planDoc) return;

      const snap = buildPlanSnapshot(planDoc);

      if (expiryChanged) {
        const currentTotal = num(user.totalCredits, 0);
        const currentImg = num(user.imageGenerationCredits, 0);
        const currentPrompt = num(user.promptGenerationCredits, 0);

        user.totalCredits = currentTotal + num(planDoc.totalCredits, 0);
        user.imageGenerationCredits = currentImg + num(planDoc.imageGenerationCredits, 0);
        user.promptGenerationCredits = currentPrompt + num(planDoc.promptGenerationCredits, 0);
        user.lastCreditReset = new Date();

      } else {

      }

      user.isSubscribed = true;
      user.subscriptionStatus = "active";
      await user.save();

      if (userSubscriptionDoc) {
        await UserSubscription.updateOne(
          { _id: userSubscriptionDoc._id },
          { $set: { planSnapshot: snap, isActive: true } }
        );
      }
    } catch (error) {
      this.logError("Error updating user for active with expiry check:", error);
    }
  }

  async ensureActiveSubscriptionRecord(userId, endDate) {
    try {
      const existing = await UserSubscription.findOne({
        userId,
        isActive: true,
        status: "active"
      });
      if (existing) return;

      const paidSub = await UserSubscription.findOne({ userId }).sort({ createdAt: -1 }).populate("planId");
      if (!paidSub?.planId) return;

      const snap = buildPlanSnapshot(paidSub.planId);

      const sub = new UserSubscription({
        userId,
        planId: paidSub.planId._id,
        startDate: new Date(),
        endDate: endDate || new Date(),
        isTrial: false,
        isActive: true,
        paymentMethod: paidSub.paymentMethod || "google_play",
        autoRenew: true,
        status: "active",
        planSnapshot: snap
      });
      await sub.save();
    } catch (error) {
      this.logError("Error ensuring active subscription record:", error);
    }
  }

  async updateUserForGracePeriod(userId) {
    try {
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = "grace_period";
        await user.save();
      }
    } catch (error) {
      this.logError("Error updating user for grace period:", error);
    }
  }

  async updateUserForCancelledButActive(userId, cancellationType) {
    try {
      const user = await User.findOne({ _id: userId });
      if (user) {
        user.subscriptionStatus = "cancelled";
        user.cancellationReason = cancellationType;
        user.isSubscribed = true;
        await user.save();
      }
    } catch (error) {
      this.logError("Error updating user for cancelled but active:", error);
    }
  }

  async downgradeToFreePlan(userId, cancellationType = "unknown") {
    try {
      const [freePlan, user] = await Promise.all([
        SubscriptionPlan.findOne({ type: "free" }),
        User.findById(userId)
      ]);

      if (!freePlan) throw new Error("Free plan not configured");
      if (!user) throw new Error("User not found");

      const now = new Date();
      const freeSnapshot = buildPlanSnapshot(freePlan);

      await User.updateOne(
        { _id: userId },
        {
          $set: {
            isSubscribed: false,
            subscriptionStatus: "cancelled",
            cancellationReason: cancellationType,
            planName: freePlan.name || "Free",
            planType: "free",
            watermarkEnabled: true,
            totalCredits: 4,
            dailyCredits: 4,
            imageGenerationCredits: 0,
            promptGenerationCredits: 4,
            usedImageCredits: 0,
            usedPromptCredits: 0,
            lastCreditReset: now,
            planDowngradedAt: now
          }
        }
      );

      const latest = await UserSubscription.findOne({ userId }).sort({
        endDate: -1,
        createdAt: -1
      });

      if (latest) {
        await UserSubscription.updateOne(
          { _id: latest._id },
          {
            $set: {
              planId: freePlan._id,
              status: "cancelled",
              isActive: true,
              autoRenew: false,
              cancelledAt: now,
              endDate: now,
              planSnapshot: freeSnapshot,
              lastUpdated: now
            }
          }
        );
      } else {
        await UserSubscription.create({
          userId,
          planId: freePlan._id,
          startDate: now,
          endDate: now,
          isTrial: false,
          isActive: true,
          paymentMethod: "google_play",
          autoRenew: false,
          status: "cancelled",
          planSnapshot: freeSnapshot,
          lastUpdated: now
        });
      }

    } catch (error) {
      this.logError("Error downgrading to free plan:", error);
      throw error;
    }
  }

  isInGracePeriod(expiryTime, isExpired) {
    if (isExpired) return false;
    if (!expiryTime) return false;
    const now = new Date();
    const gracePeriodEnd = new Date(expiryTime);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
    return now <= gracePeriodEnd;
  }

  async syncAllSubscriptionsWithPlayStore() {
    return await this.getAllSubscriptionsFromPlayStore();
  }

  async checkAllActiveSubscriptions() {
    return await this.getAllSubscriptionsFromPlayStore();
  }

  async forceExpireSubscription(purchaseToken) {
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
