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
const isValidObjectId = (id) => {
  console.log(`Checking if ID is valid ObjectId: ${id}`);
  return mongoose.Types.ObjectId.isValid(id);
};

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    console.log("Getting user notifications...");
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    console.log(`Request params - userId: ${userId}, page: ${page}, limit: ${limit}`);

    if (!userId) {
      console.log("User ID is missing in request");
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Get user with hidden notifications
    console.log(`Fetching user with hidden notifications for userId: ${userId}`);
    const user = await User.findById(userId).select('hiddenNotifications');
    console.log(`User found: ${user ? 'Yes' : 'No'}`);
    
    const hiddenNotifications = user?.hiddenNotifications || [];
    console.log(`Hidden notifications count: ${hiddenNotifications.length}`);

    // Convert hidden notification IDs to ObjectId if valid
    const hiddenIds = hiddenNotifications.map(id => {
      const isValid = isValidObjectId(id);
      console.log(`Hidden notification ID: ${id}, isValid: ${isValid}`);
      return isValid ? new mongoose.Types.ObjectId(id) : id;
    });

    console.log("Building aggregation pipeline...");
    const aggregate = Notification.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                { userId: userId },       // User-specific notifications
                { type: 'general' }       // General notifications
              ]
            },
            { 
              _id: { $nin: hiddenIds }    // Exclude hidden notifications
            }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          type: 1,                        // Changed from isGeneral to type
          title: 1,
          body: 1,
          data: 1,
          isRead: 1,
          createdAt: 1
        }
      }
    ]);

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };
    console.log(`Pagination options: ${JSON.stringify(options)}`);

    console.log("Executing aggregate pagination...");
    const notifications = await Notification.aggregatePaginate(aggregate, options);
    console.log(`Found ${notifications.docs.length} notifications`);

    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching notifications",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    console.log("Marking notification as read...");
    const { notificationId } = req.params;
    const { userId } = req.user;

    console.log(`Params - notificationId: ${notificationId}, userId: ${userId}`);

    if (!notificationId) {
      console.log("Notification ID is missing");
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
      console.log("Using ObjectId for query");
    } else {
      query._id = notificationId;
      console.log("Using string ID for query");
    }

    console.log(`Final query: ${JSON.stringify(query)}`);
    const notification = await Notification.findOneAndUpdate(
      query,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      console.log("Notification not found or not accessible");
      return res.status(404).json({
        success: false,
        message: "Notification not found or not accessible by user",
      });
    }

    console.log(`Notification marked as read: ${notification._id}`);
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
    console.log("Deleting notification...");
    const { notificationId } = req.params;
    const { userId } = req.body;

    console.log(`Params - notificationId: ${notificationId}, userId: ${userId}`);

    if (!notificationId) {
      console.log("Notification ID is missing");
      return res.status(400).json({
        success: false,
        message: "Notification ID is required",
      });
    }

    // Find notification by ID (works with both ObjectId and string IDs)
    const idToQuery = isValidObjectId(notificationId)
      ? new mongoose.Types.ObjectId(notificationId)
      : notificationId;
    console.log(`Querying for notification with ID: ${idToQuery}`);

    const notification = await Notification.findOne({ _id: idToQuery });
    console.log(`Notification found: ${notification ? 'Yes' : 'No'}`);

    if (!notification) {
      console.log("Notification not found");
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // Handle general notification (hide for user)
    if (notification.type === "general") {
      console.log("Handling general notification - hiding for user");
      const updateResult = await User.findOneAndUpdate(
        { _id: userId },
        { $addToSet: { hiddenNotifications: notification._id } },
        { new: true }
      );

      if (!updateResult) {
        console.log("User not found for hiding general notification");
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      console.log(`General notification hidden for user. New hidden count: ${updateResult.hiddenNotifications.length}`);
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
    console.log("Handling user-specific notification");
    if (notification.userId !== userId) {
      console.log("User not authorized to delete this notification");
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this notification",
      });
    }

    const deleteResult = await Notification.deleteOne({
      _id: notification._id,
    });
    console.log(`Delete result: ${deleteResult.deletedCount} documents deleted`);

    if (deleteResult.deletedCount === 0) {
      console.log("Notification not found or already deleted");
      return res.status(404).json({
        success: false,
        message: "Notification not found or already deleted",
      });
    }

    console.log(`Notification deleted successfully: ${notification._id}`);
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
    console.log("Creating new notification...");
    const { userId: rawUserId, type = "general", title, body, data } = req.body;
    const userId = rawUserId || req.user?._id || null;

    console.log(`Request body - type: ${type}, title: ${title}, body: ${body}, data: ${JSON.stringify(data)}`);
    console.log(`Resolved userId: ${userId}`);

    // Basic validation
    if (!title || !body) {
      console.log("Title or body missing in request");
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    if (!["general", "user"].includes(type)) {
      console.log(`Invalid notification type: ${type}`);
      return res.status(400).json({
        success: false,
        message: "Invalid notification type. Must be 'general' or 'user'",
      });
    }

    // Check for conflicting input
    if (type === "general" && userId) {
      console.log("General notification with userId is not allowed");
      return res.status(400).json({
        success: false,
        message: "General notifications cannot have a userId",
      });
    }

    // Validate userId for user-specific notifications
    if (type === "user" && !userId) {
      console.log("User-specific notification missing userId");
      return res.status(400).json({
        success: false,
        message: "User-specific notifications require a userId",
      });
    }

    // Check for duplicate general notification in last 24h
    if (type === "general") {
      console.log("Checking for duplicate general notifications...");
      const existing = await Notification.findOne({
        type: "general",
        title: title.trim(),
        body: body.trim(),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (existing) {
        console.log("Duplicate general notification found");
        return res.status(200).json({
          success: true,
          data: existing,
          message: "Similar general notification already exists",
        });
      }
    }

    // Save the notification
    console.log("Creating new notification document...");
    const notification = new Notification({
      title,
      body,
      data: data || {},
      type,
      userId: type === "user" ? userId : null,
    });

    await notification.save();
    console.log(`Notification saved successfully: ${notification._id}`);

    // Push notification
    if (type === "general") {
      console.log("Sending general push notification to 'all' topic");
      await admin.messaging().send({
        notification: { title, body },
        data: data || {},
        topic: "all",
      });
    } else {
      console.log(`Getting device tokens for user: ${userId}`);
      const tokens = await getDeviceTokens(userId);
      console.log(`Found ${tokens.length} device tokens`);
      
      if (tokens.length > 0) {
        console.log("Sending push notification to user devices");
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
      message: error.message || "Internal server error while creating notification",
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    console.log("Marking all notifications as read...");
    const { userId } = req.user;
    const { notificationIds } = req.body;

    console.log(`Request - userId: ${userId}, notificationIds: ${JSON.stringify(notificationIds)}`);

    if (!notificationIds || !Array.isArray(notificationIds)) {
      console.log("Invalid or missing notificationIds array");
      return res.status(400).json({
        success: false,
        message: "Notification IDs array is required",
      });
    }

    if (notificationIds.length === 0) {
      console.log("Empty notificationIds array");
      return res.status(400).json({
        success: false,
        message: "Notification IDs array cannot be empty",
      });
    }

    // Convert valid ObjectIds and keep strings as-is
    const ids = notificationIds.map((id) => {
      const isValid = isValidObjectId(id);
      console.log(`Notification ID: ${id}, isValid: ${isValid}`);
      return isValid ? new mongoose.Types.ObjectId(id) : id;
    });

    // Validate all notification IDs belong to this user
    console.log("Validating notification ownership...");
    const userNotifications = await Notification.find({
      _id: { $in: ids },
      $or: [{ userId: userId }, { type: "general" }],
    });

    console.log(`Found ${userNotifications.length} matching notifications`);
    if (userNotifications.length !== notificationIds.length) {
      console.log("Some notifications don't belong to user");
      return res.status(403).json({
        success: false,
        message: "Some notifications do not belong to user",
      });
    }

    // Update all notifications
    console.log("Updating notifications to mark as read...");
    const result = await Notification.updateMany(
      {
        _id: { $in: ids },
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    console.log(`Update result - matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
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