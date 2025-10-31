const UserSubscription = require("../../models/user_subscription");
const User = require("../../models/user");
const PaymentRecord = require("../../models/recordPayment_model");
const mongoose = require("mongoose");
const NotificationService = require("./notificationService");
const PlanManagement = require("./plansManagement");
const PaymentProcessing = require("./paymentProcessing");

class SubscriptionManagement {
  constructor() {
    this.notificationService = new NotificationService();
    this.planManagement = new PlanManagement();
    this.paymentProcessing = new PaymentProcessing(this);
  }

  async syncLocalSubscriptionStatus() {
    try {
      console.log("[SubscriptionManagement] Syncing local subscription status");
      
      const allSubscriptions = await UserSubscription.find({
        isActive: true
      }).populate("userId planId");

      let updated = 0;
      let errors = 0;

      for (const subscription of allSubscriptions) {
        try {
          const now = new Date();
          const user = await User.findById(subscription.userId._id);
          
          if (!user) {
            console.warn(`[SubscriptionManagement] User not found for subscription: ${subscription._id}`);
            continue;
          }

          // Check if subscription is expired but still marked as active
          if (subscription.endDate < now && subscription.isActive) {
            console.log(`[SubscriptionManagement] Subscription expired but still active: ${subscription._id}`);
            
            subscription.isActive = false;
            subscription.cancelledAt = new Date();
            await subscription.save();

            // Downgrade user to free plan
            const freePlan = await this.planManagement.getPlanByType("free");
            if (freePlan) {
              await this.updateUserData(
                subscription.userId._id,
                freePlan,
                null,
                false,
                false,
                false
              );
              updated++;
            }
          }

          // Check if user subscription status matches User model
          if (user.isSubscribed !== subscription.isActive) {
            console.log(`[SubscriptionManagement] Mismatch found for user ${user._id}: User.isSubscribed=${user.isSubscribed}, Subscription.isActive=${subscription.isActive}`);
            
            user.isSubscribed = subscription.isActive;
            user.subscriptionStatus = subscription.isActive ? 'active' : 'cancelled';
            await user.save();
            updated++;
          }

        } catch (error) {
          errors++;
          console.error(`[SubscriptionManagement] Error syncing subscription ${subscription._id}:`, error);
        }
      }

      console.log(`[SubscriptionManagement] Local subscription sync completed: ${updated} updated, ${errors} errors`);
      return { updated, errors };

    } catch (error) {
      console.error("[SubscriptionManagement] Error syncing local subscription status:", error);
      throw error;
    }
  }

