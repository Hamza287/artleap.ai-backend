const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const STARRY_API_URL = process.env.STARRY_API_URL;
const STARRY_API_KEY = process.env.STARRY_API_KEY;
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION;

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function createImageAndWait(req, res) {
  try {
    const file = req.file;
    const {
      prompt,
      negativePrompt = "blurry, low quality, distorted",
      model = "cinematic",
      aspectRatio = "square"
    } = req.body;

    if (!file || !prompt) {
      return res.status(400).json({ error: "Image file and prompt are required" });
    }

    // Upload to S3
    const fileStream = fs.createReadStream(file.path);
    const key = `${Date.now()}_${path.basename(file.originalname)}`;
    const s3Params = {
        Bucket: AWS_S3_BUCKET_NAME,
        Key: key,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype
        // ACL removed because it's not allowed with Object Ownership "bucket owner enforced"
      };

    await s3Client.send(new PutObjectCommand(s3Params));
    const imageUrl = `https://${AWS_S3_BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;

    // EXACT StarryAI body format
    const postBody = {
      prompt,
      negativePrompt,
      model,
      aspectRatio,
      highResolution: false,
      images: 1,
      seed: 0,
      steps: 20,
      initialImageUrl: imageUrl,
      initialImageEncoded: null,
      initialImageMode: "color",
      initialImageStrength: 50,
    };

    // POST to StarryAI
    const postResponse = await axios.post(STARRY_API_URL, postBody, {
      headers: {
        "x-api-key": STARRY_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const creationId = postResponse.data.id;
    if (!creationId) {
      return res.status(500).json({ error: "Failed to get creation ID from StarryAI" });
    }

    // POLL for completion
    let status = "submitted";
    let result = null;

    while (status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds

      const poll = await axios.get(`${STARRY_API_URL}${creationId}`, {
        headers: { "x-api-key": STARRY_API_KEY },
      });

      result = poll.data;
      status = result.status;

      if (status === "expired") {
        return res.status(400).json({ error: "Image creation expired" });
      }
    }

    // Return completed image result
    return res.json(result);

  } catch (err) {
    console.error("💥 StarryAI Error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Image generation failed", details: err?.response?.data });
  }
}

module.exports = { createImageAndWait };
