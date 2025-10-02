const express = require("express");
const router = express.Router();
const savedImageController = require("../controllers/save_image_controller");
const { authenticateUser } = require('./../middleware/auth_middleware');

router.use(authenticateUser);
router.post("/images/:imageId/save", savedImageController.saveImage);
router.delete("/images/:imageId/save", savedImageController.unsaveImage);

router.get("/users/saved", savedImageController.getUserSavedImages);
router.get("/images/:imageId/save/check", savedImageController.checkUserSave);
router.get("/users/saved/count", savedImageController.getSavedCount);

module.exports = router;