  async cleanupOrphanedSubscriptions() {
    try {
      console.log("[SubscriptionManagement] Cleaning up orphaned subscriptions");
      
      // Find subscriptions without valid users
      const orphanedSubscriptions = await UserSubscription.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user"
          }
        },
        {
          $match: {
            "user.0": { $exists: false }
          }
        }
      ]);

      let deleted = 0;
      for (const subscription of orphanedSubscriptions) {
        await UserSubscription.deleteOne({ _id: subscription._id });
        deleted++;
      }

      // Find duplicate active subscriptions for same user
      const duplicateSubscriptions = await UserSubscription.aggregate([
        {
          $match: {
            isActive: true
          }
        },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
            subscriptions: { $push: "$$ROOT" }
          }
        },
        {
          $match: {
            count: { $gt: 1 }
          }
        }
      ]);

      let fixed = 0;
      for (const group of duplicateSubscriptions) {
        // Keep the most recent subscription, deactivate others
        const sortedSubscriptions = group.subscriptions.sort((a, b) => 
          new Date(b.startDate) - new Date(a.startDate)
        );
        
        for (let i = 1; i < sortedSubscriptions.length; i++) {
          await UserSubscription.updateOne(
            { _id: sortedSubscriptions[i]._id },
            {
              $set: {
                isActive: false,
                cancelledAt: new Date(),
                autoRenew: false
              }
            }
          );
          fixed++;
        }
      }

      console.log(`[SubscriptionManagement] Orphaned subscription cleanup completed: ${deleted} deleted, ${fixed} duplicates fixed`);
      return { deleted, fixed };

    } catch (error) {
      console.error("[SubscriptionManagement] Error cleaning up orphaned subscriptions:", error);
      throw error;
    }
  }

  async verifyUserSubscriptionStatus(userId) {
    try {
      console.log("[SubscriptionManagement] Verifying user subscription status", { userId });
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const activeSubscription = await this.getUserActiveSubscription(userId);
      
      if (activeSubscription && !user.isSubscribed) {
        console.log(`[SubscriptionManagement] Fixing user subscription status: user ${userId} has active subscription but isSubscribed=false`);
        user.isSubscribed = true;
        user.subscriptionStatus = 'active';
        await user.save();
        return { fixed: true, previousStatus: false, newStatus: true };
      }

      if (!activeSubscription && user.isSubscribed) {
        console.log(`[SubscriptionManagement] Fixing user subscription status: user ${userId} has no active subscription but isSubscribed=true`);
        user.isSubscribed = false;
        user.subscriptionStatus = 'cancelled';
        await user.save();
        return { fixed: true, previousStatus: true, newStatus: false };
      }

      return { fixed: false, currentStatus: user.isSubscribed };

    } catch (error) {
      console.error("[SubscriptionManagement] Error verifying user subscription status:", error);
      throw error;
    }
  }

  async getSubscriptionStats() {
    try {
      const totalSubscriptions = await UserSubscription.countDocuments();
      const activeSubscriptions = await UserSubscription.countDocuments({ 
        isActive: true,
        endDate: { $gt: new Date() }
      });
      const expiredSubscriptions = await UserSubscription.countDocuments({ 
        isActive: true,
        endDate: { $lte: new Date() }
      });
      const gracePeriodSubscriptions = await UserSubscription.countDocuments({ 
        isActive: true,
        autoRenew: false,
        cancelledAt: { $exists: true }
      });
      const trialSubscriptions = await UserSubscription.countDocuments({ 
        isActive: true,
        isTrial: true
      });

      return {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        gracePeriod: gracePeriodSubscriptions,
        trial: trialSubscriptions
      };
    } catch (error) {
      console.error("[SubscriptionManagement] Error getting subscription stats:", error);
      return {};
    }
  }

  async getSubscriptionIssues() {
    try {
      const issues = [];

      // Check for subscriptions without users
      const orphanedSubs = await UserSubscription.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user"
          }
        },
        {
          $match: {
            "user.0": { $exists: false }
          }
        }
      ]);

      if (orphanedSubs.length > 0) {
        issues.push({
          type: "orphaned_subscriptions",
          count: orphanedSubs.length,
          message: `Found ${orphanedSubs.length} subscriptions without valid users`
        });
      }

      // Check for expired but active subscriptions
      const expiredActiveSubs = await UserSubscription.countDocuments({
        isActive: true,
        endDate: { $lte: new Date() }
      });

      if (expiredActiveSubs > 0) {
        issues.push({
          type: "expired_but_active",
          count: expiredActiveSubs,
          message: `Found ${expiredActiveSubs} subscriptions that are expired but still marked as active`
        });
      }

      // Check for users with mismatched subscription status
      const mismatchedUsers = await User.aggregate([
        {
          $lookup: {
            from: "usersubscriptions",
            localField: "_id",
            foreignField: "userId",
            as: "subscriptions"
          }
        },
        {
          $match: {
            $or: [
              {
                isSubscribed: true,
                "subscriptions": {
                  $not: {
                    $elemMatch: {
                      isActive: true,
                      endDate: { $gt: new Date() }
                    }
                  }
                }
              },
              {
                isSubscribed: false,
                "subscriptions": {
                  $elemMatch: {
                    isActive: true,
                    endDate: { $gt: new Date() }
                  }
                }
              }
            ]
          }
        }
      ]);

      if (mismatchedUsers.length > 0) {
        issues.push({
          type: "status_mismatch",
          count: mismatchedUsers.length,
          message: `Found ${mismatchedUsers.length} users with mismatched subscription status`
        });
      }

      return issues;

    } catch (error) {
      console.error("[SubscriptionManagement] Error getting subscription issues:", error);
      return [];
    }
  }

  async getUserActiveSubscription(userId) {
    try {
      const paidSubscription = await UserSubscription.findOne({
        userId,
        isActive: true,
        endDate: { $gt: new Date() },
        isTrial: false,
      }).populate("planId").populate({ path: "userId" });

      return paidSubscription || null;
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

      const userSubscription = await UserSubscription.findOne({
        userId,
        isActive: true,
        endDate: { $gt: new Date() },
        isTrial: false,
      }).populate("planId").populate({ path: "userId" });

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
        user.totalCredits = 4;
        user.dailyCredits = 4;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 4;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
      } else {
        if (carryOverCredits) {
          user.imageGenerationCredits = remainingImageCredits + plan.imageGenerationCredits;
          user.promptGenerationCredits = remainingPromptCredits + plan.promptGenerationCredits;
          user.totalCredits = remainingTotalCredits + plan.totalCredits;

          if (userSubscription) {
            userSubscription.planSnapshot.totalCredits = remainingTotalCredits + plan.totalCredits;
            userSubscription.planSnapshot.imageGenerationCredits = remainingImageCredits + plan.imageGenerationCredits;
            userSubscription.planSnapshot.promptGenerationCredits = remainingPromptCredits + plan.promptGenerationCredits;
            await userSubscription.save();
          }
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
          subscription.endDate = new Date();
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
          autoRenew: true,
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

  async cancelSubscription(userId, immediate, allowExpired = false) {
    try {
      const query = {
        userId,
        isActive: true,
        isTrial: false,
      };

      if (!allowExpired) {
        query.endDate = { $gt: new Date() };
      }

      const subscription = await UserSubscription.findOne(query);

      if (!subscription) {
        console.warn(
          "[SubscriptionManagement] No active paid subscription found for cancellation:",
          userId
        );
        const user = await User.findOne({ _id: userId });
        if (!user) {
          console.error("[SubscriptionManagement] User not found:", userId);
          throw new Error("User not found");
        }
        const freePlan = await this.planManagement.getPlanByType("free");
        if (freePlan) {
          await this.updateUserData(userId, freePlan, null, false, false, false);
          await this.notificationService.sendSubscriptionNotification(
            userId,
            "cancelled",
            null
          );
        }
        return null;
      }

      if (!subscription.planId) {
        const freePlan = await this.planManagement.getPlanByType("free");
        if (freePlan) {
          subscription.planId = freePlan._id;
          subscription.planSnapshot = {
            name: freePlan.name,
            type: freePlan.type,
            price: freePlan.price,
            totalCredits: freePlan.totalCredits,
            imageGenerationCredits: freePlan.imageGenerationCredits,
            promptGenerationCredits: freePlan.promptGenerationCredits,
            features: freePlan.features,
            version: freePlan.version,
          };
          await subscription.save();
        }
      }

      if (immediate) {
        subscription.isActive = false;
        subscription.cancelledAt = new Date();
        subscription.autoRenew = false;
        subscription.endDate = new Date();
        await subscription.save();

        const freePlan = await this.planManagement.getPlanByType("free");
        if (freePlan) {
          await this.updateUserData(userId, freePlan, null, false, false, false);
        }
        await this.notificationService.sendSubscriptionNotification(
          userId,
          "cancelled_immediate",
          subscription
        );
      } else {
        subscription.autoRenew = false;
        subscription.cancelledAt = new Date();
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
        "[SubscriptionManagement] cancelSubscription failed for user:",
        userId,
        error
      );
      throw error;
    }
  }

  async processGracePeriodSubscriptions() {
    try {
      const now = new Date();
      const gracePeriodSubs = await UserSubscription.find({
        isActive: true,
        autoRenew: false,
        cancelledAt: { $exists: true },
        endDate: { $lte: now }
      }).populate("userId planId");

      for (const sub of gracePeriodSubs) {
        try {
          const gracePeriodEnd = new Date(sub.endDate);
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
          
          if (now > gracePeriodEnd) {
            sub.isActive = false;
            await sub.save();

            const freePlan = await this.planManagement.getPlanByType("free");
            if (freePlan) {
              await this.updateUserData(
                sub.userId._id,
                freePlan,
                null,
                false,
                false,
                false
              );
              await this.notificationService.sendSubscriptionNotification(
                sub.userId._id,
                "grace_period_ended",
                sub
              );
            }
          }
        } catch (error) {
          console.error(
            `[SubscriptionManagement] Error processing grace period subscription: ${sub._id}`,
            error
          );
        }
      }
    } catch (error) {
      console.error("[SubscriptionManagement] processGracePeriodSubscriptions failed:", error);
      throw error;
    }
  }

  async processExpiredSubscriptions() {
    try {
      const now = new Date();
      
      await this.processGracePeriodSubscriptions();

      const invalidSubscriptions = await UserSubscription.find({
        planId: null,
        isActive: true
      });
      
      for (const sub of invalidSubscriptions) {
        const freePlan = await this.planManagement.getPlanByType("free");
        if (freePlan) {
          sub.planId = freePlan._id;
          sub.planSnapshot = {
            name: freePlan.name,
            type: freePlan.type,
            price: freePlan.price,
            totalCredits: freePlan.totalCredits,
            imageGenerationCredits: freePlan.imageGenerationCredits,
            promptGenerationCredits: freePlan.promptGenerationCredits,
            features: freePlan.features,
            version: freePlan.version,
          };
          await sub.save();
        } else {
          await this.cancelSubscription(sub.userId, true, true);
        }
      }

      const expiringSoon = await UserSubscription.find({
        endDate: { $lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
        isActive: true,
        autoRenew: true,
        isTrial: false,
        planId: { $ne: null }
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
        isActive: true,
        isTrial: false,
        autoRenew: true,
        planId: { $ne: null }
      }).populate("userId planId");

      for (const sub of expiredSubs) {
        try {
          if (!sub.planId) {
            continue;
          }

          const price = sub.planSnapshot?.price || (sub.planId ? sub.planId.price : 0);
          
          if (!price && price !== 0) {
            await this.cancelSubscription(sub.userId._id, true, true);
            continue;
          }

          const paymentSuccess = await this.paymentProcessing.processPayment(
            sub.userId._id,
            sub.paymentMethod,
            price
          );

          if (paymentSuccess) {
            const plan = sub.planId;
            sub.startDate = new Date();

            if (plan.type === "basic") {
              sub.endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            } else if (plan.type === "standard") {
              sub.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            } else if (plan.type === "premium") {
              sub.endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            }

            sub.planSnapshot = {
              name: plan.name,
              type: plan.type,
              price: plan.price,
              totalCredits: plan.totalCredits,
              imageGenerationCredits: plan.imageGenerationCredits,
              promptGenerationCredits: plan.promptGenerationCredits,
              features: plan.features,
              version: plan.version,
            };

            await sub.save();
            await this.updateUserData(
              sub.userId._id,
              plan,
              sub,
              true,
              false,
              true
            );
            await this.notificationService.sendSubscriptionNotification(
              sub.userId._id,
              "renewed",
              sub
            );
          } else {
            await this.cancelSubscription(sub.userId._id, true, true);
          }
        } catch (error) {
          console.error(
            `[SubscriptionManagement] Error renewing subscription: ${sub._id}`,
            error
          );
          await this.cancelSubscription(sub.userId._id, true, true);
        }
      }

      const expiredNonAutoRenew = await UserSubscription.find({
        endDate: { $lte: now },
        isActive: true,
        $or: [{ isTrial: true }, { autoRenew: false }],
        planId: { $ne: null }
      }).populate("userId planId");

      for (const sub of expiredNonAutoRenew) {
        try {
          sub.isActive = false;
          sub.cancelledAt = new Date();
          await sub.save();

          const freePlan = await this.planManagement.getPlanByType("free");
          if (freePlan) {
            await this.updateUserData(
              sub.userId._id,
              freePlan,
              null,
              false,
              false,
              false
            );
            await this.notificationService.sendSubscriptionNotification(
              sub.userId._id,
              sub.isTrial ? "trial_expired" : "expired",
              sub
            );
          }
        } catch (error) {
          console.error(
            `[SubscriptionManagement] Error processing expired subscription: ${sub._id}`,
            error
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