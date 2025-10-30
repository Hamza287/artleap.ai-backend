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
      console.error("[GoogleCancellationHandler] Failed to fetch billing client:", error);
      throw new Error("Failed to initialize Google Play Billing client.");
    }
  }

  async processGoogleSubscriptionCancellation(purchaseToken, packageName = "com.XrDIgital.ImaginaryVerse") {
    try {
      const client = await this.getBillingClient();

      const response = await client.purchases.subscriptionsv2.get({
        packageName,
        token: purchaseToken,
        auth: this.auth
      });

      const subscription = response.data;
      if (!subscription) {
        console.warn("[GoogleCancellationHandler] No subscription data found");
        return false;
      }

      const lineItem = subscription.lineItems?.[0];
      const autoRenewing = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;
      const expiryTime = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;

      if (!autoRenewing || this.isSubscriptionExpired(expiryTime)) {
        await this.handleCancelledSubscription(purchaseToken, subscription, expiryTime);
        return true;
      }
      
      return false;
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      console.error("[GoogleCancellationHandler] Error checking subscription:", message);

      if (message.includes("not found") || message.includes("invalid")) {
        await this.handleCancelledSubscription(purchaseToken, { reason: "expired_or_invalid" });
        return true;
      }

      return false;
    }
  }

  isSubscriptionExpired(expiryTime) {
    if (!expiryTime) return true;
    return expiryTime < new Date();
  }

  isInGracePeriod(expiryTime) {
    if (!expiryTime) return false;
    const gracePeriodDays = 7;
    const gracePeriodEnd = new Date(expiryTime);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
    return new Date() <= gracePeriodEnd;
  }

  async handleCancelledSubscription(purchaseToken, subscriptionData, expiryTime) {
    try {
      const paymentRecord = await PaymentRecord.findOne({ receiptData: purchaseToken });

      if (!paymentRecord) {
        console.warn("[GoogleCancellationHandler] Payment record not found for token:", purchaseToken);
        return;
      }

      const userId = paymentRecord.userId;
      const user = await User.findOne({ _id: userId });
      
      if (!user) {
        console.warn("[GoogleCancellationHandler] User not found:", userId);
        return;
      }

      const isGracePeriod = this.isInGracePeriod(expiryTime);
      
      await PaymentRecord.updateOne(
        { _id: paymentRecord._id },
        {
          $set: {
            status: isGracePeriod ? "grace_period" : "cancelled",
            cancelledAt: new Date(),
          },
        }
      );

      const activeSubscription = await UserSubscription.findOne({
        userId: userId,
        isActive: true
      });

      if (activeSubscription) {
        if (isGracePeriod) {
          await UserSubscription.updateOne(
            { userId, isActive: true },
            {
              $set: {
                autoRenew: false,
                isActive: true,
                cancelledAt: new Date(),
                endDate: expiryTime
              },
            }
          );
        } else {
          await UserSubscription.updateMany(
            { userId, isActive: true },
            {
              $set: {
                autoRenew: false,
                isActive: false,
                cancelledAt: new Date(),
              },
            }
          );
          
          await this.downgradeToFreePlan(userId);
        }
      }
    } catch (error) {
      console.error("[GoogleCancellationHandler] Error handling subscription cancellation:", error);
    }
  }

  async downgradeToFreePlan(userId) {
    try {
      const freePlan = await SubscriptionPlan.findOne({ type: 'free' });
      
      if (!freePlan) {
        console.error("[GoogleCancellationHandler] Free plan not found");
        return;
      }

      const user = await User.findOne({ _id: userId });
      if (user) {
        user.isSubscribed = false;
        user.subscriptionStatus = 'cancelled';
        user.planName = 'Free';
        user.planType = 'free';
        user.watermarkEnabled = true;
        user.totalCredits = 10;
        user.dailyCredits = 10;
        user.imageGenerationCredits = 0;
        user.promptGenerationCredits = 10;
        user.usedImageCredits = 0;
        user.usedPromptCredits = 0;
        user.lastCreditReset = new Date();
        
        await user.save();
      }
    } catch (error) {
      console.error("[GoogleCancellationHandler] Error downgrading to free plan:", error);
      throw error;
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
      console.error("[GoogleCancellationHandler] Error checking all subscriptions:", error);
    }
  }
}

module.exports = GoogleCancellationHandler;