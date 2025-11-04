const GooglePlanSyncService = require("./google/googlePlanSync");
const PlanManagement = require("./subscription_services/plansManagement");
const SubscriptionManagement = require("./subscription_services/subscriptionsManagement");
const PaymentProcessing = require("./subscription_services/paymentProcessing");
const NotificationService = require("./subscription_services/notificationService");
const CreditManagement = require("./subscription_services/creditsManagement");
const ApplePlanSync = require('./apple/applePlanSync');
const GoogleCancellationHandler = require("./google/googleCancellationHandler");
const AppleCancellationHandler = require("./plans_handlers/appleCancellationHandler");

class SubscriptionService {
  constructor() {
    this.planSync = new GooglePlanSyncService();
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
      await this.googleCancellationHandler.getAllSubscriptionsFromPlayStore();
      await this.appleCancellationHandler.checkAllActiveAppleSubscriptions();
      await this.subscriptionManagement.processExpiredSubscriptions();
      await this.subscriptionManagement.processGracePeriodSubscriptions();
      await this.syncAllSubscriptionStatus();
      await this.cleanupOrphanedSubscriptions();
    } catch (error) {
      console.error("[SubscriptionService] Error checking subscription cancellations:", error);
      throw error;
    }
  }

  async syncAllSubscriptionStatus() {
    try {
      const googleResults = await this.googleCancellationHandler.syncAllSubscriptionsWithPlayStore();
      const appleResults = await this.appleCancellationHandler.syncAllSubscriptionsWithAppStore();
      await this.subscriptionManagement.syncLocalSubscriptionStatus();
    } catch (error) {
      console.error("[SubscriptionService] Error syncing subscription status:", error);
      throw error;
    }
  }

  async cleanupOrphanedSubscriptions() {
    try {
      await this.subscriptionManagement.cleanupOrphanedSubscriptions();
      await this.paymentProcessing.cleanupOrphanedPaymentRecords();
    } catch (error) {
      console.error("[SubscriptionService] Error cleaning up orphaned subscriptions:", error);
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

  async forceSyncUserSubscription(userId) {
    try {
      const userSubscription = await this.subscriptionManagement.getUserActiveSubscription(userId);
  
      if (userSubscription && userSubscription.platform === 'android') {
        const paymentRecord = await this.paymentProcessing.getLatestPaymentRecord(userId);
        if (paymentRecord && paymentRecord.receiptData) {
          await this.googleCancellationHandler.processGoogleSubscriptionCancellation(paymentRecord.receiptData);
        }
      }
      
      if (userSubscription && userSubscription.platform === 'ios') {
        const paymentRecord = await this.paymentProcessing.getLatestPaymentRecord(userId);
        if (paymentRecord && paymentRecord.originalTransactionId) {
          await this.appleCancellationHandler.processAppleSubscriptionCancellation(paymentRecord.originalTransactionId);
        }
      }
      
      await this.subscriptionManagement.verifyUserSubscriptionStatus(userId);
    } catch (error) {
      console.error("[SubscriptionService] Error force syncing user subscription:", error);
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

  async getSubscriptionHealthReport() {
    try {
      const report = {
        timestamp: new Date(),
        googleSubscriptions: await this.googleCancellationHandler.getSubscriptionStats(),
        appleSubscriptions: await this.appleCancellationHandler.getSubscriptionStats(),
        localSubscriptions: await this.subscriptionManagement.getSubscriptionStats(),
        paymentRecords: await this.paymentProcessing.getPaymentStats(),
        issues: await this.subscriptionManagement.getSubscriptionIssues()
      };
      
      return report;
    } catch (error) {
      console.error("[SubscriptionService] Error getting subscription health report:", error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();