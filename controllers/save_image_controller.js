const SavedImage = require("../models/save_image_model");
const Image = require("../models/image_model");

const savedImageController = {
  getUserId: (req) => {
    if (!req.user || !req.user.userId) {
      throw new Error('User not authenticated');
    }
    return req.user.userId;
  },

  saveImage: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = savedImageController.getUserId(req);

      const image = await Image.findById(imageId);
      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found"
        });
      }

      const existingSave = await SavedImage.findOne({
        image: imageId,
        user: userId
      });

      if (existingSave) {
        return res.status(400).json({
          success: false,
          message: "Image already saved"
        });
      }

      const savedImage = new SavedImage({
        image: imageId,
        user: userId
      });

      await savedImage.save();

      await savedImage.populate({
        path: 'image',
        populate: {
          path: 'userId',
          select: 'username profilePic'
        }
      });

      res.status(201).json({
        success: true,
        message: "Image saved successfully",
        data: savedImage
      });

    } catch (error) {
      console.error("Save image error:", error);
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

  unsaveImage: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = savedImageController.getUserId(req);

      const savedImage = await SavedImage.findOneAndDelete({
        image: imageId,
        user: userId
      });

      if (!savedImage) {
        return res.status(404).json({
          success: false,
          message: "Saved image not found"
        });
      }

      res.json({
        success: true,
        message: "Image unsaved successfully"
      });

    } catch (error) {
      console.error("Unsave image error:", error);
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
  
  getUserSavedImages: async (req, res) => {
    try {
      const userId = savedImageController.getUserId(req);
      const { page = 1, limit = 20 } = req.query;

      const savedImages = await SavedImage.find({ user: userId })
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

      const total = await SavedImage.countDocuments({ user: userId });

      res.json({
        success: true,
        data: savedImages,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error("Get user saved images error:", error);
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

  checkUserSave: async (req, res) => {
    try {
      const { imageId } = req.params;
      const userId = savedImageController.getUserId(req);

      const savedImage = await SavedImage.findOne({
        image: imageId,
        user: userId
      });

      res.json({
        success: true,
        data: {
          isSaved: !!savedImage,
          savedImage
        }
      });

    } catch (error) {
      console.error("Check user save error:", error);
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

  getSavedCount: async (req, res) => {
    try {
      const userId = savedImageController.getUserId(req);

      const savedCount = await SavedImage.countDocuments({ user: userId });

      res.json({
        success: true,
        data: {
          userId,
          savedCount
        }
      });

    } catch (error) {
      console.error("Get saved count error:", error);
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

module.exports = savedImageController;