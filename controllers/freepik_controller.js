const axios = require("axios");
const mongoose = require("mongoose");
const ImageModel = require("../models/image_model");
const User = require("../models/user");
const { uploadImageToS3, saveImageToDatabase } = require("../utils/image_utils");
const SubscriptionService = require("../service/subscriptionService");
const HistoryService = require("./../service/userHistoryService");
require("dotenv").config();

const FREEPIK_API_URL = process.env.FREEPIK_API_URL;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

const generateTextToImage = async (req, res) => {
  try {
    const {
      userId,
      username,
      creatorEmail,
      prompt,
      presetStyle = "neutral",
      aspectRatio = "square_1_1",
      num_images = 1,
      privacy = "public"
    } = req.body;

    if (!userId || !prompt || !username) {
      return res.status(400).json({
        error: "❌ Missing required fields (userId, prompt, username).",
      });
    }

    let user;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({ _id: String(userId).trim() });
    }

    if (!user) {
      return res.status(404).json({ error: "❌ User not found." });
    }

    const generationType = "prompt";
    const limits = await SubscriptionService.checkGenerationLimits(
      userId,
      generationType
    );

    if (!limits.allowed) {
      return res.status(403).json({
        error: "Generation limit reached",
        details: limits,
      });
    }

    const freepikRequestBody = {
      guidance_scale: 1,
      num_images,
      image: { size: aspectRatio },
      prompt: prompt,
      negative_prompt: "low quality, blurry",
      styling: {
        style: presetStyle,
        effects: {}
      },
      seed: 0,
      filter_nsfw: true,
    };

    const response = await axios.post(FREEPIK_API_URL, freepikRequestBody, {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
    });

    const imageDataArray = response?.data?.data || [];

    if (imageDataArray.length === 0) {
      return res.status(500).json({
        error: "❌ No image data received from Freepik API",
        fullResponse: response.data,
      });
    }

    const generationId = response?.data?.generation_id || require("uuid").v4();
    const savedImages = [];

    for (let i = 0; i < imageDataArray.length; i++) {
      const base64Image = imageDataArray[i].base64;
      if (!base64Image) continue;

      const savedImage = await saveImageToDatabase(
        user,
        base64Image,
        creatorEmail,
        presetStyle,
        prompt
      );

      if (savedImage && savedImage._id) {
        await ImageModel.findByIdAndUpdate(savedImage._id, { privacy });
      }

      savedImages.push({
        _id: savedImage._id,
        imageUrl: savedImage.imageUrl,
        creatorEmail: creatorEmail || user.email || "unknown@example.com",
        username,
        modelName: presetStyle,
        prompt,
        createdAt: savedImage.createdAt,
        privacy
      });
    }

    await SubscriptionService.recordGenerationUsage(
      userId,
      generationType,
      num_images
    );

    await HistoryService.recordImageGeneration(userId, "byImage");
    await HistoryService.updateCreditUsage(userId);

    return res.status(200).json({
      generationId,
      prompt,
      presetStyle,
      images: savedImages,
    });
  } catch (error) {
    console.error("❌ Freepik API Error:", error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  }
};

module.exports = {
  generateTextToImage,
};
