// routes/watermarkRoutes.js
const express = require('express');
const router = express.Router();
const {  generateWithLogoWatermark } = require('./../controllers/watermarkController');

router.post('/generate-with-watermark',  generateWithLogoWatermark);

module.exports = router;