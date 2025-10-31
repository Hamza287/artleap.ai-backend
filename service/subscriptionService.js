const PlanSync = require("./subscription_services/planSync");
const PlanManagement = require("./subscription_services/plansManagement");
const SubscriptionManagement = require("./subscription_services/subscriptionsManagement");
const PaymentProcessing = require("./subscription_services/paymentProcessing");
const NotificationService = require("./subscription_services/notificationService");
const CreditManagement = require("./subscription_services/creditsManagement");
const ApplePlanSync = require('./apple/applePlanSync');
const GoogleCancellationHandler = require("./plans_handlers/googleCancellationHandler");
const AppleCancellationHandler = require("./plans_handlers/appleCancellationHandler");

class SubscriptionService {
  constructor() {
    this.planSync = new PlanSync();
    this.applePlanSync = new ApplePlanSync();
    this.planManagement = new PlanManagement();
    this.subscriptionManagement = new SubscriptionManagement();
    this.paymentProcessing = new PaymentProcessing();
    this.notificationService = new NotificationService();
    this.creditManagement = new CreditManagement();
    this.googleCancellationHandler = new GoogleCancellationHandler();
    this.appleCancellationHandler = new AppleCancellationHandler();
  }

   async checkAndHandleSubscriptionCancellations() {
    try {
      await this.googleCancellationHandler.checkAllActiveSubscriptions();
      await this.appleCancellationHandler.checkAllActiveAppleSubscriptions();
    } catch (error) {
      console.error("[SubscriptionService] Error checking subscription cancellations:", error);
      throw error;
    }
  }

  async handleGoogleSubscriptionCancellation(purchaseToken) {
    try {
      return await this.googleCancellationHandler.processGoogleSubscriptionCancellation(purchaseToken);
    } catch (error) {
      console.error("[SubscriptionService] Error handling Google cancellation:", error);
      throw error;
    }
  }

  async handleAppleSubscriptionCancellation(originalTransactionId) {
    try {
      return await this.appleCancellationHandler.processAppleSubscriptionCancellation(originalTransactionId);
    } catch (error) {
      console.error("[SubscriptionService] Error handling Apple cancellation:", error);
      throw error;
    }
  }

  async syncPlansWithGooglePlay() {
    try {
      await this.planSync.syncPlansWithGooglePlay();
    } catch (error) {
      console.error("[SubscriptionService] syncPlansWithGooglePlay failed:", error);
      throw error;
    }
  }

   async syncPlansWithAppStore() {
    try {
      await this.applePlanSync.syncPlansWithAppStore();
    } catch (error) {
      console.error('[SubscriptionService] syncPlansWithAppStore failed:', error);
      throw error;
    }
  }

  async initializeDefaultPlans() {
    try {
      await this.planManagement.initializeDefaultPlans();
    } catch (error) {
      console.error("[SubscriptionService] initializeDefaultPlans failed:", error);
      throw error;
    }
  }

  async getAvailablePlans() {
    try {
      const plans = await this.planManagement.getAvailablePlans();
      return plans;
    } catch (error) {
      console.error("[SubscriptionService] getAvailablePlans failed:", error);
      throw error;
    }
  }

  async getPlanById(planId) {
    try {
      const plan = await this.planManagement.getPlanById(planId);
      return plan;
    } catch (error) {
      console.error("[SubscriptionService] getPlanById failed:", error);
      throw error;
    }
  }

  async getPlanByType(type) {
    try {
      const plan = await this.planManagement.getPlanByType(type);
      return plan;
    } catch (error) {
      console.error("[SubscriptionService] getPlanByType failed:", error);
      throw error;
    }
  }

  async getUserActiveSubscription(userId) {
    try {
      const subscription = await this.subscriptionManagement.getUserActiveSubscription(userId);
      return subscription;
    } catch (error) {
      console.error("[SubscriptionService] getUserActiveSubscription failed:", error);
      throw error;
    }
  }

  async updateUserData(userId, plan, subscription = null, isSubscribed = true, isTrial = false, carryOverCredits = false) {
    try {
      const user = await this.subscriptionManagement.updateUserData(userId, plan, subscription, isSubscribed, isTrial, carryOverCredits);
      return user;
    } catch (error) {
      console.error("[SubscriptionService] updateUserData failed:", error);
      throw error;
    }
  }

  async createSubscription(userId, planId, paymentMethod, isTrial = false) {
    try {
      const subscription = await this.subscriptionManagement.createSubscription(userId, planId, paymentMethod, isTrial);
      return subscription;
    } catch (error) {
      console.error("[SubscriptionService] createSubscription failed:", error);
      throw error;
    }
  }

  async cancelSubscription(userId, immediate) {
    try {
      const subscription = await this.subscriptionManagement.cancelSubscription(userId, immediate);
      return subscription;
    } catch (error) {
      console.error("[SubscriptionService] cancelSubscription failed:", error);
      throw error;
    }
  }

  async processExpiredSubscriptions() {
    try {
      await this.subscriptionManagement.processExpiredSubscriptions();
    } catch (error) {
      console.error("[SubscriptionService] processExpiredSubscriptions failed:", error);
      throw error;
    }
  }

  async renewSubscription(subscriptionId) {
    try {
      const subscription = await this.paymentProcessing.renewSubscription(subscriptionId);
      return subscription;
    } catch (error) {
      console.error("[SubscriptionService] renewSubscription failed:", error);
      throw error;
    }
  }

  async processPayment(userId, paymentMethod, amount) {
    try {
      const result = await this.paymentProcessing.processPayment(userId, paymentMethod, amount);
      return result;
    } catch (error) {
      console.error("[SubscriptionService] processPayment failed:", error);
      throw error;
    }
  }

  async sendSubscriptionNotification(userId, eventType, subscription) {
    try {
      await this.notificationService.sendSubscriptionNotification(userId, eventType, subscription);
    } catch (error) {
      console.error("[SubscriptionService] sendSubscriptionNotification failed:", error);
      throw error;
    }
  }

  async checkGenerationLimits(userId, generationType) {
    console.log("generate type is " + generationType);
    try {
      const result = await this.creditManagement.checkGenerationLimits(userId, generationType);
      return result;
    } catch (error) {
      console.error("[SubscriptionService] checkGenerationLimits failed:", error);
      throw error;
    }
  }

  async recordGenerationUsage(userId, generationType, num_images) {
    try {
      await this.creditManagement.recordGenerationUsage(userId, generationType, num_images);
    } catch (error) {
      console.error("[SubscriptionService] recordGenerationUsage failed:", error);
      throw error;
    }
  }

  async startFreeTrial(userId, paymentMethod) {
    try {
      const subscription = await this.subscriptionManagement.startFreeTrial(userId, paymentMethod);
      return subscription;
    } catch (error) {
      console.error("[SubscriptionService] startFreeTrial failed:", error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();