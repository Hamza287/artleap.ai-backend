const admin = require('firebase-admin');
const Notification = require('./../models/notification_model');
const User = require('./../models/user');

// Initialize Firebase Admin with better error handling
const initializeFirebase = () => {
  try {
    if (!admin.apps.length) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        throw new Error('Firebase service account configuration missing');
      }

      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
      });

      console.log('Firebase Admin initialized successfully');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw new Error('Firebase initialization failed');
  }
};

// Save notification to database with improved validation
const saveNotification = async (notificationData) => {
  try {
    const { userId, type = 'general', title, body, data } = notificationData;

    // Validate required fields
    if (!title || !body) {
      throw new Error('Title and body are required');
    }

    // Validate notification type
    if (!['general', 'user'].includes(type)) {
      throw new Error("Invalid notification type. Must be 'general' or 'user'");
    }

    // Validate userId based on type
    if (type === 'general' && userId) {
      throw new Error('General notifications cannot have a userId');
    }

    if (type === 'user' && !userId) {
      throw new Error('User-specific notifications require a userId');
    }

    // Check for duplicate general notifications in last 24 hours
    if (type === 'general') {
      const duplicate = await Notification.findOne({
        type: 'general',
        title: title.trim(),
        body: body.trim(),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      if (duplicate) {
        throw new Error('Duplicate general notification detected');
      }
    }

    const notification = new Notification({
      userId: type === 'user' ? userId : null,
      type,
      title: title.trim(),
      body: body.trim(),
      data: data || {},
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error saving notification:', error.message);
    
    // Handle specific error cases
    if (error.code === 11000) {
      throw new Error('Duplicate notification prevented');
    }
    
    throw error; // Re-throw for controller to handle
  }
};

// Send push notification with improved error handling
const sendPushNotification = async (deviceTokens, notificationData) => {
  try {
    if (!deviceTokens || !Array.isArray(deviceTokens)) {
      throw new Error('Invalid device tokens array');
    }

    if (deviceTokens.length === 0) {
      console.warn('No device tokens provided, skipping notification');
      return { successCount: 0, failureCount: 0 };
    }

    if (!notificationData?.title || !notificationData?.body) {
      throw new Error('Notification title and body are required');
    }

    // Filter valid tokens
    const validTokens = deviceTokens.filter(t => typeof t === 'string' && t.length > 0);
    
    if (validTokens.length === 0) {
      console.warn('No valid device tokens found after filtering');
      return { successCount: 0, failureCount: 0 };
    }

    // Check if sendMulticast exists
    if (!admin.messaging().sendMulticast) {
      console.warn('sendMulticast not available, falling back to individual sends');
      return await sendIndividualNotifications(validTokens, notificationData);
    }

    const message = {
      notification: {
        title: notificationData.title,
        body: notificationData.body
      },
      data: notificationData.data || {},
      tokens: validTokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    // Log failed tokens if any
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${validTokens[idx]}:`, resp.error);
        }
      });
    }

    console.log(`Notification sent: ${response.successCount} successful, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error.message);
    throw error;
  }
};

// Fallback function for older Firebase versions
const sendIndividualNotifications = async (tokens, notificationData) => {
  let successCount = 0;
  let failureCount = 0;

  for (const token of tokens) {
    try {
      const message = {
        notification: {
          title: notificationData.title,
          body: notificationData.body
        },
        data: notificationData.data || {},
        token: token
      };

      await admin.messaging().send(message);
      successCount++;
    } catch (error) {
      console.error(`Failed to send to token ${token}:`, error);
      failureCount++;
    }
  }

  return { successCount, failureCount };
};

// Get device tokens with improved error handling
const getDeviceTokens = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const user = await User.findOne({ userId })
      .select('deviceTokens')
      .lean();

    if (!user) {
      console.warn(`User not found with ID: ${userId}`);
      return [];
    }

    return Array.isArray(user.deviceTokens) 
      ? user.deviceTokens.filter(t => typeof t === 'string' && t.length > 0)
      : [];
  } catch (error) {
    console.error('Error fetching device tokens:', error.message);
    return []; // Return empty array to allow graceful degradation
  }
};

module.exports = {
  initializeFirebase,
  saveNotification,
  sendPushNotification,
  getDeviceTokens,
};