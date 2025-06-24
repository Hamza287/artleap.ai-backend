// controllers/logoWatermarkController.js
const { addLogoWatermark } = require('../utils/watermarkUtils');
const { uploadImageToS3 } = require('../utils/image_utils');
const ImageModel = require('../models/image_model');
const User = require('../models/user');
const path = require('path');

const DEFAULT_LOGO_PATH = path.join(__dirname, './../assets/watermark/watermark.png');

async function generateWithLogoWatermark(req, res) {
    try {
        const {
            imageUrl,
            userId,
            username,
            creatorEmail,
            prompt,
            watermarkText = 'Artleap',
            logoPath = DEFAULT_LOGO_PATH
        } = req.body;

        if (!imageUrl || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Download the image
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');

        // Add watermark
        const watermarkedImage = await addLogoWatermark(imageBuffer, {
            logoPath,
            text: watermarkText,
            textSize: 36,
            opacity: 0.8,
            margin: 30
        });

        // Upload to S3
        const s3Url = await uploadImageToS3(watermarkedImage.toString('base64'), userId);

        // Save to database
        const savedImage = await ImageModel.create({
            userId,
            imageUrl: s3Url,
            creatorEmail,
            username,
            prompt,
            hasWatermark: true,
            watermarkText,
            createdAt: new Date()
        });

        // Update user
        await User.findByIdAndUpdate(userId, { $push: { images: savedImage._id } });

        return res.json({
            success: true,
            image: savedImage
        });

    } catch (error) {
        console.error('Logo watermark error:', error);
        return res.status(500).json({ error: 'Failed to add watermark' });
    }
}

module.exports = { generateWithLogoWatermark };