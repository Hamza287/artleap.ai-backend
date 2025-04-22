const mongoose = require("mongoose");
const User = require("../models/user");

const toggleFollowUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    if (userId === followId) {
      return res.status(400).json({ error: "You cannot follow yourself" });
    }

    const user = await User.findById(userId);
    const followUser = await User.findById(followId);
    if (!user || !followUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const isFollowing = user.following.some(id => id.toString() === followId);
    if (isFollowing) {
      // Unfollow logic
      user.following = user.following.filter(id => id.toString() !== followId);
      followUser.followers = followUser.followers.filter(id => id.toString() !== userId);
      await user.save();
      await followUser.save();
      return res.status(200).json({ success: true, message: `You have unfollowed ${followUser.username}` });
    } else {
      // Follow logic
      user.following.push(followId);
      followUser.followers.push(userId);
      await user.save();
      await followUser.save();
      return res.status(200).json({ success: true, message: `You are now following ${followUser.username}` });
    }
  } catch (error) {
    console.error("❌ Toggle Follow error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { toggleFollowUser };
