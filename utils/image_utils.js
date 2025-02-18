const AWS = require("aws-sdk");
const path = require("path");
const Image = require("../models/image_model");
const User = require("../models/user"); // Import User model

// AWS S3 Config
const s3 = require("../config/aws"); // Ensure AWS S3 is configured

// Function to upload base64 image to AWS S3
const uploadImageToS3 = async (base64Data, userId) => {
  const buffer = Buffer.from(base64Data, "base64");
  const fileName = `user_${userId}_${Date.now()}.png`; // Unique file name
  const s3Bucket = process.env.AWS_S3_BUCKET_NAME; // Get bucket name from .env

  const params = {
    Bucket: s3Bucket,
    Key: `uploads/${fileName}`, // S3 Folder path
    Body: buffer,
    ContentEncoding: "base64",
    ContentType: "image/png",
    ACL: "public-read", // Allow public read access (optional)
  };

  try {
    const s3Response = await s3.upload(params).promise();
    console.log("✅ Image uploaded to S3:", s3Response.Location);
    return s3Response.Location; // Return S3 image URL
  } catch (error) {
    console.error("❌ Error uploading image to S3:", error);
    throw new Error("Failed to upload image to AWS S3");
  }
};

// Function to save image in DB with S3 URL
const saveImageToDatabase = async (user, imageData) => {
  if (!imageData) {
    throw new Error("❌ Base64 Image data missing in Freepik API response");
  }

  // Upload the image to AWS S3
  const imageUrl = await uploadImageToS3(imageData, user._id);

  // Save image details in MongoDB
  const newImage = new Image({
    userId: user._id,
    username: user.username,
    imageUrl: imageUrl, // Store S3 URL
    createdAt: new Date(),
  });

  const savedImage = await newImage.save();

  // 🔹 Update user profile to include the new image
  await User.findByIdAndUpdate(
    user._id,
    { $push: { images: savedImage._id } }, // Add image to user's profile
    { new: true }
  );

  return savedImage;
};

module.exports = { saveImageToDatabase };
