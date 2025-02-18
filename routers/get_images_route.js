const express = require("express");
const { getAllImages } = require("../controllers/image_controller");
const router = express.Router();
// GET All Images API Route
router.get("/all-images", getAllImages);
module.exports = router;
