const express = require("express");
const { deleteImage, reportImage } = require("../controllers/image_action_controller");

const imageActionRouter = express.Router();

imageActionRouter.delete("/images/delete/:imageId", deleteImage);
imageActionRouter.post("/images/:imageId/report", reportImage);

module.exports = imageActionRouter;
 