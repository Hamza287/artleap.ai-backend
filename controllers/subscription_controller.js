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

    let verificationResult = false;

    if (paymentMethod === "google_play" || paymentMethod === "google_pay") {
      verificationResult = await this.verifyGooglePurchase(verificationData);
    } else if (paymentMethod === "stripe") {
      verificationResult = await this.verifyStripePurchase(verificationData);
    } else if (paymentMethod === "apple") {
      verificationResult = await this.verifyApplePurchase(verificationData);
    } else {
      return res.status(400).json({
        success: false,
        error: "Unsupported payment method",
      });
    }

    if (!verificationResult || verificationResult.success === false) {
      return res.status(400).json({
        success: false,
        error: "Purchase verification failed",
      });
    }

    // ✅ Apple gets separate handling
    if (paymentMethod === "apple") {
      return this.subscribeApple(req, res, userId, planId, verificationResult, verificationData);
    }

    // ✅ Common transactionId extraction
    const txId =
      paymentMethod === "stripe"
        ? verificationData.paymentIntentId
        : paymentMethod === "google_play" || paymentMethod === "google_pay"
        ? verificationData.transactionId
        : null;

    // ✅ Check for duplicates (non-Apple flow)
    const existingPayment = await PaymentRecord.findOne({
      transactionId: txId,
      planId: planId,
    });
    if (existingPayment) {
      console.log("[subscribe] Duplicate subscription attempt ignored:", txId);

      return res.json({
        success: true,
        data: await SubscriptionService.getUserActiveSubscription(userId),
        message: "Already subscribed",
      });
    }

    // ✅ Create new subscription (non-Apple)
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

// ✅ Apple-only subscription flow
async subscribeApple(req, res, userId, planId, verificationResult, verificationData) {
  try {
    const txId = verificationResult.transactionId || verificationResult.originalTransactionId;
    const productId = verificationResult.productId;

    // 🔍 Check if both transactionId & productId already exist
    const existingPayment = await PaymentRecord.findOne({
      transactionId: txId,
      planId: planId``,
    });

    if (existingPayment) {
      console.log("[subscribeApple] Duplicate subscription attempt ignored:", txId, productId);

      return res.json({
        success: true,
        data: await SubscriptionService.getUserActiveSubscription(userId),
        message: "Already subscribed to this product",
      });
    }

    // ✅ Otherwise, create new Apple subscription
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

    return res.json({
      success: true,
      data: subscription,
      message: "Apple subscription created successfully",
    });
  } catch (error) {
    console.error("[subscribeApple] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
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

      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      if (paymentIntent.status === "succeeded") {
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
      const { receiptData, productId } = verificationData;

      if (!receiptData) {
        console.error("[verifyApplePurchase] Missing receiptData");
        return false;
      }

      // Case 1: StoreKit 2 signed JWS
      if (receiptData.startsWith("eyJ")) {
        const tx = this.decodeJWS(receiptData);
        console.log("[verifyApplePurchase] Decoded JWS payload:", tx);

        const isActive = this.isAppStoreSubscriptionActive(tx);
        if (tx.productId === productId && isActive) {
          console.log("[verifyApplePurchase] Verified using SK2 signed JWS");

          // ✅ return IDs so recordPayment can use them
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

      // Case 2: Legacy receipt
      const url =
        process.env.APPLE_SANDBOX === "true"
          ? "https://sandbox.itunes.apple.com/verifyReceipt"
          : "https://buy.itunes.apple.com/verifyReceipt";

      const response = await axios.post(url, {
        "receipt-data": receiptData,
        password: process.env.APPLE_SHARED_SECRET,
        "exclude-old-transactions": true,
      });

      const { status, latest_receipt_info } = response.data;
      if (status !== 0) {
        console.error(
          "[verifyApplePurchase] Receipt validation failed. Status:",
          status
        );
        return false;
      }

      const activeTransaction = latest_receipt_info.find(
        (tx) =>
          tx.product_id === productId &&
          new Date(parseInt(tx.expires_date_ms)) > new Date()
      );

      if (activeTransaction) {
        console.log("[verifyApplePurchase] Verified using legacy receipt");

        return {
          success: true,
          transactionId: activeTransaction.transaction_id,
          originalTransactionId: activeTransaction.original_transaction_id,
          productId: activeTransaction.product_id,
          expiresDate: activeTransaction.expires_date_ms,
        };
      }
      return false;
    } catch (error) {
      console.error(
        "[verifyApplePurchase] Apple verification error:",
        error.message
      );
      return false;
    }
  }

  // --- Helper to decode SK2 JWS ---
  decodeJWS(jws) {
    const parts = jws.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWS format");
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payload);
  }

  isAppStoreSubscriptionActive(transactionInfo) {
    if (!transactionInfo) return false;

    if (transactionInfo.revocationDate) return false;

    if (!transactionInfo.expiresDate) return true; // non-expiring

    const expires = new Date(transactionInfo.expiresDate);
    return expires > new Date();
  }

  async recordPayment(userId, planId, paymentMethod, verificationData) {
    const plan = await SubscriptionService.getPlanById(planId);
    console.log(
      "Recording payment for user:",
      userId,
      "plan:",
      planId,
      "transaction:",
      verificationData.transactionId ||
        verificationData.paymentIntentId ||
        verificationData.originalTransactionId
    );
    const paymentRecord = new PaymentRecord({
      userId,
      planId,
      paymentMethod,
      transactionId:
        paymentMethod === "stripe"
          ? verificationData.paymentIntentId
          : paymentMethod === "apple"
          ? verificationData.transactionId ||
            verificationData.originalTransactionId // <--- FIX HERE
          : verificationData.transactionId,
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
