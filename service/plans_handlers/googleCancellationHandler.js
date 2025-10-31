const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const googleCredentials = require("../../google-credentials.json");
const PaymentRecord = require("../../models/recordPayment_model");
const User = require("../../models/user");
const UserSubscription = require("../../models/user_subscription");
const SubscriptionPlan = require("../../models/subscriptionPlan_model");

class GoogleCancellationHandler {
  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  async getBillingClient() {
    try {
      await this.auth.getClient();
      return androidpublisher;
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Failed to fetch billing client:",
        error
      );
      throw new Error("Failed to initialize Google Play Billing client.");
    }
  }

  async processGoogleSubscriptionCancellation(
    purchaseToken,
    packageName = "com.XrDIgital.ImaginaryVerse"
  ) {
    try {
      const client = await this.getBillingClient();

      const response = await client.purchases.subscriptionsv2.get({
        packageName,
        token: purchaseToken,
        auth: this.auth,
      });

      const subscription = response.data;

      if (!subscription) {
        console.warn(
          "[GoogleCancellationHandler] ⚠️ No subscription data found"
        );
        return false;
      }

      const lineItem = subscription.lineItems?.[0];
      const autoRenewing =
        lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;

      if (!autoRenewing) {
        await this.handleCancelledSubscription(purchaseToken, subscription);
        return true;
      }
      return false;
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      console.error(
        "[GoogleCancellationHandler] ❌ Error checking subscription:",
        message
      );

      if (message.includes("not found") || message.includes("invalid")) {
        await this.handleCancelledSubscription(purchaseToken, {
          reason: "expired_or_invalid",
        });
        return true;
      }

      return false;
    }
  }

  async extractSubscriptionId(purchaseToken) {
    try {
      const paymentRecord = await PaymentRecord.findOne({
        receiptData: purchaseToken,
      });

      if (paymentRecord && paymentRecord.planSnapshot) {
        return paymentRecord.planSnapshot.googleProductId;
      }

      console.warn(
        "[GoogleCancellationHandler] ⚠️ No matching payment record found for token:",
        purchaseToken
      );
      return null;
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Error extracting subscription ID:",
        error
      );
      return null;
    }
  }

  async handleCancelledSubscription(purchaseToken, subscriptionData) {
    try {
      const paymentRecord = await PaymentRecord.findOne({
        receiptData: purchaseToken,
      });

      if (!paymentRecord) {
        console.warn(
          "[GoogleCancellationHandler] ⚠️ Payment record not found for token:",
          purchaseToken
        );
        return;
      }

      const userId = paymentRecord.userId;

      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
          },
        }
      );

      await UserSubscription.updateMany(
        { userId, isActive: true },
        {
          $set: {
            autoRenew: false,
            isActive: true,
            cancelledAt: new Date(),
          },
        }
      );
      if (
        subscriptionData?.reason === "expired_or_invalid" ||
        paymentRecord.expiryDate < new Date()
      ) {
        console.log(
          `[GoogleCancellationHandler] ⚠️ Subscription expired for user ${userId}, switching to free plan...`
        );
        await this.shiftUserToFreePlan(userId);
      }
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Error handling subscription cancellation:",
        error
      );
    }
  }

  async shiftUserToFreePlan(userId) {
    try {
      const freePlan = await SubscriptionPlan.findOne({ type: "free" });

      if (!freePlan) {
        console.error(
          "[GoogleCancellationHandler] ❌ Free plan not found in database!"
        );
        return;
      }

      await UserSubscription.create({
        userId,
        planId: freePlan._id,
        startDate: new Date(),
        endDate: new Date(8640000000000000),
        isActive: true,
        isTrial: false,
        autoRenew: true,
        paymentMethod: "free",
        planSnapshot: {
            name: freePlan.name,
            type: freePlan.type,
            price: freePlan.price,
            totalCredits: freePlan.totalCredits,
            imageGenerationCredits: freePlan.imageGenerationCredits,
            promptGenerationCredits: freePlan.promptGenerationCredits,
            features: freePlan.features,
            version: freePlan.version
        },
      });

      await User.updateOne(
      { _id: userId },
      {
        $set: {
          currentSubscription: newFreeSub._id,
          planName: "Free",
          isSubscribed: false,
          subscriptionStatus: "expired",
          totalCredits: 4,
          dailyCredits: 4,
          usedImageCredits: 0,
          usedPromptCredits: 0,
          hasActiveTrial: false,
          watermarkEnabled: true,
        },
      }
    );

      console.log(
        `[GoogleCancellationHandler] ✅ User ${userId} successfully switched to Free plan with 4 credits.`
      );
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Failed to shift user to free plan:",
        error
      );
    }
  }

  async markInvalidToken(purchaseToken) {
    try {
      await PaymentRecord.updateOne(
        { receiptData: purchaseToken },
        {
          $set: {
            status: "invalid_token",
            cancelledAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Failed to mark invalid token:",
        error
      );
    }
  }

  async checkAllActiveSubscriptions() {
    try {
      const activePayments = await PaymentRecord.find({
        status: "completed",
        expiryDate: { $gt: new Date() },
        platform: "android",
      });
      for (const payment of activePayments) {
        await this.processGoogleSubscriptionCancellation(payment.receiptData);
      }
    } catch (error) {
      console.error(
        "[GoogleCancellationHandler] ❌ Error checking all subscriptions:",
        error
      );
    }
  }
}

module.exports = GoogleCancellationHandler;
