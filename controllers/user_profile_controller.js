const User = require("../models/user");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

module.exports = { updateUserProfile, upload };
