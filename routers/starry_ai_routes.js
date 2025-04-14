const express = require("express");
const router = express.Router();
const multer = require("multer");
const { createImageAndWait } = require("../controllers/starry_controller");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

router.post("/create", upload.single("image"), createImageAndWait);

module.exports = router;