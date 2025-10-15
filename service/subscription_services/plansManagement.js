const SubscriptionPlan = require("../../models/subscriptionPlan_model");
 const mongoose = require("mongoose");
 
class PlanManagement {
  async initializeDefaultPlans() {
    try {
      const plans = await SubscriptionPlan.countDocuments();
      if (plans === 0) {
        await this.createDefaultPlans();
      }
    } catch (error) {
      console.error("[PlanManagement] initializeDefaultPlans failed:", error);
      throw error;
    }
  }

  async createDefaultPlans() {
    const defaultPlans = [
      {
        name: "Free",
        type: "free",
       basePlanId: "Free",
        description: "Basic access with limited features",
        price: 0,
        totalCredits: 4,
        imageGenerationCredits: 0,
        promptGenerationCredits: 4,
        features: [
          "10 Text to image credits per day",
          "Watermarked images",
          "Basic generation features",
        ],
        isActive: true,
        version: 1,
        billingPeriod: "none",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Trial",
        type: "trial",
        basePlanId: "Trial",
        description: "You Can Use Our Premium Features For Free on Trial After Trial End you will be charged for Weekly Subscription Automatically",
        price: 0,
        totalCredits: 480,
        imageGenerationCredits: 480,
        promptGenerationCredits: 480,
        features: [
          "20 Image to Image credits per day",
          "No Watermarked images",
          "Premium generation features",
        ],
        isActive: true,
        version: 1,
        billingPeriod: "none",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    try {
      await SubscriptionPlan.deleteMany({ isDefault: true });
      const createdPlans = await SubscriptionPlan.insertMany(defaultPlans);
      return createdPlans;
    } catch (error) {
      console.error("[PlanManagement] Failed to create default plans:", error);
      throw error;
    }
  }

  async getAvailablePlans() {
    try {
      const plans = await SubscriptionPlan.find({ isActive: true }).select("-__v -createdAt -updatedAt");
      return plans;
    } catch (error) {
      console.error("[PlanManagement] getAvailablePlans failed:", error);
      throw error;
    }
  }


async getPlanById(planId) {
  try {
    let plan;

    if (mongoose.Types.ObjectId.isValid(planId)) {
      plan = await SubscriptionPlan.findById(planId);
    } else {
      plan = await SubscriptionPlan.findOne({ type: planId });
    }

    if (!plan) {
      throw new Error(`Subscription plan not found for id or type: ${planId}`);
    }

    return plan;
  } catch (error) {
    console.error("[PlanManagement] getPlanById failed:", error);
    throw error;
  }
}


  async getPlanByType(type) {
    try {
      const plan = await SubscriptionPlan.findOne({ type });
      return plan;
    } catch (error) {
      console.error("[PlanManagement] getPlanByType failed:", error);
      throw error;
    }
  }
}

module.exports = PlanManagement;