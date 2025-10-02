const express = require("express");
const router = express.Router();
const commentController = require("../controllers/comment_controller");
const { authenticateUser } = require('./../middleware/auth_middleware');


router.use(authenticateUser);
router.post("/images/:imageId/comments", commentController.addComment);
router.get("/images/:imageId/comments", commentController.getImageComments);
router.put("/comments/:commentId", commentController.updateComment);
router.delete("/comments/:commentId", commentController.deleteComment);

router.get("/images/:imageId/comments/count", commentController.getCommentCount);
router.get("/users/comments", commentController.getUserComments);

module.exports = router;