const { saveNotification, sendPushNotification, getDeviceTokens } = require("./firebaseService");

const SendNotificationService = {
  sendCustomNotification: async (receiverUserId, senderUserId, notificationConfig) => {
    try {
      if (String(receiverUserId) === String(senderUserId)) {
        return;
      }

      const deviceTokens = await getDeviceTokens(receiverUserId);

      const notifData = {
        title: notificationConfig.title,
        body: notificationConfig.body,
        data: notificationConfig.data || {},
      };

      const contextInfo = {
        action: notificationConfig.action || "custom",
        receiverUserId: receiverUserId,
        senderUserId: senderUserId,
        tokenCount: deviceTokens?.length || 0,
        ...notificationConfig.contextInfo
      };

      if (deviceTokens.length > 0) {
        await sendPushNotification(deviceTokens, notifData, contextInfo);
      } else {
        console.warn("⚠️ [Push Debug] No tokens found for user:", receiverUserId);
      }

      await saveNotification({
        userId: receiverUserId,
        type: notificationConfig.type || "user",
        title: notifData.title,
        body: notifData.body,
        data: notifData.data,
      });

    } catch (error) {
      console.error("Notification service error:", error);
      throw error;
    }
  }
};

module.exports = SendNotificationService;