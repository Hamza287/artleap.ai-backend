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

const checkTextToImageLimits = async (req, res, next) => {
  const { userId } = req.body;
  try {
    if (!userId) {
      return res.status(400).json({ 
        error: "User ID is required",
        details: "Please include userId in your request body"
      });
    }
    
    const generationType = "prompt";
    const limits = await SubscriptionService.checkGenerationLimits(userId, generationType);
    
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

const checkImageToImageLimits = async (req, res, next) => {
  try {
    const generationType = "image";
     const { userId } = req.body;
    const limits = await SubscriptionService.checkGenerationLimits(userId, generationType);
    
    if (!limits.allowed) {
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
      fs.unlinkSync(req.file.path);
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