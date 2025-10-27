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

  isBasePlanActive(basePlan) {
    if (!basePlan) return false;
    return basePlan.state === "ACTIVE" || basePlan.state === "BASE_PLAN_STATE_ACTIVE";
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

      const googleProducts = [];
      
      (response.data.subscriptions || []).forEach((sub) => {
        (sub.basePlans || []).forEach((basePlan) => {
          if (!this.isBasePlanActive(basePlan)) return;

          const priceObj = basePlan?.regionalConfigs?.["USD"]?.price;
          const uniqueSku = basePlan.basePlanId;
          
          googleProducts.push({
            sku: uniqueSku,
            productId: sub.productId,
            basePlanId: basePlan.basePlanId,
            name: sub.listings?.[0]?.title || sub.productId,
            description: sub.listings?.[0]?.description || "",
            status: basePlan.state,
            priceMicros: priceObj?.amountMicros || 0,
            fullObject: sub,
            basePlanObject: basePlan,
          });
        });
      });

      const existingPlans = await SubscriptionPlan.find().lean().exec();
      const updatePromises = [];

      for (const product of googleProducts) {
        if (!product?.sku || !product?.productId) continue;

        const existingPlan = existingPlans.find(
          (plan) => plan.googleProductId === product.sku
        );
        
        const planName = product.basePlanObject?.offerDetails?.offerTags?.[0]?.tag 
          || `${product.name} (${product.basePlanId})`
          || product.name;

        const planDetails = getPlanDetails(product.productId, product);

        const isActive = this.isFreePlan(product.productId) ? true : this.isBasePlanActive(product.basePlanObject);

        const planData = {
          googleProductId: product.sku,
          originalProductId: product.productId,
          name: planName,
          type: mapGoogleProductType(product.productId),
          description: planDetails.description,
          price: planDetails.price,
          totalCredits: calculateCredits(product.productId),
          imageGenerationCredits: calculateCredits(product.productId, "image"),
          promptGenerationCredits: calculateCredits(product.productId, "prompt"),
          features: parseFeatures(product.description),
          isActive,
          version: existingPlan ? existingPlan.version + 1 : 1,
          billingPeriod: mapBillingPeriod(product.basePlanId),
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
        if (!plan.googleProductId) continue;
        
        const shouldDeactivate = !googleProducts.find((p) => p.sku === plan.googleProductId) && 
          !this.isFreePlan(plan.originalProductId || plan.googleProductId);

        if (shouldDeactivate) {
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