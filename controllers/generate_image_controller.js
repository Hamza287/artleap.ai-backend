const axios = require("axios");
require("dotenv").config();
const { saveImageToDatabase } = require("../utils/image_utils");

const FREEPIK_API_URL = process.env.FREEPIK_API_URL;
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;

/**
 * Generates one or more images via Freepik API and uploads them to S3.
 * @route POST /api/generate-image
 */
const generateImage = async (req, res) => {
  try {
    const { userId, email, prompt } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "❌ Missing user ID" });
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

    // Save all returned images
    const savedImages = [];
    for (const image of imageDataArray) {
      const base64Image = image.base64;
      if (!base64Image) continue;

      const savedImage = await saveImageToDatabase(userId, base64Image, email, prompt);
      savedImages.push(savedImage);
    }

    return res.json({
      success: true,
      message: `✅ ${savedImages.length} image(s) generated and saved successfully`,
      images: savedImages, // Return full saved image objects
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message,
    });
  }
};

module.exports = { generateImage };