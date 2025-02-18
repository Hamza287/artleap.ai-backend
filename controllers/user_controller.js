const User = require("../models/user");
const Image = require("../models/image_model");
const mongoose = require("mongoose");

/**
 * Get User Profile with Images
 * @route GET /api/user/:userId
 */
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate user ID format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Fetch user and populate images
    const user = await User.findById(userId).populate("images");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      user,
    });
  } catch (error) {
    console.error("❌ Error fetching user profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Get User Profile with Images using Aggregation (Alternative)
 * @route GET /api/user/profile/:userId
 */
const getUserProfileWithImages = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const userData = await User.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(userId) },
      },
      {
        $lookup: {
          from: "images", // Ensure collection name is correct
          localField: "_id",
          foreignField: "userId",
          as: "userImages",
        },
      },
    ]);

    if (!userData || userData.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User profile with images fetched successfully",
      user: userData[0],
    });
  } catch (error) {
    console.error("❌ Error fetching user profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { getUserProfile, getUserProfileWithImages };
