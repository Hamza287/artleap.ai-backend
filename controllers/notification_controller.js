const mongoose = require("mongoose");
const Notification = require("./../models/notification_model");
const User = require("./../models/user");
const admin = require("firebase-admin");
const {
  saveNotification,
  getDeviceTokens,
  sendPushNotification,
} = require("./../service/firebaseService");

// Helper to check if string is a valid ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findById(userId); // ✅ FIXED
    const hidden = user?.hiddenNotifications || [];

    const aggregate = Notification.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                { userId: userId },
                { isGeneral: true } // ✅ FIXED
              ],
            },
            {
              _id: {
                $nin: hidden.map((id) =>
                  isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
                ),
              },
            },
          ],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          isGeneral: 1, // ✅ Use this instead of 'type'
          title: 1,
          body: 1,
          data: 1,
          isRead: 1,
          createdAt: 1,
        },
      },
    ]);

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    };

    const notifications = await Notification.aggregatePaginate(aggregate, options);

    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching notifications",
    });
  }
};


// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.user;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Notification ID is required",
      });
    }

    // Build query that works with both ObjectId and string IDs
    const query = {
      $or: [{ userId }, { type: "general" }],
    };

    if (isValidObjectId(notificationId)) {
      query._id = new mongoose.Types.ObjectId(notificationId);
    } else {
      query._id = notificationId;
    }

    const notification = await Notification.findOneAndUpdate(
      query,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or not accessible by user",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while marking notification as read",
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Notification ID is required",
      });
    }

    // Find notification by ID (works with both ObjectId and string IDs)
    const idToQuery = isValidObjectId(notificationId)
      ? new mongoose.Types.ObjectId(notificationId)
      : notificationId;

    const notification = await Notification.findOne({ _id: idToQuery });

    if (!notification) {
      console.log("Notification not found");
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Handle general notification (hide for user)
    if (notification.type === "general") {
     const updateResult=  await User.findOneAndUpdate(
        { _id: userId }, // ✅ match _id instead of userId
        { $addToSet: { hiddenNotifications: notification._id } },
        { new: true }
      );

      if (!updateResult) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "General notification hidden for this user",
        data: {
          hiddenNotificationId: notification._id,
          hiddenCount: updateResult.hiddenNotifications.length,
        },
      });
    }

    // Handle user-specific notification (full delete)
    if (notification.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this notification",
      });
    }

    const deleteResult = await Notification.deleteOne({
      _id: notification._id,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or already deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      data: {
        deletedNotificationId: notification._id,
      },
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while deleting notification",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Create notification
const createNotification = async (req, res) => {
  try {
    const { userId: rawUserId, type = "general", title, body, data } = req.body;
    const userId = rawUserId || req.user?._id || null;

    // Basic validation
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    if (!["general", "user"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification type. Must be 'general' or 'user'",
      });
    }

    // Check for conflicting input
    if (type === "general" && userId) {
      return res.status(400).json({
        success: false,
        message: "General notifications cannot have a userId",
      });
    }

    // Validate userId for user-specific notifications
    if (type === "user" && !userId) {
      return res.status(400).json({
        success: false,
        message: "User-specific notifications require a userId",
      });
    }

    // Check for duplicate general notification in last 24h
    if (type === "general") {
      const existing = await Notification.findOne({
        type: "general",
        title: title.trim(),
        body: body.trim(),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (existing) {
        return res.status(200).json({
          success: true,
          data: existing,
          message: "Similar general notification already exists",
        });
      }
    }

    // Save the notification
    const notification = new Notification({
      title,
      body,
      data: data || {},
      type,
      userId: type === "user" ? userId : null,
    });

    await notification.save();

    // Push notification
    if (type === "general") {
      await admin.messaging().send({
        notification: { title, body },
        data: data || {},
        topic: "all",
      });
    } else {
      const tokens = await getDeviceTokens(userId);
      if (tokens.length > 0) {
        await sendPushNotification(tokens, { title, body, data });
      }
    }

    res.status(201).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    const status = error.message.includes("Duplicate") ? 409 : 500;
    res.status(status).json({
      success: false,
      message:
        error.message || "Internal server error while creating notification",
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.user;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        message: "Notification IDs array is required",
      });
    }

    if (notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Notification IDs array cannot be empty",
      });
    }

    // Convert valid ObjectIds and keep strings as-is
    const ids = notificationIds.map((id) =>
      isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id
    );

    // Validate all notification IDs belong to this user
    const userNotifications = await Notification.find({
      _id: { $in: ids },
      $or: [{ userId: userId }, { type: "general" }],
    });

    if (userNotifications.length !== notificationIds.length) {
      return res.status(403).json({
        success: false,
        message: "Some notifications do not belong to user",
      });
    }

    // Update all notifications
    const result = await Notification.updateMany(
      {
        _id: { $in: ids },
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while marking notifications as read",
    });
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
};
