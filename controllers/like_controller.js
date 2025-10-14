const Like = require("../models/like_model");
const Image = require("../models/image_model");
const { saveNotification, sendPushNotification, getDeviceTokens } = require("./../service/firebaseService");

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

    const image = await Image.findById(imageId).populate('userId', 'username');
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

    // Send notification to image owner if it's not the user's own image
    if (String(image.userId._id) !== String(userId)) {
      const deviceTokens = await getDeviceTokens(image.userId._id);

      const notifData = {
        title: "New Like ❤️",
        body: `${like.user.username} liked your creation`,
        data: {
          type: "like",
          imageId: imageId,
          likeId: like._id.toString(),
        },
      };

      const contextInfo = {
        action: "likeImage",
        receiverUserId: image.userId._id,
        imageId: imageId,
        likerId: userId,
        tokenCount: deviceTokens?.length || 0,
      };

      if (deviceTokens && deviceTokens.length > 0) {
        await sendPushNotification(deviceTokens, notifData, contextInfo);
      } else {
        console.warn("⚠️ [Push Debug] No tokens found for user:", image.userId._id);
      }

      await saveNotification({
        userId: image.userId._id,
        type: "user",
        title: notifData.title,
        body: notifData.body,
        data: notifData.data,
      });
    }

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