const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const mongoose = require("mongoose");
const SubscriptionPlan = require("./../../models/subscriptionPlan_model");
const {
  mapAppleProductType,
  mapAppleProductName,
  mapAppleBillingPeriod,
  mapAppleToGoogleProductId,
} = require("./../../utils/appleUtils");
const {
  calculateCredits,
  parseFeatures,
  getPlanDetails,
} = require("./../subscription_services/utils");

class ApplePlanSync {
  constructor() {
    this.appId = process.env.APPLE_APP_ID;
    this.issuerId = process.env.APPLE_ISSUER_ID;
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKey = fs.readFileSync(
      process.env.APPLE_PRIVATE_KEY_PATH,
      "utf8"
    );
  }

  async generateToken() {
    try {
      const now = Math.floor(Date.now() / 1000);
      return jwt.sign(
        {
          iss: this.issuerId, 
          iat: now, 
          exp: now + 20 * 60,
          aud: "appstoreconnect-v1",
        },
        this.privateKey,
        {
          algorithm: "ES256",
          header: { kid: this.keyId },
        }
      );
    } catch (error) {
      console.error("[ApplePlanSync] Failed to generate JWT:", error);
      throw new Error("Failed to generate App Store Connect API token");
    }
  }

  async checkDatabaseConnection() {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB connection not ready");
      }
      await mongoose.connection.db.admin().ping();
    } catch (error) {
      console.error("[ApplePlanSync] Database connection check failed:", error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  isSubscriptionActive(subscriptionAttributes) {
    return subscriptionAttributes.state === "APPROVED";
  }

  isFreePlan(productId) {
    return productId === "free" || productId.includes("free");
  }

  async syncPlansWithAppStore() {
    try {
      await this.checkDatabaseConnection();
      const token = await this.generateToken();
      const headers = { Authorization: `Bearer ${token}` };
      const baseURL = "https://api.appstoreconnect.apple.com/v1";

      // Fetch subscription groups
      const groupsResponse = await axios.get(
        `${baseURL}/apps/${this.appId}/subscriptionGroups`,
        { headers }
      );
      const groups = groupsResponse.data.data;

      const appleProducts = [];

      for (const group of groups) {
        const groupId = group.id;
        const subsResponse = await axios.get(
          `${baseURL}/subscriptionGroups/${groupId}/subscriptions`,
          { headers }
        );
        const subscriptions = subsResponse.data.data;

        for (const sub of subscriptions) {
          const subId = sub.id;
          const attributes = sub.attributes;
          const productId = attributes.productId;

          // Fetch localizations (en-US)
          const localizationsResponse = await axios.get(
            `${baseURL}/subscriptions/${subId}/subscriptionLocalizations`,
            { headers }
          );

          const localizationData = localizationsResponse.data.data || [];
          // Prefer en-US if available
          const enLocalization = localizationData.find(
            (loc) => loc.attributes.locale === "en-US"
          );
          const localization = enLocalization
            ? enLocalization.attributes
            : localizationData[0]?.attributes || {};
          const name = localization.name || attributes.name || productId;
          const description = localization.description || "";

          // Fetch price for USA (assuming prices match Google)
          const pricesResponse = await axios.get(
            `${baseURL}/subscriptions/${subId}/prices?include=subscriptionPricePoint,territory&filter[territory]=USA`,
            { headers }
          );
          const priceData = pricesResponse.data.data[0];
          const included = pricesResponse.data.included;
          const pricePoint = included.find(
            (item) => item.type === "subscriptionPricePoints"
          );
          const price = pricePoint
            ? parseFloat(pricePoint.attributes.customerPrice)
            : 0;

          appleProducts.push({
            productId,
            name,
            description,
            status: attributes.state,
            price,
            subscriptionPeriod: attributes.subscriptionPeriod,
            fullObject: sub,
          });
        }
      }

      const existingPlans = await SubscriptionPlan.find().lean().exec();
      const updatePromises = [];

      for (const product of appleProducts) {
        if (!product?.productId) continue;

        const type = mapAppleProductType(product.productId);
        const googleProductId = mapAppleToGoogleProductId(product.productId);
        let existingPlan = existingPlans.find(
          (plan) => plan.appleProductId === product.productId
        );

        if (!existingPlan && googleProductId) {
          existingPlan = existingPlans.find(
            (plan) => plan.googleProductId === googleProductId
          );
        }

        const planDetails = getPlanDetails(product.productId, product);

        const planData = {
          appleProductId: product.productId,
          googleProductId: googleProductId || existingPlan?.googleProductId,
          basePlanId: product.basePlanId,
          name: mapAppleProductName(product.productId),
          type,
          description: planDetails.description || product.description,
          price: planDetails.price || product.price,
          totalCredits: calculateCredits(product.productId),
          imageGenerationCredits: calculateCredits(product.productId, "image"),
          promptGenerationCredits: calculateCredits(
            product.productId,
            "prompt"
          ),
          features: parseFeatures(product.description),
          isActive:true,
          version: existingPlan ? existingPlan.version + 1 : 1,
          billingPeriod: mapAppleBillingPeriod(product.subscriptionPeriod),
        };

        if (existingPlan) {
          updatePromises.push(
            SubscriptionPlan.findByIdAndUpdate(existingPlan._id, {
              $set: { ...planData, updatedAt: new Date() },
            })
          );
        } else {
          updatePromises.push(SubscriptionPlan.create(planData));
        }
      }

      await Promise.all(updatePromises);

      const deactivationPromises = [];
      for (const plan of existingPlans) {
        if (
          plan.appleProductId &&
          !appleProducts.find((p) => p.productId === plan.appleProductId) &&
          !this.isFreePlan(plan.appleProductId)
        ) {
          deactivationPromises.push(
            SubscriptionPlan.findByIdAndUpdate(plan._id, {
              $set: { isActive: false, updatedAt: new Date() },
            })
          );
        }
      }

      await Promise.all(deactivationPromises);
    } catch (error) {
      console.error(
        "[ApplePlanSync] Error syncing plans:",
        error.response?.data || error.message
      );
      throw new Error(`Failed to sync plans with App Store: ${error.message}`);
    }
  }
}

module.exports = ApplePlanSync;
