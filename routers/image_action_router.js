const express = require("express");
const { deleteImage, reportImage } = require("../controllers/image_action_controller");

const imageActionRouter = express.Router();

imageActionRouter.delete("/delete/:imageId", deleteImage);
imageActionRouter.post("/images/:imageId/report", reportImage);

module.exports = imageActionRouter;
 