const express = require("express");
const router = express.Router();
const { updateImagePrivacy } = require("./../controllers/image_privacy_controller");

router.patch("/images/:imageId/privacy", updateImagePrivacy);

module.exports = router;
