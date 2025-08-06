const SubscriptionPlan = require("../../models/subscriptionPlan_model");
const { google } = require("googleapis");
const androidpublisher = google.androidpublisher("v3");
const googleCredentials = require("../../google-credentials.json");
const mongoose = require("mongoose");
const packageName = process.env.PACKAGE_NAME || "com.XrDIgital.ImaginaryVerse";
const {
  mapGoogleProductType,
  mapBillingPeriod,
  calculateCredits,
  parseFeatures,
  getPlanDetails,
} = require("./utils");

class PlanSync {
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
      console.error("[PlanSync] Failed to fetch billing client:", error);
      throw error;
    }
  }

  async checkDatabaseConnection() {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB connection not ready");
      }
      await mongoose.connection.db.admin().ping();
    } catch (error) {
      console.error("[PlanSync] Database connection check failed:", error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  isSubscriptionActive(subscription) {
    if (!subscription) return false;
    if (subscription.archived) return false;
    return (subscription.basePlans || []).some(
      (plan) => plan.state === "ACTIVE" || plan.state === "BASE_PLAN_STATE_ACTIVE"
    );
  }

  isFreePlan(sku) {
    return sku === 'free' || sku.includes('free');
  }

  async syncPlansWithGooglePlay() {
    try {
      await this.checkDatabaseConnection();
      const client = await this.getBillingClient();

      const response = await client.monetization.subscriptions.list({
        auth: this.auth,
        packageName,
      });

      const googleProducts = (response.data.subscriptions || []).map((sub) => {
        const basePlan = (sub.basePlans || [])[0];
        const priceObj = basePlan?.regionalConfigs?.["USD"]?.price;

        return {
          sku: sub.productId,
          basePlanId: basePlan.basePlanId,
          name: sub.listings?.[0]?.title || sub.productId,
          description: sub.listings?.[0]?.description || "",
          status: sub.state || basePlan?.state || null,
          priceMicros: priceObj?.amountMicros || 0,
          fullObject: sub,
        };
      });

      const existingPlans = await SubscriptionPlan.find().lean().exec();
      const updatePromises = [];

      for (const product of googleProducts) {
        if (!product?.sku) continue;

        const existingPlan = existingPlans.find(
          (plan) => plan.googleProductId === product.sku
        );
        const planDetails = getPlanDetails(product.sku, product);

        const isActive = this.isFreePlan(product.sku) 
          ? true 
          : this.isSubscriptionActive(product.fullObject);

        const planData = {
          googleProductId: product.sku,
          name: planDetails.name,
          type: mapGoogleProductType(product.sku),
          description: planDetails.description,
          price: planDetails.price,
          totalCredits: calculateCredits(product.sku),
          imageGenerationCredits: calculateCredits(product.sku, "image"),
          promptGenerationCredits: calculateCredits(product.sku, "prompt"),
          features: parseFeatures(product.description),
          isActive,
          version: existingPlan ? existingPlan.version + 1 : 1,
          billingPeriod: mapBillingPeriod(product.sku),
          basePlanId: product.basePlanId,
        };

        if (existingPlan) {
          updatePromises.push(
            SubscriptionPlan.findByIdAndUpdate(
              existingPlan._id,
              { $set: { ...planData, updatedAt: new Date() } }
            )
          );
        } else {
          updatePromises.push(SubscriptionPlan.create(planData));
        }
      }

      await Promise.all(updatePromises);

      const deactivationPromises = [];
      for (const plan of existingPlans) {
        if (
          !plan.googleProductId ||
          (!googleProducts.find((p) => p.sku === plan.googleProductId) && 
           !this.isFreePlan(plan.googleProductId))
        ) {
          deactivationPromises.push(
            SubscriptionPlan.findByIdAndUpdate(
              plan._id,
              { $set: { isActive: false, updatedAt: new Date() } }
            )
          );
        }
      }

      await Promise.all(deactivationPromises);

    } catch (error) {
      console.error("[PlanSync] Error syncing plans:", error);
      throw new Error(`Failed to sync plans with Google Play: ${error.message}`);
    }
  }
}

module.exports = PlanSync;