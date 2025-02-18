const express = require("express");
const { generateImage } = require("../controllers/generate_image_controller");
const { authenticateUser } = require("../middleware/auth_middleware");

const generateRouter = express.Router();

// Apply authentication middleware if user info is needed
generateRouter.post('/generateImage', authenticateUser, generateImage);

module.exports = { generateRouter }; // ✅ Export properly
