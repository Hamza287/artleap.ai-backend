const UserSubscription = require("../../models/user_subscription");
const NotificationService = require("./notificationService");
const SubscriptionManagement = require("./subscriptionsManagement");

class PaymentProcessing {
  constructor() {
    this.notificationService = new NotificationService();
    this.subscriptionManagement = new SubscriptionManagement();
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

      if (oldSub.planSnapshot.type === "weekly") {
        endDate.setDate(startDate.getDate() + 7);
      } else if (oldSub.planSnapshot.type === "monthly") {
        endDate.setMonth(startDate.getMonth() + 1);
      } else if (oldSub.planSnapshot.type === "yearly") {
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
        true
      );
      console.debug("[PaymentProcessing] Subscription renewed:", subscriptionId);
      return newSub;
    } catch (error) {
      console.error("[PaymentProcessing] renewSubscription failed:", error);
      throw error;
    }
  }
}

module.exports = PaymentProcessing;