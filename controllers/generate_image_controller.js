const axios = require("axios");
require("dotenv").config();
const { saveImageToDatabase } = require("../utils/image_utils");
const User = require("../models/user");

const FREEPIK_API_URL = process.env.FREEPIK_API_URL;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

/**
 * Generates one or more images via Freepik API and uploads them to S3.
 * @route POST /api/generate-image
 */
const generateImage = async (req, res) => {
  try {
    const { userId, email, prompt, styling, model } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "❌ Missing user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    const response = await axios.post(FREEPIK_API_URL, req.body, {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
    });

    const imageDataArray = response?.data?.data || [];

    if (imageDataArray.length === 0) {
      return res.status(500).json({
        error: "❌ No image data received from API",
        fullResponse: response.data,
      });
    }

    const savedImages = [];
    for (const image of imageDataArray) {
      const base64Image = image.base64;
      if (!base64Image) continue;

      const savedImage = await saveImageToDatabase(userId, base64Image, email, prompt);

      savedImages.push({
        _id: savedImage._id,
        imageUrl: savedImage.imageUrl,
        prompt: savedImage.prompt,
        createdAt: savedImage.createdAt,
        model: model || "Unknown Model",
        style: styling?.style || "default"
      });
    }

    return res.json({
      success: true,
      message: `✅ ${savedImages.length} image(s) generated and saved successfully`,
      userId: user._id,
      username: user.username,
      creatorEmail: email || user.email || "unknown@example.com",
      images: savedImages,
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  }
};

module.exports = { generateImage };
