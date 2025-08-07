const UserSubscription = require("../../models/user_subscription");
const User = require("../../models/user");
const mongoose = require("mongoose");
const NotificationService = require("./notificationService");
const PlanManagement = require("./plansManagement");
const PaymentProcessing = require("./paymentProcessing");
const createFreeSubscription = require("./../../controllers/auth_controller");
class SubscriptionManagement {
  constructor() {
    this.notificationService = new NotificationService();
    this.planManagement = new PlanManagement();
    this.paymentProcessing = new PaymentProcessing(this);
  }

  async getUserActiveSubscription(userId) {
  try {
    const paidSubscription = await UserSubscription.findOne({
      userId,
      isActive: true,
      endDate: { $gt: new Date() },
      isTrial: false,
    }).populate("planId").populate({ path: "userId" });

    return paidSubscription || null; // ← Return null instead of fake object
  } catch (error) {
    console.error(
      "[SubscriptionManagement] getUserActiveSubscription failed:",
      error
    );
    throw error;
  }
}


  async updateUserData(
    userId,
    plan,
    subscription = null,
    isSubscribed = true,
    isTrial = false,
    carryOverCredits = false
  ) {
    try {
      const user = await User.findOne({
        _id: mongoose.Types.ObjectId.isValid(userId)
          ? mongoose.Types.ObjectId(userId)
          : userId,
      });
      if (!user) {
        console.error("[SubscriptionManagement] User not found:", userId);
        throw new Error("User not found");
      }

      let remainingImageCredits = 0;
      let remainingPromptCredits = 0;
      let remainingTotalCredits = 0;

      if (carryOverCredits && user.isSubscribed && user.planType !== "free") {
        remainingImageCredits = Math.max(
          0,
          user.imageGenerationCredits - user.usedImageCredits
        );
        remainingPromptCredits = Math.max(
          0,
          user.promptGenerationCredits - user.usedPromptCredits
        );
        remainingTotalCredits = Math.max(
          0,
          user.totalCredits - (user.usedImageCredits + user.usedPromptCredits)
        );
      }

      user.currentSubscription = subscription ? subscription._id : null;
      user.subscriptionStatus = isSubscribed ? "active" : "cancelled";
      user.isSubscribed = isSubscribed;
      user.watermarkEnabled = plan.type === "free";
      user.hasActiveTrial = isTrial;
      user.planName = plan.name;
      user.planType = plan.type;

      if (plan.type === "free") {
        user.totalCredits = 10;
        user.dailyCredits = 10;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 10;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
      } else {
        if (carryOverCredits) {
          user.imageGenerationCredits =
            remainingImageCredits + plan.imageGenerationCredits;
          user.promptGenerationCredits =
            remainingPromptCredits + plan.promptGenerationCredits;
          user.totalCredits = remainingTotalCredits + plan.totalCredits;
        } else {
          user.imageGenerationCredits = plan.imageGenerationCredits;
          user.promptGenerationCredits = plan.promptGenerationCredits;
          user.totalCredits = plan.totalCredits;
        }
        user.dailyCredits = 0;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
      }

      await user.save();
      console.debug(
        "[SubscriptionManagement] User data updated for user:",
        userId
      );
      return user;
    } catch (error) {
      console.error("[SubscriptionManagement] updateUserData failed:", error);
      throw error;
    }
  }

  async createSubscription(userId, planId, paymentMethod, isTrial = false) {
    try {
      const user = await User.findOne({
        _id: mongoose.Types.ObjectId.isValid(userId)
          ? mongoose.Types.ObjectId(userId)
          : userId,
      });
      if (!user) {
        console.error("[SubscriptionManagement] User not found:", userId);
        throw new Error("User not found");
      }

      const plan = await this.planManagement.getPlanById(planId);
      if (!plan) {
        console.error("[SubscriptionManagement] Plan not found:", planId);
        throw new Error("Plan not found");
      }

      if (isTrial && plan.type !== "trial") {
        console.error("[SubscriptionManagement] Invalid trial plan:", planId);
        throw new Error("Only trial plans can be marked as trial");
      }

      const activeSub = await this.getUserActiveSubscription(userId);
      console.log(activeSub);
      let subscription;

      if (activeSub && !isTrial) {
        subscription = activeSub;
        subscription.planId = planId;
        subscription.startDate = new Date();

        if (plan.type === "basic") {
          subscription.endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (plan.type === "standard") {
          subscription.endDate = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          );
        } else if (plan.type === "premium") {
          subscription.endDate = new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          );
        } else if (plan.type === "trial") {
          subscription.endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (plan.type === "free") {
          subscription.endDate = DateTime.now();
        }

        subscription.paymentMethod = paymentMethod;
        subscription.autoRenew = true;
        subscription.cancelledAt = null;
        subscription.planSnapshot = {
          name: plan.name,
          type: plan.type,
          price: plan.price,
          totalCredits: plan.totalCredits,
          imageGenerationCredits: plan.imageGenerationCredits,
          promptGenerationCredits: plan.promptGenerationCredits,
          features: plan.features,
          version: plan.version,
        };
        await subscription.save();

        await this.updateUserData(
          userId,
          plan,
          subscription,
          true,
          false,
          true
        );
        await this.notificationService.sendSubscriptionNotification(
          userId,
          "upgraded",
          subscription
        );
      } else {
        if (activeSub && !isTrial && activeSub.planId) {
          console.error(
            "[SubscriptionManagement] User already has active subscription:",
            userId
          );
          throw new Error("User already has an active subscription");
        }

        const startDate = new Date();
        let endDate = new Date();

        if (plan.type === "basic") {
          endDate.setDate(startDate.getDate() + 7);
        } else if (plan.type === "standard") {
          endDate.setMonth(startDate.getMonth() + 1);
        } else if (plan.type === "premium") {
          endDate.setFullYear(startDate.getFullYear() + 1);
        } else if (plan.type === "trial") {
          endDate.setDate(startDate.getDate() + 7);
        }

        subscription = new UserSubscription({
          userId,
          planId,
          startDate,
          endDate,
          isTrial,
          isActive: true,
          paymentMethod,
          autoRenew: !isTrial,
          planSnapshot: {
            name: plan.name,
            type: plan.type,
            price: plan.price,
            totalCredits: plan.totalCredits,
            imageGenerationCredits: plan.imageGenerationCredits,
            promptGenerationCredits: plan.promptGenerationCredits,
            features: plan.features,
            version: plan.version,
          },
        });

        await subscription.save();
        await this.updateUserData(
          userId,
          plan,
          subscription,
          true,
          isTrial,
          false
        );
        await this.notificationService.sendSubscriptionNotification(
          userId,
          isTrial ? "trial_started" : "new",
          subscription
        );
      }

      return subscription;
    } catch (error) {
      console.error(
        "[SubscriptionManagement] createSubscription failed:",
        error
      );
      throw error;
    }
  }

