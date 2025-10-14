const admin = require('firebase-admin');
const Notification = require('./../models/notification_model');
const User = require('./../models/user');
const FcmToken = require("./../models/fcm_token_model");

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
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw new Error('Firebase initialization failed');
  }
};

const saveNotification = async (notificationData) => {
  try {
    const { userId, type = 'general', title, body, data } = notificationData;


    if (!title || !body) {
      throw new Error('Title and body are required');
    }

    if (!['general', 'user'].includes(type)) {
      throw new Error("Invalid notification type. Must be 'general' or 'user'");
    }

    if (type === 'general' && userId) {
      throw new Error('General notifications cannot have a userId');
    }

    if (type === 'user' && !userId) {
      throw new Error('User-specific notifications require a userId');
    }

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
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error saving notification:', error.message);
    
    if (error.code === 11000) {
      throw new Error('Duplicate notification prevented');
    }
    
    throw error;
  }
};

const sendPushNotification = async (deviceTokens, notificationData, contextInfo = {}) => {
  try {
    if (!deviceTokens || !Array.isArray(deviceTokens)) {
      console.error("❌ [Push Debug] Invalid deviceTokens:", deviceTokens);
      throw new Error("Invalid device tokens array");
    }

    if (deviceTokens.length === 0) {
      console.warn("⚠️ [Push Debug] No device tokens provided. Skipping notification send.");
      return { successCount: 0, failureCount: 0, message: "No device tokens" };
    }

    if (!notificationData?.title || !notificationData?.body) {
      console.error("❌ [Push Debug] Missing title/body:", notificationData);
      throw new Error("Notification title and body are required");
    }

    const validTokens = deviceTokens.filter(t => typeof t === "string" && t.trim().length > 0);
    console.log(`📲 [Push Debug] ${validTokens.length}/${deviceTokens.length} valid tokens after filtering.`);

    if (validTokens.length === 0) {
      console.warn("⚠️ [Push Debug] No valid tokens found after filtering.");
      return { successCount: 0, failureCount: 0, message: "No valid tokens" };
    }

    if (!admin.messaging().sendMulticast) {
      console.warn("⚠️ [Push Debug] sendMulticast not available. Falling back to individual sends.");
      return await sendIndividualNotifications(validTokens, notificationData);
    }

    const message = {
      notification: {
        title: notificationData.title,
        body: notificationData.body,
      },
      data: notificationData.data || {},
      tokens: validTokens,
    };

    console.log("📦 [Push Debug] Prepared FCM message:", JSON.stringify(message, null, 2));

    const response = await admin.messaging().sendMulticast(message);
    console.log("✅ [Push Debug] FCM sendMulticast response summary:", {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    // Detailed per-token logging
    response.responses.forEach((resp, i) => {
      if (resp.success) {
        console.log(`✅ [Push Debug] Success → Token [${i}]`);
      } else {
        console.error(`❌ [Push Debug] Failed → Token [${i}]:`, validTokens[i], resp.error?.message || resp.error);
      }
    });

    return response;
  } catch (error) {
    console.error("💥 [Push Debug] Error sending push notification:", error);
    throw error;
  }
};

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

const getDeviceTokens = async (userId) => {
  try {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const record = await FcmToken.findOne({ userId: userId.toString() }).lean();

    if (!record) {
      console.warn(`[Push Debug] No DeviceToken record found for user: ${userId}`);
      return [];
    }

    if (!Array.isArray(record.tokens) || record.tokens.length === 0) {
      console.warn(`[Push Debug] Empty tokens array for user: ${userId}`);
      return [];
    }

    console.log(`[Push Debug] Tokens for user ${userId}:`, record.tokens);
    return record.tokens;
  } catch (error) {
    console.error("Error fetching device tokens:", error.message);
    return [];
  }
};

module.exports = {
  initializeFirebase,
  saveNotification,
  sendPushNotification,
  getDeviceTokens,
};