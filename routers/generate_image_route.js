const express = require("express");
const { generateTextToImage } = require("../controllers/generate_image_controller");
const { authenticateUser } = require("../middleware/auth_middleware");

const freePikTxtToImg = express.Router();

// Apply authentication middleware if user info is needed
freePikTxtToImg.post('/freepikTxtToImg', generateTextToImage);

module.exports = { freePikTxtToImg }; // ✅ Export properly
