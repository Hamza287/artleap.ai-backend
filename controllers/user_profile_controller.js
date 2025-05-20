const User = require("../models/user");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const moment = require('moment');
/**
 * Ensure Upload Directory Exists
 */
const uploadDir = path.join(__dirname, "../uploads/profile_pictures/");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Setup Multer for Profile Picture Upload
 */
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

/**
 * Update User Profile (Optional Fields)
 * @route POST /api/user/update/:userId
 */
const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, password } = req.body;
    let updateFields = {};

    // Validate user ID format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update username if provided
    if (username) updateFields.username = username;

    // Update email if provided and not already taken
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ error: "Email already in use" });
      }
      updateFields.email = email;
    }

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    // Update profile picture if provided
    if (req.file) {
      updateFields.profilePic = req.file.path;
    }

    // If no fields are provided, return an error
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    // Update the user with provided fields
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
        message: `ℹ️ User ${user.username} is subscribed. No daily reset needed.`,
        dailyCredits: user.dailyCredits,
      });
    }

    const today = moment().startOf('day');
    const lastReset = user.lastCreditReset ? moment(user.lastCreditReset).startOf('day') : null;

    if (user.dailyCredits < 75 && !today.isSame(lastReset)) {

      // ✅ Free user and needs reset
      user.dailyCredits = 75;
      user.lastCreditReset = new Date();
      await user.save();
      return res.json({
        success: true,
        message: `✅ Daily credits reset to 75 for ${user.username}.`,
        dailyCredits: user.dailyCredits,
      });
    } else {
      console.log({
        today: today.format('YYYY-MM-DD'),
        lastReset: lastReset ? lastReset.format('YYYY-MM-DD') : 'none',
        dailyCredits: user.dailyCredits,
        isSubscribed: user.isSubscribed,
      });
      return res.json({

        success: true,
        message: `ℹ️ No reset needed. Either already reset today or credits are fine.`,
        dailyCredits: user.dailyCredits,
      });
    }

  } catch (error) {
    console.error('❌ Error resetting daily credits:', error);
    res.status(500).json({ error: "Failed to reset daily credits" });
  }
};

const deductCredits = async (req, res) => {
  try {
    const { userId, creditsToDeduct } = req.body;

    if (!userId || typeof creditsToDeduct !== 'number') {
      return res.status(400).json({ error: "❌ userId and creditsToDeduct are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    if (user.dailyCredits < creditsToDeduct) {
      return res.status(400).json({ error: "❌ Not enough credits" });
    }

    user.dailyCredits -= creditsToDeduct;
    await user.save();

    res.json({
      success: true,
      message: `✅ Deducted ${creditsToDeduct} credits from ${user.username}.`,
      dailyCredits: user.dailyCredits,
    });
  } catch (error) {
    console.error('❌ Error deducting credits:', error);
    res.status(500).json({ error: "Failed to deduct credits" });
  }
};

const userSubscription = async (req, res) => {
  try {
    const { userId, customCredits } = req.body;

    if (!userId || typeof customCredits !== 'number') {
      return res.status(400).json({ error: "❌ userId and customCredits are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    user.isSubscribed = true;
    user.dailyCredits = customCredits;
    await user.save();

    res.json({
      success: true,
      message: `✅ ${user.username} is now subscribed with ${customCredits} credits.`,
      dailyCredits: user.dailyCredits,
    });
  } catch (error) {
    console.error('❌ Error subscribing user:', error);
    res.status(500).json({ error: "Failed to subscribe user" });
  }
};

const unSubscribeUser = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "❌ userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    user.isSubscribed = false;
    user.dailyCredits = 10;
    await user.save();

    res.json({
      success: true,
      message: `✅ ${user.username} unsubscribed and dailyCredits set to 10.`,
      dailyCredits: user.dailyCredits,
    });
  } catch (error) {
    console.error('❌ Error unsubscribing user:', error);
    res.status(500).json({ error: "Failed to unsubscribe user" });
  }
};

module.exports = { updateUserProfile, upload, updateUserCredits, deductCredits, userSubscription, unSubscribeUser };
