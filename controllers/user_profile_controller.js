const User = require("../models/user");
const SubscriptionPlan = require("../models/subscriptionPlan_model");
const UserSubscription = require("../models/user_subscription");
const SubscriptionService = require("../service/subscriptionService");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const moment = require('moment');

const uploadDir = path.join(__dirname, "../Uploads/profile_pictures/");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `user_${req.params.userId}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, password } = req.body;
    let updateFields = {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (username) updateFields.username = username;

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ error: "Email already in use" });
      }
      updateFields.email = email;
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    if (req.file) {
      updateFields.profilePic = req.file.path;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, { new: true });
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateUserCredits = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "❌ userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    if (user.isSubscribed) {
      return res.json({
        success: true,
        message: `ℹ️ User ${user.username} has active subscription (${user.planName}). Use subscription credits instead.`,
        totalCredits: user.totalCredits,
        usedImageCredits: user.usedImageCredits,
        usedPromptCredits: user.usedPromptCredits,
      });
    }

    const today = moment().startOf('day');
    const lastReset = user.lastCreditReset ? moment(user.lastCreditReset).startOf('day') : null;

    if (user.dailyCredits < 10 && !today.isSame(lastReset)) {
      user.dailyCredits = 10;
      user.totalCredits = 10;
      user.usedImageCredits = 0;
      user.lastCreditReset = new Date();
      await user.save();

      return res.json({
        success: true,
        message: `✅ Daily credits reset to 10 for ${user.username}.`,
        dailyCredits: user.dailyCredits,
      });
    }

    return res.json({
      success: true,
      message: `ℹ️ No reset needed. Either already reset today or credits are sufficient.`,
      dailyCredits: user.dailyCredits,
    });
  } catch (error) {
    console.error('❌ Error resetting daily credits:', error);
    res.status(500).json({ error: "Failed to reset daily credits" });
  }
};

const deductCredits = async (req, res) => {
  try {
    const { userId, creditsToDeduct, generationType, num_images = 1 } = req.body;

    // Validate input
    if (!userId || typeof creditsToDeduct !== 'number' || !generationType) {
      return res.status(400).json({ 
        error: "❌ userId, creditsToDeduct, and generationType are required" 
      });
    }

    if (num_images < 1) {
      return res.status(400).json({ 
        error: "❌ num_images must be at least 1" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    const activeSub = await UserSubscription.findOne({
      userId,
      isActive: true,
      endDate: { $gt: new Date() }
    }).populate('planId');

    const totalCreditsToDeduct = creditsToDeduct * num_images;

    if (activeSub) {
      // Calculate max credits based on plan
      const maxCredits = generationType === 'image' ? 
        (activeSub.planId.imageGenerationCredits * 24) : 
        (activeSub.planId.promptGenerationCredits * 2);

      // Check if user has enough credits
      if (generationType === 'image' && 
          (user.usedImageCredits + totalCreditsToDeduct) > maxCredits) {
        return res.status(400).json({ 
          error: `❌ Not enough image generation credits in your plan. 
                  Requested: ${totalCreditsToDeduct}, 
                  Available: ${maxCredits - user.usedImageCredits}` 
        });
      }

      if (generationType === 'prompt' && 
          (user.usedPromptCredits + totalCreditsToDeduct) > maxCredits) {
        return res.status(400).json({ 
          error: `❌ Not enough prompt generation credits in your plan. 
                  Requested: ${totalCreditsToDeduct}, 
                  Available: ${maxCredits - user.usedPromptCredits}` 
        });
      }
    } else {
      // Free user logic
      if (user.dailyCredits < totalCreditsToDeduct) {
        return res.status(400).json({ 
          error: `❌ Not enough daily credits. 
                  Requested: ${totalCreditsToDeduct}, 
                  Available: ${user.dailyCredits}` 
        });
      }
      
      user.dailyCredits -= totalCreditsToDeduct;
      user.totalCredits -= totalCreditsToDeduct;
    }

    await user.save();

    // Calculate remaining credits for response
    let remainingCredits;
    if (activeSub) {
      remainingCredits = generationType === 'image' 
        ? (activeSub.planId.imageGenerationCredits * 24 - user.usedImageCredits)
        : (activeSub.planId.promptGenerationCredits * 2 - user.usedPromptCredits);
    } else {
      remainingCredits = user.dailyCredits;
    }

    res.json({
      success: true,
      message: `✅ Deducted ${totalCreditsToDeduct} ${generationType} credits (${num_images} images) from ${user.username}.`,
      creditsDeducted: totalCreditsToDeduct,
      numImagesGenerated: num_images,
      remainingCredits,
      isSubscribed: !!activeSub,
      planType: activeSub?.planId?.type || 'free'
    });

  } catch (error) {
    console.error('❌ Error deducting credits:', error);
    res.status(500).json({ 
      error: "Failed to deduct credits",
      details: error.message 
    });
  }
};

const userSubscription = async (req, res) => {
  try {
    const { userId, planId, paymentMethod } = req.body;

    if (!userId || !planId || !paymentMethod) {
      return res.status(400).json({ 
        error: "❌ userId, planId, and paymentMethod are required" 
      });
    }

    const subscription = await SubscriptionService.createSubscription(
      userId,
      planId,
      paymentMethod,
      false
    );

    const user = await User.findById(userId);
    const plan = await SubscriptionPlan.findById(planId);

    res.json({
      success: true,
      message: subscription.cancelledAt ? 
        `✅ ${user.username}'s subscription upgraded to ${plan.name} plan.` : 
        `✅ ${user.username} is now subscribed to ${plan.name} plan.`,
      subscription
    });
  } catch (error) {
    console.error('❌ Error subscribing user:', error);
    res.status(400).json({ error: error.message });
  }
};

const unSubscribeUser = async (req, res) => {
  try {
    const { userId, immediate = false } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "❌ userId is required" });
    }

    const subscription = await SubscriptionService.cancelSubscription(
      userId,
      immediate
    );

    const user = await User.findById(userId);

    res.json({
      success: true,
      message: immediate ? 
        `✅ ${user.username}'s subscription cancelled immediately.` : 
        `✅ ${user.username}'s subscription set to not renew.`,
      subscription
    });
  } catch (error) {
    console.error('❌ Error unsubscribing user:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = { 
  updateUserProfile, 
  upload, 
  updateUserCredits, 
  deductCredits, 
  userSubscription, 
  unSubscribeUser 
};