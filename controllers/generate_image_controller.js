const axios = require("axios");
require("dotenv").config();
const { saveImageToDatabase } = require("../utils/image_utils");
const User = require("../models/user");

const FREEPIK_API_URL = process.env.FREEPIK_API_URL;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

const generateImage = async (req, res) => {
  try {
    const { userId } = req.body;
    const requestBody = req.body;

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Call Freepik API
    const response = await axios.post(FREEPIK_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
    });

    console.log("🔍 API Response:", JSON.stringify(response.data, null, 2));

    // Ensure response format is correct
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return res.status(500).json({
        error: "❌ API Response is missing expected image data",
        fullResponse: response.data,
      });
    }

    // Extract base64
    const base64Image = response?.data?.data?.[0]?.base64 ?? null;
    console.log("Extracted Base64 Image:", base64Image ? "✅ Found" : "❌ Not Found");

    if (!base64Image) {
      return res.status(500).json({
        error: "❌ Base64 Image missing",
        fullResponse: response.data,
      });
    }

    // Save image to S3 & Database
    try {
      const savedImage = await saveImageToDatabase(user, base64Image);
      console.log("✅ Image saved to DB");

      return res.json({
        success: true,
        message: "Image saved successfully",
        imageUrl: savedImage.imageUrl, // Return S3 URL
        savedImage,
      });
    } catch (dbError) {
      console.error("❌ Database save error:", dbError);
      return res.status(500).json({
        error: "❌ Failed to save image to database",
        details: dbError.message,
      });
    }

  } catch (error) {
    console.error("❌ Freepik API Error:", error.response ? error.response.data : error.message);
    return res.status(error.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  }
};

module.exports = { generateImage };
