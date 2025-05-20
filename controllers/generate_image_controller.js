const axios = require("axios");
const User = require("../models/user");
const { saveImageToDatabase } = require("../utils/image_utils");
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
      presetStyle = "photo",       // default Freepik style
      aspectRatio = "square_1_1",  // default aspect ratio
      num_images = 1
    } = req.body;

    if (!userId || !prompt || !username) {
      return res.status(400).json({ error: "❌ Missing required fields (userId, prompt, username)." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "❌ User not found" });
    }

    const freepikRequestBody = {
      guidance_scale: 1,
      image: {
        size: aspectRatio
      },
      num_images,
      prompt,
      negative_prompt: "bad quality,b&w, earth, cartoon, ugly, lowres, blurry, out of focus",
      styling: {
        style: presetStyle,
        effects: {
          color: "pastel",
          lightning: "warm",
          framing: "portrait"
        }
      },
      seed: 0,
      filter_nsfw: true
    };

    const response = await axios.post(FREEPIK_API_URL, freepikRequestBody, {
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY
      }
    });

    const imageDataArray = response?.data?.data || [];
    if (imageDataArray.length === 0) {
      return res.status(500).json({
        error: "❌ No image data received from Freepik API",
        fullResponse: response.data
      });
    }

    const generationId = response?.data?.generation_id || require("uuid").v4(); // fallback if not provided
    const savedImages = [];

    for (const image of imageDataArray) {
      const base64Image = image.base64;
      if (!base64Image) continue;

      const savedImage = await saveImageToDatabase(userId, base64Image, creatorEmail, prompt);

      savedImages.push({
        _id: savedImage._id,
        imageUrl: savedImage.imageUrl,
        creatorEmail: creatorEmail || user.email || "unknown@example.com",
        username: username,
        presetStyle,
        prompt,
        createdAt: savedImage.createdAt
      });
    }

    return res.json({
      generationId,
      prompt,
      presetStyle,
      images: savedImages
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message
    });
  }
};

module.exports = { generateTextToImage };
