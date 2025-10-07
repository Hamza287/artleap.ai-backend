const Comment = require("../models/image_coments");
const Image = require("../models/image_model");
const { saveNotification, sendPushNotification, getDeviceTokens } = require("./../service/firebaseService");

const commentController = {
  getUserId: (req) => {
    if (!req.user || !req.user.userId) {
      throw new Error('User not authenticated');
    }
    return req.user.userId;
  },

  addComment: async (req, res) => {
    try {
      const { imageId } = req.params;
      const { comment } = req.body;
      const userId = commentController.getUserId(req);

      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({ success: false, message: "Comment is required" });
      }

      if (comment.length > 1000) {
        return res.status(400).json({ success: false, message: "Comment must be less than 1000 characters" });
      }

      const image = await Image.findById(imageId).populate("userId", "username profilePic");
      if (!image) {
        return res.status(404).json({ success: false, message: "Image not found" });
      }

      const newComment = new Comment({
        image: imageId,
        user: userId,
        comment: comment.trim()
      });

      await newComment.save();

      await Image.findByIdAndUpdate(imageId, { $inc: { commentCount: 1 } });

      await newComment.populate("user", "username profilePic");

      if (String(image.userId._id) !== String(userId)) {
        const deviceTokens = await getDeviceTokens(image.userId._id);

        const notifData = {
          title: "New Comment",
          body: `${newComment.user.username} commented: "${newComment.comment}"`,
          data: {
            type: "comment",
            imageId: imageId,
            commentId: newComment._id.toString()
          }
        };

        if (deviceTokens.length > 0) {
          await sendPushNotification(deviceTokens, notifData);
        }

        await saveNotification({
          userId: image.userId._id,
          type: "user",
          title: notifData.title,
          body: notifData.body,
          data: notifData.data
        });
      }

      res.status(201).json({
        success: true,
        message: "Comment added successfully",
        data: newComment
      });

    } catch (error) {
      console.error("Add comment error:", error);
      if (error.message === 'User not authenticated') {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  },

  getImageComments: async (req, res) => {
    try {
      const { imageId } = req.params;
      const { page = 1, limit = 20, sort = 'newest' } = req.query;

      const sortOptions = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 }
      };

      const comments = await Comment.find({ image: imageId })
        .populate('user', 'username profilePic')
        .sort(sortOptions[sort] || { createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Comment.countDocuments({ image: imageId });

      res.json({
        success: true,
        data: comments,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error("Get image comments error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },

  updateComment: async (req, res) => {
    try {
      const { commentId } = req.params;
      const { comment } = req.body;
      const userId = commentController.getUserId(req);

      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Comment is required"
        });
      }

      if (comment.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Comment must be less than 1000 characters"
        });
      }

      const updatedComment = await Comment.findOneAndUpdate(
        {
          _id: commentId,
          user: userId
        },
        {
          comment: comment.trim(),
          updatedAt: new Date()
        },
        {
          new: true,
          runValidators: true
        }
      ).populate('user', 'username profilePic');

      if (!updatedComment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found or you don't have permission to edit it"
        });
      }

      res.json({
        success: true,
        message: "Comment updated successfully",
        data: updatedComment
      });

    } catch (error) {
      console.error("Update comment error:", error);
      if (error.message === 'User not authenticated') {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },

  deleteComment: async (req, res) => {
    try {
      const { commentId } = req.params;
      const userId = commentController.getUserId(req);

      const comment = await Comment.findOne({
        _id: commentId,
        user: userId
      });

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found or you don't have permission to delete it"
        });
      }

      await Comment.findOneAndDelete({
        _id: commentId,
        user: userId
      });

      await Image.findByIdAndUpdate(comment.image, {
        $inc: { commentCount: -1 },
        $max: { commentCount: 0 }
      });


      res.json({
        success: true,
        message: "Comment deleted successfully"
      });

    } catch (error) {
      console.error("Delete comment error:", error);
      if (error.message === 'User not authenticated') {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },

  getCommentCount: async (req, res) => {
    try {
      const { imageId } = req.params;

      const image = await Image.findById(imageId).select('commentCount');

      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found"
        });
      }

      res.json({
        success: true,
        data: {
          imageId,
          commentCount: image.commentCount
        }
      });

    } catch (error) {
      console.error("Get comment count error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },

  getUserComments: async (req, res) => {
    try {
      const userId = commentController.getUserId(req);
      const { page = 1, limit = 20 } = req.query;

      const comments = await Comment.find({ user: userId })
        .populate({
          path: 'image',
          select: 'imageUrl username',
          populate: {
            path: 'userId',
            select: 'username profilePic'
          }
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Comment.countDocuments({ user: userId });

      res.json({
        success: true,
        data: comments,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error("Get user comments error:", error);
      if (error.message === 'User not authenticated') {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
};

module.exports = commentController;