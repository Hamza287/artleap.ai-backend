const SubscriptionService = require("../service/subscriptionService");
const HistoryService = require("../service/userHistoryService");
const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const PaymentRecord = require("../models/recordPayment_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class SubscriptionController {
  async getPlans(req, res) {
    try {
      const plans = await SubscriptionService.getAvailablePlans();
      console.log(plans);
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async syncPlans(req, res) {
    try {
      await SubscriptionService.syncPlansWithGooglePlay();
      res.json({ success: true, message: "Plans synchronized successfully" });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async subscribe(req, res) {
    try {
      const { userId, planId, paymentMethod, verificationData } = req.body;

      // Verify the purchase
      let isValid = false;
      console.log(`Payment method: ${paymentMethod}`);
      if (paymentMethod === "google_pay" || paymentMethod === "google_play") {
        isValid = await this.verifyGooglePurchase(verificationData);
      } else if (paymentMethod === "stripe") {
        isValid = await this.verifyStripePurchase(verificationData);
      } else if (paymentMethod === 'apple') {
        isValid = await this.verifyApplePurchase(verificationData);
      }else {
        return res.status(400).json({
          success: false,
          error: "Unsupported payment method",
        });
      }

      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: "Purchase verification failed",
        });
      }

      // Create subscription with plan snapshot
      const subscription = await SubscriptionService.createSubscription(
        userId,
        planId,
        paymentMethod,
        false,
      );

      // Record payment
      await this.recordPayment(userId, planId, paymentMethod, verificationData);

      // Record subscription in history
      await HistoryService.recordSubscription(userId, {
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: "active",
        paymentMethod,
        action: "subscription_created",
        planSnapshot: subscription.planSnapshot,
      });

      // Update credit usage
      await HistoryService.updateCreditUsage(userId);

      res.json({
        success: true,
        data: subscription,
        message: "Subscription created successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async verifyGooglePurchase(verificationData) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_KEY_PATH,
        scopes: ["https://www.googleapis.com/auth/androidpublisher"],
      });

      const authClient = await auth.getClient();
      google.options({ auth: authClient });

      const response = await androidpublisher.purchases.subscriptionsv2.get({
        packageName: process.env.PACKAGE_NAME,
        token: verificationData.purchaseToken,
      });

      const isActive =
        response.data.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE";
      const isTestPurchase = !!response.data.testPurchase;

      if (isActive && (isTestPurchase || response.data.paymentState === 1)) {
        if (
          response.data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING"
        ) {
          await androidpublisher.purchases.subscriptions.acknowledge({
            packageName: process.env.PACKAGE_NAME,
            subscriptionId: verificationData.productId,
            token: verificationData.purchaseToken,
          });
        }
        return true;
      } else {
        console.warn(
          "[verifyGooglePurchase] Payment NOT verified. Subscription state:",
          response.data.subscriptionState,
          "Payment state:",
          response.data.paymentState
        );
        return false;
      }
    } catch (error) {
      console.error(
        "[verifyGooglePurchase] Google verification error:",
        error.message || error
      );
      if (error.response?.data) {
        console.error("Google API Error Response:", error.response.data);
      }
      return false;
    }
  }

  async verifyStripePurchase(verificationData) {
    try {
      const { paymentIntentId } = verificationData;

      if (!paymentIntentId) {
        console.error("[verifyStripePurchase] Missing paymentIntentId");
        return false;
      }

      // Retrieve the Payment Intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      // Check if the payment is successful
      if (paymentIntent.status === "succeeded") {
        console.log(
          `[verifyStripePurchase] Payment Intent ${paymentIntentId} verified successfully`
        );
        return true;
      } else {
        console.warn(
          "[verifyStripePurchase] Payment NOT verified. Status:",
          paymentIntent.status
        );
        return false;
      }
    } catch (error) {
      console.error(
        "[verifyStripePurchase] Stripe verification error:",
        error.message || error
      );
      return false;
    }
  }

  async verifyApplePurchase(verificationData) {
    try {
      const { receiptData } = verificationData; // Base64-encoded receipt from App Store
      if (!receiptData) {
        console.error("[verifyApplePurchase] Missing receiptData");
        return false;
      }

      // Send receipt to Apple's /verifyReceipt endpoint
      const response = await axios.post(
        process.env.APPLE_SANDBOX
          ? "https://sandbox.itunes.apple.com/verifyReceipt"
          : "https://buy.itunes.apple.com/verifyReceipt",
        {
          "receipt-data": receiptData,
          password: process.env.APPLE_SHARED_SECRET, // Shared secret from App Store Connect
          "exclude-old-transactions": true,
        }
      );

      const { status, latest_receipt_info } = response.data;

      if (status !== 0) {
        console.error(
          "[verifyApplePurchase] Receipt validation failed. Status:",
          status
        );
        return false;
      }

      // Check for active subscription
      const activeTransaction = latest_receipt_info.find(
        (tx) =>
          tx.product_id === verificationData.productId &&
          new Date(tx.expires_date_ms) > new Date()
      );

      if (activeTransaction) {
        console.log(
          `[verifyApplePurchase] Receipt verified for productId: ${verificationData.productId}`
        );
        return true;
      } else {
        console.warn("[verifyApplePurchase] No active subscription found");
        return false;
      }
    } catch (error) {
      console.error(
        "[verifyApplePurchase] Apple verification error:",
        error.message || error
      );
      return false;
    }
  }

  async recordPayment(userId, planId, paymentMethod, verificationData) {
    const plan = await SubscriptionService.getPlanById(planId);
    const paymentRecord = new PaymentRecord({
      userId,
      planId,
      paymentMethod,
      transactionId:
        paymentMethod === 'stripe'
          ? verificationData.paymentIntentId
          : paymentMethod === 'apple'
          ? verificationData.originalTransactionId
          : verificationData.transactionId,
      amount: plan ? plan.price : verificationData.amount,
      platform: verificationData.platform || (paymentMethod === 'apple' ? 'ios' : 'android'),
      receiptData:
        paymentMethod === 'stripe'
          ? verificationData.paymentIntentId
          : paymentMethod === 'apple'
          ? verificationData.receiptData
          : verificationData.purchaseToken,
      status: 'completed',
      planSnapshot: plan
        ? {
            name: plan.name,
            type: plan.type,
            price: plan.price,
            totalCredits: plan.totalCredits,
            imageGenerationCredits: plan.imageGenerationCredits,
            promptGenerationCredits: plan.promptGenerationCredits,
            features: plan.features,
            version: plan.version,
          }
        : null,
    });

    await paymentRecord.save();
  }

  async startTrial(req, res) {
    try {
      const { paymentMethod } = req.body;
      const userId = req.user.userId;

      const trial = await SubscriptionService.startFreeTrial(
        userId,
        paymentMethod
      );

      await HistoryService.recordSubscription(userId, {
        planId: trial.planId,
        startDate: trial.startDate,
        endDate: trial.endDate,
        status: "trial",
        paymentMethod,
        action: "trial_started",
        planSnapshot: trial.planSnapshot,
      });

      await HistoryService.updateCreditUsage(userId);

      res.json({
        success: true,
        data: trial,
        message: "Free trial started successfully",
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async cancelSubscription(req, res) {
    try {
      const { immediate, userId } = req.body;

      const currentSubscription =
        await SubscriptionService.getUserActiveSubscription(userId);

      const result = await SubscriptionService.cancelSubscription(
        userId,
        immediate
      );

      await HistoryService.recordSubscription(userId, {
        planId: currentSubscription?.planId,
        startDate: currentSubscription?.startDate,
        endDate: new Date(),
        status: immediate ? "cancelled" : "pending_cancellation",
        paymentMethod: currentSubscription?.paymentMethod,
        action: "subscription_cancelled",
        adminNotes: immediate
          ? "Immediate cancellation"
          : "End of period cancellation",
        planSnapshot: currentSubscription?.planSnapshot,
      });

      await HistoryService.updateCreditUsage(userId);

      res.json({
        success: true,
        data: result,
        message: immediate
          ? "Subscription cancelled immediately"
          : "Subscription set to not renew",
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getCurrentSubscription(req, res) {
    try {
      const userId = req.query.userId;

      const subscription = await SubscriptionService.getUserActiveSubscription(
        userId
      );

      if (!subscription) {
        return res.json({
          success: true,
          data: null,
          message: "No active subscription",
        });
      }

      res.json({ success: true, data: subscription });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async checkGeneration(req, res) {
    try {
      const { generationType } = req.params;
      const userId = req.user.userId;

      const limits = await SubscriptionService.checkGenerationLimits(
        userId,
        generationType
      );

      if (limits.allowed) {
        await HistoryService.updateCreditUsage(userId);
      }

      res.json({ success: true, data: limits });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getSubscriptionHistory(req, res) {
    try {
      const { userId } = req.params;
      const history = await HistoryService.getUserHistory(userId);

      res.json({
        success: true,
        data: history?.subscriptions || [],
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new SubscriptionController();
