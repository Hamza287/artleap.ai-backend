const Like = require("../models/like_model");
const Image = require("../models/image_model");

const likeController = {

  getUserId: (req) => {
    if (!req.user || !req.user.userId) {
      throw new Error('User not authenticated');
    }
    return req.user.userId;
  },

  likeImage: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = likeController.getUserId(req); 

      const image = await Image.findById(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found"
        });
      }

      const existingLike = await Like.findOne({
        image: imageId,
        user: userId
      });

      if (existingLike) {
        return res.status(400).json({
          success: false,
          message: "Image already liked"
        });
      }

      const like = new Like({
        image: imageId,
        user: userId
      });

      await like.save();
      await like.populate('user', 'username profilePic');

      res.status(201).json({
        success: true,
        message: "Image liked successfully",
        data: like
      });

    } catch (error) {
      console.error("Like image error:", error);
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

  unlikeImage: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = likeController.getUserId(req); // Use userId instead of id

      const like = await Like.findOneAndDelete({
        image: imageId,
        user: userId
      });

      if (!like) {
        return res.status(404).json({
          success: false,
          message: "Like not found"
        });
      }

      res.json({
        success: true,
        message: "Image unliked successfully"
      });

    } catch (error) {
      console.error("Unlike image error:", error);
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

  getImageLikes: async (req, res) => {
    try {
      const { imageId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const likes = await Like.find({ image: imageId })
        .populate('user', 'username profilePic')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Like.countDocuments({ image: imageId });

      res.json({
        success: true,
        data: likes,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error("Get image likes error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },

  getLikeCount: async (req, res) => {
    try {
      const { imageId } = req.params;

      const likeCount = await Like.countDocuments({ image: imageId });

      res.json({
        success: true,
        data: {
          imageId,
          likeCount
        }
      });

    } catch (error) {
      console.error("Get like count error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  },
  checkUserLike: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = likeController.getUserId(req); 

      const like = await Like.findOne({
        image: imageId,
        user: userId
      });

      res.json({
        success: true,
        data: {
          isLiked: !!like,
          like
        }
      });

    } catch (error) {
      console.error("Check user like error:", error);
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

  getUserLikes: async (req, res) => {
    try {
      const userId = likeController.getUserId(req); // Use userId instead of id
      const { page = 1, limit = 20 } = req.query;

      const likes = await Like.find({ user: userId })
        .populate({
          path: 'image',
          populate: {
            path: 'userId',
            select: 'username profilePic'
          }
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Like.countDocuments({ user: userId });

      res.json({
        success: true,
        data: likes,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error("Get user likes error:", error);
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

module.exports = likeController;