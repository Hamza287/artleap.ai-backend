const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const Image = require("../models/image_model");
const mongoose = require("mongoose");
const User = require("../models/user");
require("dotenv").config();

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a Base64 image to AWS S3 and returns the image URL.
 * @param {string} base64Data - The Base64 image string.
 * @param {string} userId - The user ID.
 * @returns {Promise<string>} - The uploaded image URL.
 */
const uploadImageToS3 = async (base64Data, userId) => {
  if (!base64Data) {
    throw new Error("❌ Missing base64 image data.");
  }

  const s3Bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!s3Bucket) {
    throw new Error("❌ AWS_S3_BUCKET_NAME is missing in environment variables.");
  }

  const buffer = Buffer.from(base64Data, "base64");
  const fileName = `uploads/user_${userId}_${uuidv4()}.png`;

  const params = {
    Bucket: s3Bucket,
    Key: fileName,
    Body: buffer,
    ContentType: "image/png",
  };

  console.log("🟢 Uploading image to S3...");
  console.log("Bucket:", params.Bucket);
  console.log("Key:", params.Key);
  console.log("Buffer Length:", buffer.length);

  try {
    await s3Client.send(new PutObjectCommand(params));
    const imageUrl = `https://${s3Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    console.log("✅ Image uploaded to S3:", imageUrl);
    return imageUrl;
  } catch (error) {
    console.error("❌ Error uploading image to S3:", error);
    throw new Error("Failed to upload image to AWS S3");
  }
};

/**
 * Saves the image to MongoDB after uploading to S3.
 * @param {string} userId - The user ID.
 * @param {string} base64Data - The Base64 image string.
 * @returns {Promise<Object>} - The saved image object.
 */
const saveImageToDatabase = async (user, base64Data, email, prompt, skipUserCheck = false) => {
  if (!base64Data) {
    throw new Error("❌ Base64 Image data missing.");
  }

  // ⛔ No user expected if skipUserCheck is true
  if (!skipUserCheck && !user) {
    throw new Error("❌ User not provided.");
  }

  const imageUrl = await uploadImageToS3(base64Data, user?._id || "anonymous");

  if (skipUserCheck) {
    return {
      imageUrl,
      createdAt: new Date()
    };
  }

  const newImage = new Image({
    userId: user._id,
    username: user.username,
    creatorEmail: email || user.email || "unknown@example.com",
    prompt: prompt || "No prompt provided",
    imageUrl,
    presetStyle: user?.presetStyle || "Ai generated",
    createdAt: new Date(),
  });

  const savedImage = await newImage.save();

  await User.updateOne({ _id: user._id }, { $push: { images: savedImage._id } });

  return savedImage;
};

module.exports = { saveImageToDatabase };
