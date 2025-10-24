const express = require("express");
const { generateTextToImage } = require("../controllers/freepik_controller");
const SubscriptionService = require("../service/subscriptionService");

const freePikTxtToImg = express.Router();

freePikTxtToImg.post('/freepikTxtToImg', async (req, res, next) => {
  try {
    const { userId } = req.body;
    
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
    return res.status(500).json({ 
      error: error.message || "Internal server error",
      details: error.details || {} 
    });
  }
}, generateTextToImage);

module.exports = { freePikTxtToImg };