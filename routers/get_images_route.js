const express = require("express");
const { getAllImages } = require("../controllers/image_controller");
const router = express.Router();

router.get("/all-images", getAllImages);
module.exports = router;
