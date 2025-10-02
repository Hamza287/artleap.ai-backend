const express = require("express");
const router = express.Router();
const likeController = require("../controllers/like_controller");
const { authenticateUser } = require('./../middleware/auth_middleware');

router.use(authenticateUser);

router.post("/images/:imageId/like", likeController.likeImage);
router.delete("/images/:imageId/like", likeController.unlikeImage);

router.get("/images/:imageId/likes", likeController.getImageLikes);
router.get("/images/:imageId/likes/count", likeController.getLikeCount);
router.get("/images/:imageId/likes/check", likeController.checkUserLike);

router.get("/users/likes", likeController.getUserLikes);

module.exports = router;