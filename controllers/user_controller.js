const User = require("../models/user");
const Image = require("../models/image_model");
const mongoose = require("mongoose");

/**
 * Get User Profile with Images
 * @route GET /api/user/:userId
 */

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password"); // Exclude passwords for security

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: "No users found" });
    }

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      users,
    });
  } catch (error) {
    console.error("❌ Error fetching all users:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getUserProfile = async (req, res) => {
  try {
    let { userId } = req.params;

    // Try both String and ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(userId);
    const query = isObjectId
      ? { $or: [{ _id: userId }, { _id: new mongoose.Types.ObjectId(userId) }] }
      : { _id: userId };

    const user = await User.findOne(query).populate('images');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const followersUsers = await User.find({ _id: { $in: user.followers } });
    const followingUsers = await User.find({ _id: { $in: user.following } });

    return res.status(200).json({
      success: true,
      message: 'User profile fetched successfully',
      user: {
        ...user.toObject(),
        followers: followersUsers,
        following: followingUsers,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
/**
 * Get User Profile with Images using Aggregation (Alternative)
 * @route GET /api/user/profile/:userId
 */
const getUserProfileWithImages = async (req, res) => {
  try {
    const { userId } = req.params;

    // Determine if the userId is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(userId);

    // Construct the match condition based on the ID type
    const matchCondition = isObjectId
      ? { _id: new mongoose.Types.ObjectId(userId) }
      : { _id: userId };

    // Perform the aggregation to fetch user data along with images
    const userData = await User.aggregate([
      { $match: matchCondition },
      {
        $lookup: {
          from: "images", // Ensure this matches your actual collection name
          localField: "_id",
          foreignField: "userId",
          as: "userImages",
        },
      },
    ]);

    // Check if user data was found
    if (!userData || userData.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Respond with the user data
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

module.exports = { getAllUsers, getUserProfile, getUserProfileWithImages };
