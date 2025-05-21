const express = require("express");
const { generateTextToImage } = require("../controllers/freepik_controller");
const { authenticateUser } = require("../middleware/auth_middleware");

const freePikTxtToImg = express.Router();

// Apply authentication middleware if user info is needed
freePikTxtToImg.post('/freepikTxtToImg', generateTextToImage);

module.exports = { freePikTxtToImg }; // ✅ Export properly