  async cancelSubscription(userId, immediate) {
    try {
      const subscription = await UserSubscription.findOne({
        userId,
        isActive: true,
        endDate: { $gt: new Date() },
        isTrial: false,
      });

      if (!subscription) {
        console.error(
          "[SubscriptionManagement] No active paid subscription found:",
          userId
        );
        throw new Error("No active paid subscription found");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        console.error("[SubscriptionManagement] User not found:", userId);
        throw new Error("User not found");
      }

      if (immediate) {
        subscription.isActive = true;
        subscription.cancelledAt = new Date();
        subscription.autoRenew = false;
        await subscription.save();

        const freePlan = await this.planManagement.getPlanByType("free");
        await this.updateUserData(userId, freePlan, null, false, false, false);
        await this.notificationService.sendSubscriptionNotification(
          userId,
          "cancelled",
          subscription
        );
      } else {
        subscription.autoRenew = false;
        await subscription.save();
        await this.notificationService.sendSubscriptionNotification(
          userId,
          "pending_cancellation",
          subscription
        );
      }

      return subscription;
    } catch (error) {
      console.error(
        "[SubscriptionManagement] cancelSubscription failed:",
        error
      );
      throw error;
    }
  }

  async processExpiredSubscriptions() {
    try {
      const now = new Date();
      const expiringSoon = await UserSubscription.find({
        endDate: { $lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
        autoRenew: true,
      }).populate("userId planId");

      for (const sub of expiringSoon) {
        await this.notificationService.sendSubscriptionNotification(
          sub.userId._id,
          "renewal_reminder",
          sub
        );
      }

      const expiredSubs = await UserSubscription.find({
        endDate: { $lte: now },
        autoRenew: true,
      }).populate("userId planId");

      for (const sub of expiredSubs) {
        if (sub.autoRenew === true) {
          try {
            const paymentSuccess = await this.paymentProcessing.processPayment(
              sub.userId._id,
              sub.paymentMethod,
              sub.planSnapshot.price || sub.planId.price
            );

            if (paymentSuccess) {
              const newSub = await this.paymentProcessing.renewSubscription(
                sub._id
              );
              await this.notificationService.sendSubscriptionNotification(
                sub.userId._id,
                "renewed",
                newSub
              );
            } else {
              await this.cancelSubscription(sub.userId._id, true);
              await this.notificationService.sendSubscriptionNotification(
                sub.userId._id,
                "payment_failed",
                sub
              );
            }
          } catch (error) {
            console.error(
              "[SubscriptionManagement] Error renewing subscription:",
              sub._id,
              error
            );
            await this.cancelSubscription(sub.userId._id, true);
            await this.notificationService.sendSubscriptionNotification(
              sub.userId._id,
              "payment_failed",
              sub
            );
          }
        } else {
          await this.cancelSubscription(sub.userId._id, true);
          await this.notificationService.sendSubscriptionNotification(
            sub.userId._id,
            "expired",
            sub
          );
        }
      }
    } catch (error) {
      console.error(
        "[SubscriptionManagement] processExpiredSubscriptions failed:",
        error
      );
      throw error;
    }
  }

  async startFreeTrial(userId, paymentMethod) {
    try {
      const trialPlan = await this.planManagement.getPlanByType("trial");
      if (!trialPlan) {
        console.error("[SubscriptionManagement] Trial plan not configured");
        throw new Error("Trial plan not configured");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        console.error("[SubscriptionManagement] User not found:", userId);
        throw new Error("User not found");
      }

      const previousTrial = await UserSubscription.findOne({
        userId,
        "planSnapshot.type": "trial",
      });

      if (previousTrial) {
        console.error(
          "[SubscriptionManagement] User already used trial:",
          userId
        );
        throw new Error("You've already used your free trial");
      }

      if (!paymentMethod) {
        console.error(
          "[SubscriptionManagement] Payment method required for trial"
        );
        throw new Error("Payment method required for trial");
      }

      const subscription = await this.createSubscription(
        userId,
        trialPlan._id,
        paymentMethod,
        true
      );
      return subscription;
    } catch (error) {
      console.error("[SubscriptionManagement] startFreeTrial failed:", error);
      throw error;
    }
  }
}

module.exports = SubscriptionManagement;
