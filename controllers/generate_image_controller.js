const axios = require("axios");
const User = require("../models/user");
const ImageModel = require("../models/image_model");
const { uploadImageFromUrl, uploadBase64ToS3 } = require("../utils/s3Uploader");
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

    const generationId = response?.data?.generation_id || require("uuid").v4();

    const uploadedImageDocs = [];
    let savedImage = null;

    for (let i = 0; i < imageDataArray.length; i++) {
      const base64Image = imageDataArray[i].base64;
      if (!base64Image) continue;

      const s3Url = await uploadBase64ToS3(base64Image, `freepik_${Date.now()}_${i}.png`);

      const imageDoc = {
        imageUrl: s3Url,
        creatorEmail: creatorEmail || user.email || "unknown@example.com",
        username,
        presetStyle,
        prompt,
        createdAt: new Date().toISOString()
      };

      if (i === 0) {
        savedImage = await ImageModel.create({
          userId,
          ...imageDoc
        });

        await User.findByIdAndUpdate(userId, {
          $push: { images: savedImage._id }
        });

        uploadedImageDocs.push({
          ...imageDoc,
          _id: savedImage._id
        });
      } else {
        uploadedImageDocs.push(imageDoc);
      }
    }

    return res.json({
      generationId,
      prompt,
      presetStyle,
      images: uploadedImageDocs
    });
  } catch (error) {
    console.error("❌ Freepik Image Generation Error:", error?.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      error: "Failed to generate image",
      details: error.message
    });
  }
};

module.exports = { generateTextToImage };
