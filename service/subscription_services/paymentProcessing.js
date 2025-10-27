const UserSubscription = require("../../models/user_subscription");
const NotificationService = require("./notificationService");
const SubscriptionManagement = require("./subscriptionsManagement");
const SubscriptionPlan = require("../../models/subscriptionPlan_model");
const User = require('./../../models/user');
const mongoose = require('mongoose');
class PaymentProcessing {
  constructor(subscriptionManagement) {
    this.notificationService = new NotificationService();
    this.subscriptionManagement = subscriptionManagement;
  }

  async processPayment(userId, paymentMethod, amount) {
    try {
      return true;
    } catch (error) {
      console.error("[PaymentProcessing] processPayment failed:", error);
      throw error;
    }
  }

  async renewSubscription(subscriptionId) {
    try {
      const oldSub = await UserSubscription.findById(subscriptionId).populate("planId userId");
      if (!oldSub) {
        console.error("[PaymentProcessing] Subscription not found:", subscriptionId);
        throw new Error("Subscription not found");
      }

      const startDate = new Date();
      let endDate = new Date();

      if (oldSub.planSnapshot.type === "basic") {
        endDate.setDate(startDate.getDate() + 7);
      } else if (oldSub.planSnapshot.type === "standard") {
        endDate.setMonth(startDate.getMonth() + 1);
      } else if (oldSub.planSnapshot.type === "premium") {
        endDate.setFullYear(startDate.getFullYear() + 1);
      }

      const newSub = new UserSubscription({
        userId: oldSub.userId._id,
        planId: oldSub.planId._id,
        startDate,
        endDate,
        isActive: true,
        paymentMethod: oldSub.paymentMethod,
        autoRenew: oldSub.autoRenew,
        planSnapshot: oldSub.planSnapshot,
      });

      await newSub.save();
      await this.subscriptionManagement.updateUserData(
        oldSub.userId._id,
        oldSub.planSnapshot,
        newSub,
        true,
        false,
        false,
      );
      return newSub;
    } catch (error) {
      console.error("[PaymentProcessing] renewSubscription failed:", error);
      throw error;
    }
  }

  //  async SetBackFreePlan(subscriptionId,userId) {
  //   try {
  //     const oldSub = await UserSubscription.findById(subscriptionId).populate("planId userId");
  //     const freePlan = await SubscriptionPlan.findOne({ type: 'free' });
  //     const existingUser = await User.findOne({
  //             _id: mongoose.Types.ObjectId.isValid(userId)
  //               ? mongoose.Types.ObjectId(userId)
  //               : userId,
  //           });
  //     if (!oldSub) {
  //       console.error("[SetBackFreePlan] Subscription not found:", subscriptionId);
  //       throw new Error("Subscription not found");
  //     }

  //     if (!freePlan) {
  //       console.error("[SetBackFreePlan] Free Plan Not Found:", subscriptionId);
  //       throw new Error("Subscription not found");
  //     }

  //     const setBackFree = new UserSubscription({
  //       userId: oldSub.userId._id,
  //       planId: freePlan._id,
  //       startDate: new Date(),
  //       endDate: new Date(8640000000000000), // Far future date
  //       isActive: true,
  //       isTrial: oldSub.isTrial,
  //       autoRenew: false,
  //       paymentMethod: oldSub.paymentMethod,
  //       planSnapshot: {
  //           name: freePlan.name,
  //           type: freePlan.type,
  //           price: freePlan.price,
  //           totalCredits: freePlan.totalCredits,
  //           imageGenerationCredits: freePlan.imageGenerationCredits,
  //           promptGenerationCredits: freePlan.promptGenerationCredits,
  //           features: freePlan.features,
  //           version: freePlan.version
  //       }
  //     });

  //     await setBackFree.save();

  //     existingUser.currentSubscription = freePlan._id;
  //     existingUser.subscriptionStatus = 'active';
  //     existingUser.planName = 'Free';
  //     existingUser.save();

  //     console.debug(" Subscription change back to Free :", subscriptionId);
  //   } catch (error) {
  //     console.error("Subscription change back to Free failed:", error);
  //     throw error;
  //   }
  // }
}

module.exports = PaymentProcessing;