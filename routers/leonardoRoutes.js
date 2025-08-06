const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateImagetoImage, generateTextToImage } = require('../controllers/leonardoController');
const SubscriptionService = require("../service/subscriptionService");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'Uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({ storage });

// Middleware to check subscription for text-to-image
const checkTextToImageLimits = async (req, res, next) => {
  try {
    const generationType = "image"; // Leonardo text-to-image is image generation (24 credits)
    const limits = await SubscriptionService.checkGenerationLimits(req.userId, generationType);
    
    if (!limits.allowed) {
      return res.status(403).json({ 
        error: "Generation limit reached",
        details: limits 
      });
    }
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Middleware to check subscription for image-to-image
const checkImageToImageLimits = async (req, res, next) => {
  try {
    const generationType = "image"; // Leonardo image-to-image is image generation (24 credits)
     const { userId } = req.body;
    const limits = await SubscriptionService.checkGenerationLimits(userId, generationType);
    
    if (!limits.allowed) {
      // Clean up uploaded file if limit is reached
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ 
        error: "Generation limit reached",
        details: limits 
      });
    }
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    if (req.file) {
      fs.unlinkSync(req.file.path); // Clean up uploaded file on error
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

router.post('/leonardoImgToImg', 
  upload.single('image'),
  checkImageToImageLimits,
  generateImagetoImage
);

router.post('/leonardoTxtToImg',
  checkTextToImageLimits,
  generateTextToImage
);

module.exports = router;