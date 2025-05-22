const axios = require("axios");
const mongoose = require("mongoose");
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
      presetStyle = "photo",
      aspectRatio = "square_1_1",
      num_images = 1
    } = req.body;

    if (!userId || !prompt || !username) {
      return res.status(400).json({ error: "❌ Missing required fields (userId, prompt, username)." });
    }

    console.log("👉 Received userId:", userId);

    // Validate user
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

    // Freepik API request body
    const freepikRequestBody = {
      guidance_scale: 1,
      image: { size: aspectRatio },
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

    // Call Freepik API
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

    const generationId = response?.data?.generation_id || require("uuid").v4();
    const savedImages = [];

    for (let i = 0; i < imageDataArray.length; i++) {
      const base64Image = imageDataArray[i].base64;
      if (!base64Image) continue;

      // Only first image goes into DB + user.images
      if (i === 0) {
        const savedImage = await saveImageToDatabase(user, base64Image,creatorEmail,presetStyle , prompt);

        savedImages.push({
          _id: savedImage._id,
          imageUrl: savedImage.imageUrl,
          creatorEmail: creatorEmail || user.email || "unknown@example.com",
          username,
          presetStyle,
          prompt,
          createdAt: savedImage.createdAt
        });
      } else {
        const tempImage = await saveImageToDatabase(null, base64Image, creatorEmail, prompt, true);
        savedImages.push({
          imageUrl: tempImage.imageUrl,
          creatorEmail: creatorEmail || user.email || "unknown@example.com",
          username,
          presetStyle,
          prompt,
          createdAt: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({
      generationId,
      prompt,
      presetStyle,
      images: savedImages
    });

  } catch (error) {
    console.error("❌ Freepik API Error:", error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message
    });
  }
};

module.exports = { generateTextToImage };
