const axios = require("axios");
require("dotenv").config();
const { saveImageToDatabase } = require("../utils/image_utils");

const FREEPIK_API_URL = process.env.FREEPIK_API_URL;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

/**
 * Generates an image via Freepik API and uploads it to S3.
 * @route POST /api/generate-image
 */
const generateImage = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "❌ Missing user ID" });
    }

    // Call Freepik API
    const response = await axios.post(FREEPIK_API_URL, req.body, {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
    });

    console.log("🔍 API Response:", JSON.stringify(response.data, null, 2));

    // Extract base64 image from the response
    const base64Image = response?.data?.data?.[0]?.base64 || null;
    if (!base64Image) {
      return res.status(500).json({
        error: "❌ No image data received from API",
        fullResponse: response.data,
      });
    }

    // Save image to S3 & MongoDB
    try {
      const savedImage = await saveImageToDatabase(userId, base64Image);
      console.log("✅ Image saved to DB");

      return res.json({
        success: true,
        message: "✅ Image generated and saved successfully",
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
