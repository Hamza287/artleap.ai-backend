const User = require("../../models/user");
const mongoose = require("mongoose");

class CreditManagement {
  async checkGenerationLimits(userId, generationType) {
    try {
      const user = await User.findOne({
        _id: mongoose.Types.ObjectId.isValid(userId) ? mongoose.Types.ObjectId(userId) : userId,
      }).populate("currentSubscription");

      if (!user) {
        console.error("[CreditManagement] User not found:", userId);
        throw new Error("User not found. Please check your account status.");
      }

      if (!user.isSubscribed) {
        if (generationType === "image") {
          console.error("[CreditManagement] Image generation requires premium subscription:", userId);
          throw new Error("Image generation requires a premium subscription");
        }

        if (user.dailyCredits < 2) {
          console.error("[CreditManagement] Daily credits exhausted:", userId);
          throw new Error("You've used all your daily credits. Credits reset daily.");
        }

        return {
          allowed: true,
          creditsUsed: 2,
          remaining: user.dailyCredits - 2,
          isSubscribed: false,
        };
      }

      if (user.currentSubscription) {
        const plan = user.currentSubscription.planSnapshot;
        const creditsNeeded = generationType === "image" ? 24 : 2;
        const creditsUsed = generationType === "image" ? user.usedImageCredits : user.usedPromptCredits;
        const maxCredits = generationType === "image" ? user.imageGenerationCredits : user.promptGenerationCredits;

        if (creditsUsed + creditsNeeded > maxCredits) {
          throw new Error(
            `You've reached your ${generationType} generation limit for this billing period. ` +
              `Used ${creditsUsed}/${maxCredits} credits.`
          );
        }

        return {
          allowed: true,
          creditsUsed: creditsNeeded,
          remaining: maxCredits - creditsUsed - creditsNeeded,
          isSubscribed: true,
          planName: plan.name,
        };
      }

      throw new Error("Subscription status could not be determined");
    } catch (error) {
      console.error("[CreditManagement] checkGenerationLimits failed:", error);
      throw error;
    }
  }

  async recordGenerationUsage(userId, generationType, num_images) {

    try {
      const user = await User.findOne({
        _id: mongoose.Types.ObjectId.isValid(userId) ? mongoose.Types.ObjectId(userId) : userId,
      });
      if (!user) {
        console.error("[CreditManagement] User not found:", userId);
        throw new Error("User not found");
      }

      if (user.isSubscribed && user.planType !== "free") {
        if (generationType === "image") {
          user.usedImageCredits += 24 * num_images;
          user.totalCredits -= 24 * num_images;
        } else {
          user.usedPromptCredits += 2 * num_images;
          user.totalCredits -= 2 * num_images;
        }
      } else {
        user.usedPromptCredits += 2 * num_images;
        user.dailyCredits -= 2 * num_images;
        user.totalCredits -= 2 * num_images;
      }

      await user.save();
    } catch (error) {
      console.error("[CreditManagement] recordGenerationUsage failed:", error);
      throw error;
    }
  }
}

module.exports = CreditManagement;