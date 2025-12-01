const express = require("express");
const multer = require("multer");

const { videoGenerationController } = require("../controllers/videoController");

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
})
const upload = multer({ storage });
const videoRouter = express.Router();

videoRouter.post("/text-to-video", upload.none(), videoGenerationController);

module.exports = { videoRouter };
