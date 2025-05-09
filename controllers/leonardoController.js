
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const ImageModel = require('../models/image_model');
const User = require('../models/user');
const { uploadImageFromUrl } = require('../utils/s3Uploader');
const styleMap = require('../utils/leonardoStyleMap'); // 🔥 STYLE MAP INTEGRATION

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const LEONARDO_BASE_URL = process.env.LEONARDO_BASE_URL || 'https://cloud.leonardo.ai/api/rest/v1';
const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// TEXT TO IMAGE
const generateTextToImage = async (req, res) => {
  try {
    const {
      prompt,
      height = 768,
      width = 1024,
      modelId = 'b24e16ff-06e3-43eb-8d33-4416c2d75876',
      num_images = 1,
      presetStyle = 'FILM',
      userId,
      username,
      creatorEmail
    } = req.body;

    if (!prompt || !userId || !username) {
      return res.status(400).json({ error: 'Missing required fields (prompt, userId, username).' });
    }

    const genRes = await axios.post(`${LEONARDO_BASE_URL}/generations`, {
      prompt,
      height,
      width,
      modelId,
      num_images,
      presetStyle,
      alchemy: true
    }, {
      headers: {
        Authorization: `Bearer ${LEONARDO_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const generationId = genRes.data.sdGenerationJob.generationId;

    let status = 'PENDING';
    let finalImages = [];

    for (let i = 0; i < 20; i++) {
      await sleep(4000);
      const statusRes = await axios.get(`${LEONARDO_BASE_URL}/generations/${generationId}`, {
        headers: {
          Authorization: `Bearer ${LEONARDO_API_KEY}`,
          Accept: 'application/json'
        }
      });

      const genData = statusRes.data.generations_by_pk;
      status = genData.status;

      if (status === 'COMPLETE') {
        finalImages = genData.generated_images;
        break;
      }
    }

    if (!finalImages.length) {
      return res.status(202).json({ message: 'Generation still in progress.', generationId });
    }

    const uploadedImageDocs = [];

    for (const image of finalImages) {
      const s3Url = await uploadImageFromUrl(image.url, BUCKET);

      const savedImage = await ImageModel.create({
        userId,
        username,
        creatorEmail,
        imageUrl: s3Url,
        modelName: presetStyle,
        prompt
      });

      await User.findByIdAndUpdate(userId, {
        $push: { images: savedImage._id }
      });

      uploadedImageDocs.push({
        _id: savedImage._id,
        imageUrl: s3Url,
        creatorEmail,
        username,
        presetStyle,
        prompt,
        createdAt: new Date().toISOString()
      });
    }

    return res.status(200).json({
      generationId,
      prompt,
      presetStyle,
      images: uploadedImageDocs
    });

  } catch (err) {
    console.error('🔥 Text-to-Image Error:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Text-to-Image generation failed',
      detail: err?.response?.data || err.message
    });
  }
};

// IMAGE TO IMAGE
const generateImagetoImage = async (req, res) => {
  try {
    const image = req.file;
    const {
      prompt,
      userId,
      username,
      creatorEmail,
      num_images = 1,
      presetStyle = 'CINEMATIC'
    } = req.body;

    if (!image || !userId || !username || !prompt) {
      return res.status(400).json({ error: 'Missing required fields (image, prompt, userId, username).' });
    }

    const styleKey = presetStyle.toUpperCase();
    const styleConfig = styleMap[styleKey] || styleMap['CINEMATIC'];
    const finalPrompt = `${prompt}, ${styleConfig.promptBoost}`;

    const imagePath = path.join(__dirname, '..', 'uploads', image.filename);
    const imageBuffer = fs.readFileSync(imagePath);

    const initImageRes = await axios.post(`${LEONARDO_BASE_URL}/init-image`, {
      extension: 'png',
    }, {
      headers: {
        Authorization: `Bearer ${LEONARDO_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const { url, fields, id: initImageId } = initImageRes.data.uploadInitImage;

    const form = new FormData();
    const parsedFields = typeof fields === 'string' ? JSON.parse(fields) : fields;
    Object.entries(parsedFields).forEach(([key, val]) => form.append(key, val));
    form.append('file', imageBuffer, {
      filename: 'input.png',
      contentType: 'image/png',
    });

    await axios.post(url, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const controlPayload = {
      height: 1024,
      width: 1024,
      modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',
      prompt: finalPrompt,
      presetStyle, // ✅ add this line
      num_images: parseInt(num_images),
      negative_prompt: "b&w, earth, cartoon, ugly,mutated hands,mutated foots, not recognizing the prompt,opposite gender, cross-gender, gender swap, genderbent, feminine, masculine, long hair, short hair, beard, breasts, lipstick, makeup, earrings, jewelry",
      alchemy: true,
      "init_image_id": initImageId ,
      "init_strength": 0.5,
      "controlNetType": "DEPTH" ,
      controlnets: [
        {
          initImageId,
          initImageType: 'UPLOADED',
          preprocessorId: 67,
          strengthType: styleConfig.strengthType || 'High',
          influence: styleConfig.influence,
          weight: styleConfig.weight
        },
       
      ]
    };
console.log(controlPayload)
    const controlGen = await axios.post(`${LEONARDO_BASE_URL}/generations`, controlPayload, {
      headers: {
        Authorization: `Bearer ${LEONARDO_API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const generationId = controlGen.data.sdGenerationJob.generationId;

    let status = 'PENDING';
    let finalImages = [];

    for (let i = 0; i < 20; i++) {
      await sleep(4000);
      const finalGenResult = await axios.get(`${LEONARDO_BASE_URL}/generations/${generationId}`, {
        headers: {
          Authorization: `Bearer ${LEONARDO_API_KEY}`,
          Accept: 'application/json',
        },
      });

      const genData = finalGenResult.data.generations_by_pk;
      status = genData.status;

      if (status === 'COMPLETE') {
        finalImages = genData.generated_images;
        break;
      }
    }

    if (!finalImages.length) {
      return res.status(202).json({ message: 'Image generation still in progress.', generationId });
    }

    const uploadedImageDocs = [];

    for (const image of finalImages) {
      const s3Url = await uploadImageFromUrl(image.url, BUCKET);

      const savedImage = await ImageModel.create({
        userId,
        username,
        creatorEmail,
        imageUrl: s3Url,
        modelName: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',
        prompt,
        presetStyle
      });

      await User.findByIdAndUpdate(userId, {
        $push: { images: savedImage._id }
      });

      uploadedImageDocs.push({
        _id: savedImage._id,
        userId,
        imageUrl: s3Url,
        creatorEmail,
        username,
        presetStyle,
        prompt,
        createdAt: new Date().toISOString()
      });
    }

    fs.unlinkSync(imagePath);

    return res.status(200).json({
      generationId,
      prompt,
      presetStyle,
      images: uploadedImageDocs
    });

  } catch (err) {
    console.error('🔥 Image-to-Image Error:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Image-to-Image generation failed',
      detail: err?.response?.data || err.message
    });
  }
};

module.exports = { generateTextToImage, generateImagetoImage };
