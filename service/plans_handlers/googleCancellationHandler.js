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
      console.error("[GoogleCancellationHandler] ❌ Failed to fetch billing client:", error);
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
      console.warn("[GoogleCancellationHandler] ⚠️ No subscription data found");
      return false;
    }

    const lineItem = subscription.lineItems?.[0];
    const autoRenewing = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? false;

    if (!autoRenewing) {
      await this.handleCancelledSubscription(purchaseToken, subscription);
      return true;
    }
    return false;

  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    console.error("[GoogleCancellationHandler] ❌ Error checking subscription:", message);

    if (message.includes("not found") || message.includes("invalid")) {
      await this.handleCancelledSubscription(purchaseToken, { reason: "expired_or_invalid" });
      return true;
    }

    return false;
  }
}


  async extractSubscriptionId(purchaseToken) {
    try {
      const paymentRecord = await PaymentRecord.findOne({ receiptData: purchaseToken });

      if (paymentRecord && paymentRecord.planSnapshot) {
        return paymentRecord.planSnapshot.googleProductId;
      }

      console.warn("[GoogleCancellationHandler] ⚠️ No matching payment record found for token:", purchaseToken);
      return null;
    } catch (error) {
      console.error("[GoogleCancellationHandler] ❌ Error extracting subscription ID:", error);
      return null;
    }
  }

  async handleCancelledSubscription(purchaseToken, subscriptionData) {
    try {
      const paymentRecord = await PaymentRecord.findOne({ receiptData: purchaseToken });

      if (!paymentRecord) {
        console.warn("[GoogleCancellationHandler] ⚠️ Payment record not found for token:", purchaseToken);
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
            isActive: false,
            cancelledAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error("[GoogleCancellationHandler] ❌ Error handling subscription cancellation:", error);
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
      console.error("[GoogleCancellationHandler] ❌ Failed to mark invalid token:", error);
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
      console.error("[GoogleCancellationHandler] ❌ Error checking all subscriptions:", error);
    }
  }
}

module.exports = GoogleCancellationHandler;
