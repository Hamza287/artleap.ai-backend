const express = require("express");
const { generateTextToImage } = require("../controllers/freepik_controller");
const SubscriptionService = require("../service/subscriptionService");

const freePikTxtToImg = express.Router();

freePikTxtToImg.post('/freepikTxtToImg', async (req, res, next) => {
  try {
    // Extract userId from request body
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: "User ID is required",
        details: "Please include userId in your request body"
      });
    }

    // Check subscription limits before processing
    const generationType = "prompt"; // Freepik is always prompt generation (2 credits)
    const limits = await SubscriptionService.checkGenerationLimits(userId, generationType);
    
    if (!limits.allowed) {
      return res.status(403).json({ 
        error: "Generation limit reached",
        details: limits 
      });
    }
    
    // Record the credit usage
    // await SubscriptionService.recordGenerationUsage(userId, generationType);
    
    // Proceed to the controller if limits are OK
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