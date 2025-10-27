const SubscriptionService = require("../service/subscriptionService");
const HistoryService = require("../service/userHistoryService");
const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const PaymentRecord = require("../models/recordPayment_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

const jwt = require("jsonwebtoken");

class SubscriptionController {
  async getPlans(req, res) {
    try {
      const plans = await SubscriptionService.getAvailablePlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async checkAllCancellations(req, res) {
    try {
      await SubscriptionService.checkAndHandleSubscriptionCancellations();
      
      res.json({
        success: true,
        message: "All subscription cancellations checked successfully"
      });
    } catch (error) {
      console.error("Error checking all cancellations:", error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
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

  async syncApplePlans(req, res) {
    try {
      await SubscriptionService.syncPlansWithAppStore();
      res.json({
        success: true,
        message: "Apple plans synchronized successfully",
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async subscribe(req, res) {
    try {
      const { userId, planId, paymentMethod, verificationData } = req.body;

      console.log(`[subscribe] Starting subscription process for user ${userId}, plan ${planId}, method ${paymentMethod}`);
      console.log(`[subscribe] Verification data:`, JSON.stringify(verificationData, null, 2));

      if (!planId) {
        console.log(`[subscribe] Missing planId in request`);
        return res.status(400).json({
          success: false,
          error: "Plan ID is required",
        });
      }

      let verificationResult = false;

      if (paymentMethod === "google_play" || paymentMethod === "google_pay") {
        console.log(`[subscribe] Verifying Google purchase`);
        verificationResult = await this.verifyGooglePurchase(verificationData);
      } else if (paymentMethod === "stripe") {
        console.log(`[subscribe] Verifying Stripe purchase`);
        verificationResult = await this.verifyStripePurchase(verificationData);
      } else if (paymentMethod === "apple") {
        console.log(`[subscribe] Verifying Apple purchase`);
        verificationResult = await this.verifyApplePurchase(verificationData);
      } else {
        console.log(`[subscribe] Unsupported payment method: ${paymentMethod}`);
        return res.status(400).json({
          success: false,
          error: "Unsupported payment method",
        });
      }

      console.log(`[subscribe] Verification result:`, verificationResult);

      if (!verificationResult || verificationResult.success === false) {
        console.log(`[subscribe] Purchase verification failed for user ${userId}`);
        return res.status(400).json({
          success: false,
          error: "Purchase verification failed",
        });
      }

      if (paymentMethod === "apple") {
        console.log(`[subscribe] Processing Apple subscription flow`);
        return this.subscribeApple(req, res, userId, planId, verificationResult, verificationData);
      }

      const txId =
        paymentMethod === "stripe"
          ? verificationData.paymentIntentId
          : paymentMethod === "google_play" || paymentMethod === "google_pay"
          ? verificationData.transactionId
          : null;

      console.log(`[subscribe] Checking for duplicate transaction: ${txId}`);

      const existingPayment = await PaymentRecord.findOne({
        transactionId: txId,
        planId: planId,
      });

      if (existingPayment) {
        console.log(`[subscribe] Duplicate subscription attempt ignored for transaction: ${txId}`);
        const currentSubscription = await SubscriptionService.getUserActiveSubscription(userId);
        return res.json({
          success: true,
          data: currentSubscription,
          message: "Already subscribed",
        });
      }

      console.log(`[subscribe] Creating new subscription for user ${userId}`);
      const subscription = await SubscriptionService.createSubscription(
        userId,
        planId,
        paymentMethod,
        false
      );

      await this.recordPayment(userId, planId, paymentMethod, {
        ...verificationData,
        transactionId: txId,
      });

      await HistoryService.recordSubscription(userId, {
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: "active",
        paymentMethod,
        action: "subscription_created",
        planSnapshot: subscription.planSnapshot,
      });

      await HistoryService.updateCreditUsage(userId);

      console.log(`[subscribe] Subscription successfully created for user ${userId}`);
      res.json({
        success: true,
        data: subscription,
        message: "Subscription created successfully",
      });
    } catch (error) {
      console.error(`[subscribe] Error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async subscribeApple(req, res, userId, planId, verificationResult, verificationData) {
    try {
      const txId = verificationResult.transactionId || verificationResult.originalTransactionId;
      const productId = verificationResult.productId;

      console.log(`[subscribeApple] Processing Apple subscription - Transaction: ${txId}, Product: ${productId}, Plan: ${planId}`);

      if (!planId) {
        console.log(`[subscribeApple] Missing planId for Apple subscription`);
        return res.status(400).json({
          success: false,
          error: "Plan ID is required for Apple subscription",
        });
      }

      const existingPayment = await PaymentRecord.findOne({
        transactionId: txId,
        planId: planId,
      });

      if (existingPayment) {
        console.log(`[subscribeApple] Duplicate Apple subscription ignored - Transaction: ${txId}, Plan: ${planId}`);
        const currentSubscription = await SubscriptionService.getUserActiveSubscription(userId);
        return res.json({
          success: true,
          data: currentSubscription,
          message: "Already subscribed to this product",
        });
      }

      console.log(`[subscribeApple] Creating new Apple subscription for user ${userId}, plan ${planId}`);
      
      try {
        const subscription = await SubscriptionService.createSubscription(
          userId,
          planId,
          "apple",
          false
        );

        await this.recordPayment(userId, planId, "apple", {
          ...verificationData,
          transactionId: txId,
          productId,
        });

        await HistoryService.recordSubscription(userId, {
          planId: subscription.planId,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          status: "active",
          paymentMethod: "apple",
          action: "subscription_created",
          planSnapshot: subscription.planSnapshot,
        });

        await HistoryService.updateCreditUsage(userId);

        console.log(`[subscribeApple] Apple subscription successfully created for user ${userId}`);
        return res.json({
          success: true,
          data: subscription,
          message: "Apple subscription created successfully",
        });
      } catch (subscriptionError) {
        console.error(`[subscribeApple] Error creating subscription:`, subscriptionError);
        
        if (subscriptionError.message.includes("Subscription plan not found")) {
          return res.status(400).json({
            success: false,
            error: "Invalid plan ID. Please check the plan configuration.",
          });
        }
        throw subscriptionError;
      }
    } catch (error) {
      console.error("[subscribeApple] Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async verifyGooglePurchase(verificationData) {
    try {
      console.log(`[verifyGooglePurchase] Starting verification`);
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

      console.log(`[verifyGooglePurchase] Google API response:`, JSON.stringify(response.data, null, 2));

      const isActive =
        response.data.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE";
      const isTestPurchase = !!response.data.testPurchase;

      console.log(`[verifyGooglePurchase] Active: ${isActive}, Test: ${isTestPurchase}, PaymentState: ${response.data.paymentState}`);

      if (isActive && (isTestPurchase || response.data.paymentState === 1)) {
        if (
          response.data.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING"
        ) {
          console.log(`[verifyGooglePurchase] Acknowledging pending subscription`);
          await androidpublisher.purchases.subscriptions.acknowledge({
            packageName: process.env.PACKAGE_NAME,
            subscriptionId: verificationData.productId,
            token: verificationData.purchaseToken,
          });
        }
        console.log(`[verifyGooglePurchase] Verification successful`);
        return true;
      } else {
        console.warn(
          `[verifyGooglePurchase] Payment NOT verified. Subscription state: ${response.data.subscriptionState}, Payment state: ${response.data.paymentState}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[verifyGooglePurchase] Google verification error: ${error.message || error}`
      );
      if (error.response?.data) {
        console.error("Google API Error Response:", error.response.data);
      }
      return false;
    }
  }

  async verifyStripePurchase(verificationData) {
    try {
      console.log(`[verifyStripePurchase] Starting verification`);
      const { paymentIntentId } = verificationData;

      if (!paymentIntentId) {
        console.error("[verifyStripePurchase] Missing paymentIntentId");
        return false;
      }

      console.log(`[verifyStripePurchase] Retrieving payment intent: ${paymentIntentId}`);
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      console.log(`[verifyStripePurchase] Payment intent status: ${paymentIntent.status}`);

      if (paymentIntent.status === "succeeded") {
        console.log(`[verifyStripePurchase] Verification successful`);
        return true;
      } else {
        console.warn(
          `[verifyStripePurchase] Payment NOT verified. Status: ${paymentIntent.status}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[verifyStripePurchase] Stripe verification error: ${error.message || error}`
      );
      return false;
    }
  }

  async verifyApplePurchase(verificationData) {
    try {
      console.log(`[verifyApplePurchase] Starting verification`);
      const { receiptData, productId } = verificationData;

      if (!receiptData) {
        console.error("[verifyApplePurchase] Missing receiptData");
        return false;
      }

      console.log(`[verifyApplePurchase] Product ID: ${productId}, Receipt data length: ${receiptData.length}`);

      if (receiptData.startsWith("eyJ")) {
        console.log(`[verifyApplePurchase] Processing StoreKit 2 JWS`);
        const tx = this.decodeJWS(receiptData);
        console.log(`[verifyApplePurchase] Decoded JWS payload:`, JSON.stringify(tx, null, 2));

        const isActive = this.isAppStoreSubscriptionActive(tx);
        console.log(`[verifyApplePurchase] Subscription active: ${isActive}, Product match: ${tx.productId === productId}`);

        if (tx.productId === productId && isActive) {
          console.log(`[verifyApplePurchase] JWS verification successful`);
          return {
            success: true,
            transactionId: tx.transactionId,
            originalTransactionId: tx.originalTransactionId,
            productId: tx.productId,
            expiresDate: tx.expiresDate,
          };
        }
        return false;
      }

      console.log(`[verifyApplePurchase] Processing legacy receipt`);
      const url =
        process.env.APPLE_SANDBOX === "true"
          ? "https://sandbox.itunes.apple.com/verifyReceipt"
          : "https://buy.itunes.apple.com/verifyReceipt";

      console.log(`[verifyApplePurchase] Using verification URL: ${url}`);
      const response = await axios.post(url, {
        "receipt-data": receiptData,
        password: process.env.APPLE_SHARED_SECRET,
        "exclude-old-transactions": true,
      });

      const { status, latest_receipt_info } = response.data;
      console.log(`[verifyApplePurchase] Apple response status: ${status}`);

      if (status !== 0) {
        console.error(
          `[verifyApplePurchase] Receipt validation failed. Status: ${status}`
        );
        return false;
      }

      console.log(`[verifyApplePurchase] Latest receipt info entries: ${latest_receipt_info?.length || 0}`);
      const activeTransaction = latest_receipt_info.find(
        (tx) =>
          tx.product_id === productId &&
          new Date(parseInt(tx.expires_date_ms)) > new Date()
      );

      if (activeTransaction) {
        console.log(`[verifyApplePurchase] Legacy receipt verification successful`);
        console.log(`[verifyApplePurchase] Active transaction:`, JSON.stringify(activeTransaction, null, 2));

        return {
          success: true,
          transactionId: activeTransaction.transaction_id,
          originalTransactionId: activeTransaction.original_transaction_id,
          productId: activeTransaction.product_id,
          expiresDate: activeTransaction.expires_date_ms,
        };
      }
      
      console.log(`[verifyApplePurchase] No active transaction found for product: ${productId}`);
      return false;
    } catch (error) {
      console.error(
        `[verifyApplePurchase] Apple verification error: ${error.message}`
      );
      return false;
    }
  }

  decodeJWS(jws) {
    console.log(`[decodeJWS] Decoding JWS token`);
    const parts = jws.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWS format");
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payload);
  }

  isAppStoreSubscriptionActive(transactionInfo) {
    if (!transactionInfo) {
      console.log(`[isAppStoreSubscriptionActive] No transaction info provided`);
      return false;
    }

    if (transactionInfo.revocationDate) {
      console.log(`[isAppStoreSubscriptionActive] Subscription revoked on: ${transactionInfo.revocationDate}`);
      return false;
    }

    if (!transactionInfo.expiresDate) {
      console.log(`[isAppStoreSubscriptionActive] No expiration date - assuming non-expiring`);
      return true;
    }

    const expires = new Date(transactionInfo.expiresDate);
    const now = new Date();
    const isActive = expires > now;
    
    console.log(`[isAppStoreSubscriptionActive] Expires: ${expires}, Now: ${now}, Active: ${isActive}`);
    return isActive;
  }

  async recordPayment(userId, planId, paymentMethod, verificationData) {
    try {
      console.log(`[recordPayment] Recording payment for user: ${userId}, plan: ${planId}, method: ${paymentMethod}`);
      
      const plan = await SubscriptionService.getPlanById(planId);
      const transactionId =
        paymentMethod === "stripe"
          ? verificationData.paymentIntentId
          : paymentMethod === "apple"
          ? verificationData.transactionId || verificationData.originalTransactionId
          : verificationData.transactionId;

      console.log(`[recordPayment] Transaction ID: ${transactionId}`);

      const paymentRecord = new PaymentRecord({
        userId,
        planId,
        paymentMethod,
        transactionId: transactionId,
        amount: plan ? plan.price : verificationData.amount,
        platform:
          verificationData.platform ||
          (paymentMethod === "apple" ? "ios" : "android"),
        receiptData:
          paymentMethod === "stripe"
            ? verificationData.paymentIntentId
            : paymentMethod === "apple"
            ? verificationData.receiptData
            : verificationData.purchaseToken,
        status: "completed",
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
      console.log(`[recordPayment] Payment record saved successfully for transaction: ${transactionId}`);
    } catch (error) {
      console.error(`[recordPayment] Error saving payment record:`, error);
      throw error;
    }
  }

  async startTrial(req, res) {
    try {
      const { paymentMethod } = req.body;
      const userId = req.user.userId;

      console.log(`[startTrial] Starting free trial for user: ${userId}, method: ${paymentMethod}`);

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

      console.log(`[startTrial] Free trial started successfully for user: ${userId}`);
      res.json({
        success: true,
        data: trial,
        message: "Free trial started successfully",
      });
    } catch (error) {
      console.error(`[startTrial] Error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async cancelSubscription(req, res) {
    try {
      const { immediate, userId } = req.body;

      console.log(`[cancelSubscription] Cancelling subscription for user: ${userId}, immediate: ${immediate}`);

      const currentSubscription =
        await SubscriptionService.getUserActiveSubscription(userId);

      console.log(`[cancelSubscription] Current subscription:`, JSON.stringify(currentSubscription, null, 2));

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

      console.log(`[cancelSubscription] Subscription cancelled successfully for user: ${userId}`);
      res.json({
        success: true,
        data: result,
        message: immediate
          ? "Subscription cancelled immediately"
          : "Subscription set to not renew",
      });
    } catch (error) {
      console.error(`[cancelSubscription] Error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getCurrentSubscription(req, res) {
    try {
      const userId = req.query.userId;

      console.log(`[getCurrentSubscription] Getting current subscription for user: ${userId}`);

      const subscription = await SubscriptionService.getUserActiveSubscription(
        userId
      );

      console.log(`[getCurrentSubscription] Found subscription:`, JSON.stringify(subscription, null, 2));

      if (!subscription) {
        console.log(`[getCurrentSubscription] No active subscription found for user: ${userId}`);
        return res.json({
          success: true,
          data: null,
          message: "No active subscription",
        });
      }

      res.json({ success: true, data: subscription });
    } catch (error) {
      console.error(`[getCurrentSubscription] Error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async checkGeneration(req, res) {
    try {
      const { generationType } = req.params;
      const userId = req.user.userId;

      console.log(`[checkGeneration] Checking generation limits for user: ${userId}, type: ${generationType}`);

      const limits = await SubscriptionService.checkGenerationLimits(
        userId,
        generationType
      );

      console.log(`[checkGeneration] Generation limits:`, JSON.stringify(limits, null, 2));

      if (limits.allowed) {
        await HistoryService.updateCreditUsage(userId);
      }

      res.json({ success: true, data: limits });
    } catch (error) {
      console.error(`[checkGeneration] Error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getSubscriptionHistory(req, res) {
    try {
      const { userId } = req.params;

      console.log(`[getSubscriptionHistory] Getting subscription history for user: ${userId}`);

      const history = await HistoryService.getUserHistory(userId);

      console.log(`[getSubscriptionHistory] History entries found: ${history?.subscriptions?.length || 0}`);

      res.json({
        success: true,
        data: history?.subscriptions || [],
      });
    } catch (error) {
      console.error(`[getSubscriptionHistory] Error:`, error);
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new SubscriptionController();