// const axios = require("axios");
// const jwt = require("jsonwebtoken");
// const fs = require("fs");
// const PaymentRecord = require("./../../models/recordPayment_model");
// const User = require("./../../models/user");
// const UserSubscription = require("./../../models/user_subscription");
// const SubscriptionPlan = require("./../../models/subscriptionPlan_model");
// const appleConfig = require("./../../config/apple");
// const { isInGracePeriod } = require("./../../utils/subscriptionUtils");

// class AppleCancellationService {
//   constructor() {
//     this.bundleId = appleConfig.bundleId;
//     this.issuerId = appleConfig.issuerId;
//     this.keyId = appleConfig.keyId;
//     this.privateKey = fs.readFileSync(appleConfig.privateKeyPath, "utf8");
//   }

//   async generateToken() {
//     try {
//       const now = Math.floor(Date.now() / 1000);
//       return jwt.sign(
//         {
//           iss: this.issuerId,
//           iat: now,
//           exp: now + 20 * 60,
//           aud: "appstoreconnect-v1",
//           bid: this.bundleId,
//         },
//         this.privateKey,
//         {
//           algorithm: "ES256",
//           header: { kid: this.keyId, typ: "JWT" },
//         }
//       );
//     } catch (error) {
//       throw new Error("Failed to generate App Store Connect API token");
//     }
//   }

//   async getSubscriptionStatus(originalTransactionId) {
//     try {
//       const token = await this.generateToken();
//       const headers = {
//         Authorization: `Bearer ${token}`,
//         "Content-Type": "application/json",
//       };

//       const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${originalTransactionId}`;
      
//       const response = await axios.get(url, { headers });
//       return response.data;
//     } catch (error) {
//       if (error.response?.status === 404) {
//         return { status: "NOT_FOUND" };
//       }

//       if (error.response?.status === 401) {
//         throw new Error("Invalid App Store Connect API credentials");
//       }

//       throw error;
//     }
//   }

//   async getAllSubscriptionsFromAppStore() {
//     try {
//       const allPaymentRecords = await PaymentRecord.find({
//         platform: "ios",
//         $or: [
//           { originalTransactionId: { $exists: true, $ne: null } },
//           { transactionId: { $exists: true, $ne: null } }
//         ]
//       });

//       const results = {
//         processed: 0,
//         updated: 0,
//         errors: 0,
//         details: []
//       };

//       for (const paymentRecord of allPaymentRecords) {
//         try {
//           const transactionId = paymentRecord.originalTransactionId || paymentRecord.transactionId;
//           if (!transactionId) {
//             results.processed++;
//             continue;
//           }

//           const appStoreStatus = await this.getSubscriptionStatusFromAppStore(transactionId);
          
//           if (appStoreStatus) {
//             const needsUpdate = await this.compareAndUpdateLocalRecords(paymentRecord, appStoreStatus);
//             if (needsUpdate) {
//               results.updated++;
//             }
//             results.details.push({
//               paymentId: paymentRecord._id,
//               transactionId: transactionId,
//               localStatus: paymentRecord.status,
//               appStoreStatus: appStoreStatus.finalStatus,
//               updated: needsUpdate
//             });
//           }

//           results.processed++;
          
//           await new Promise(resolve => setTimeout(resolve, 100));
          
//         } catch (error) {
//           results.errors++;
//           console.error(`Error processing payment record ${paymentRecord._id}:`, error);
//         }
//       }

//       return results;
//     } catch (error) {
//       throw new Error(`Failed to fetch all subscriptions from App Store: ${error.message}`);
//     }
//   }

//   async getSubscriptionStatusFromAppStore(transactionId) {
//     try {
//       const subscriptionStatus = await this.getSubscriptionStatus(transactionId);

//       if (subscriptionStatus.status === "NOT_FOUND") {
//         return {
//           isCancelledOrExpired: true,
//           cancellationType: "expired",
//           isInGracePeriod: false,
//           isExpired: true,
//           expiryTime: new Date(),
//           finalStatus: "cancelled",
//           autoRenewing: false,
//           foundInAppStore: false
//         };
//       }

//       const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);
//       return {
//         ...cancellationInfo,
//         foundInAppStore: true
//       };
//     } catch (error) {
//       console.error("Error getting subscription status from App Store:", error);
//       return null;
//     }
//   }

//   async syncAllSubscriptionsWithAppStore() {
//     return await this.getAllSubscriptionsFromAppStore();
//   }

//   async compareAndUpdateLocalRecords(paymentRecord, appStoreStatus) {
//     try {
//       if (paymentRecord.status === appStoreStatus.finalStatus) {
//         return false;
//       }

//       const userId = paymentRecord.userId;
      
//       await PaymentRecord.updateOne(
//         { _id: paymentRecord._id },
//         {
//           $set: {
//             status: appStoreStatus.finalStatus,
//             cancelledAt: appStoreStatus.finalStatus === "cancelled" ? new Date() : paymentRecord.cancelledAt,
//             cancellationType: appStoreStatus.cancellationType,
//             lastChecked: new Date(),
//             expiryDate: appStoreStatus.expiryTime
//           }
//         }
//       );

//       const user = await User.findOne({ _id: userId });
//       if (!user) {
//         return true;
//       }

//       const userSubscription = await UserSubscription.findOne({
//         userId: userId,
//         $or: [{ isActive: true }, { status: { $in: ["active", "grace_period", "cancelled"] } }]
//       });

//       if (appStoreStatus.finalStatus === "cancelled" && appStoreStatus.isExpired) {
//         if (userSubscription) {
//           await UserSubscription.updateOne(
//             { _id: userSubscription._id },
//             {
//               $set: {
//                 autoRenew: false,
//                 isActive: true,
//                 cancelledAt: new Date(),
//                 cancellationReason: appStoreStatus.cancellationType,
//                 status: "cancelled",
//                 endDate: new Date(),
//                 lastUpdated: new Date()
//               }
//             }
//           );
//         }
        
//         await this.downgradeToFreePlan(userId, appStoreStatus.cancellationType);
        
//       } else if (appStoreStatus.finalStatus === "cancelled" && !appStoreStatus.isExpired) {
//         if (userSubscription) {
//           await UserSubscription.updateOne(
//             { _id: userSubscription._id },
//             {
//               $set: {
//                 autoRenew: false,
//                 cancelledAt: new Date(),
//                 cancellationReason: appStoreStatus.cancellationType,
//                 status: "cancelled",
//                 endDate: appStoreStatus.expiryTime,
//                 lastUpdated: new Date()
//               }
//             }
//           );
//         }
        
//         await this.updateUserForCancelledButActive(userId, appStoreStatus.cancellationType, appStoreStatus.expiryTime);
        
//       } else if (appStoreStatus.finalStatus === "grace_period") {
//         if (userSubscription) {
//           await UserSubscription.updateOne(
//             { _id: userSubscription._id },
//             {
//               $set: {
//                 autoRenew: false,
//                 cancelledAt: new Date(),
//                 cancellationReason: appStoreStatus.cancellationType,
//                 status: "grace_period",
//                 endDate: appStoreStatus.expiryTime,
//                 lastUpdated: new Date()
//               }
//             }
//           );
//         }
        
//         await this.updateUserForGracePeriod(userId);
        
//       } else if (appStoreStatus.finalStatus === "active") {
//         if (userSubscription) {
//           await UserSubscription.updateOne(
//             { _id: userSubscription._id },
//             {
//               $set: {
//                 autoRenew: appStoreStatus.autoRenewing,
//                 isActive: true,
//                 status: "active",
//                 endDate: appStoreStatus.expiryTime,
//                 lastUpdated: new Date()
//               }
//             }
//           );
//         }
        
//         await this.updateUserForActiveSubscription(userId, appStoreStatus.autoRenewing);
//       }

//       return true;
//     } catch (error) {
//       console.error("Error comparing and updating local records:", error);
//       return false;
//     }
//   }

//   async updateUserForActiveSubscription(userId, autoRenewing) {
//     try {
//       const user = await User.findOne({ _id: userId });
//       if (user) {
//         user.isSubscribed = true;
//         user.subscriptionStatus = 'active';
//         user.autoRenew = autoRenewing;
//         await user.save();
//       }
//     } catch (error) {
//       console.error("Error updating user for active subscription:", error);
//     }
//   }

//   async updateUserForGracePeriod(userId) {
//     try {
//       const user = await User.findOne({ _id: userId });
//       if (user) {
//         user.subscriptionStatus = 'grace_period';
//         user.planName = 'Premium (Grace Period)';
//         await user.save();
//       }
//     } catch (error) {
//       console.error("Error updating user for grace period:", error);
//     }
//   }

//   async updateUserForCancelledButActive(userId, cancellationType, expiryTime) {
//     try {
//       const user = await User.findOne({ _id: userId });
//       if (user) {
//         user.subscriptionStatus = 'cancelled';
//         user.cancellationReason = cancellationType;
//         user.isSubscribed = true;
//         await user.save();
//       }
//     } catch (error) {
//       console.error("Error updating user for cancelled but active:", error);
//     }
//   }

//   analyzeCancellationStatus(subscriptionData) {
//     if (!subscriptionData) {
//       return { 
//         isCancelled: false, 
//         willCancel: false,
//         finalStatus: "active"
//       };
//     }

//     if (subscriptionData.status === "NOT_FOUND") {
//       return { 
//         isCancelled: false, 
//         willCancel: false,
//         finalStatus: "active"
//       };
//     }

//     let finalStatus = "active";
//     let isCancelled = false;
//     let willCancel = false;
//     let cancellationType = "active";
//     let isExpired = false;
//     let isInGracePeriod = false;
//     let expiryTime = null;
//     let autoRenewing = true;

//     if (subscriptionData.status === "EXPIRED") {
//       finalStatus = "cancelled";
//       isCancelled = true;
//       cancellationType = "expired";
//       isExpired = true;
//     } else if (subscriptionData.data && Array.isArray(subscriptionData.data)) {
//       const latestTransaction = subscriptionData.data[0];
//       if (latestTransaction) {
//         expiryTime = new Date(latestTransaction.expiresDate);
//         const now = new Date();
//         isExpired = expiryTime < now;
//         autoRenewing = latestTransaction.autoRenewStatus === 1;

//         if (isExpired) {
//           isInGracePeriod = isInGracePeriod(expiryTime);
//           finalStatus = isInGracePeriod ? "grace_period" : "cancelled";
//           isCancelled = true;
//           cancellationType = "expired";
//         } else if (!autoRenewing) {
//           finalStatus = "cancelled";
//           willCancel = true;
//           cancellationType = "auto_renew_off";
//         }
//       }
//     }

//     return {
//       isCancelledOrExpired: isCancelled || willCancel,
//       cancellationType,
//       autoRenewing,
//       expiryTime,
//       isExpired,
//       isInGracePeriod,
//       finalStatus,
//       isCancelled,
//       willCancel
//     };
//   }

//   async processAppleSubscriptionCancellation(originalTransactionId) {
//     try {
//       const subscriptionStatus = await this.getSubscriptionStatus(originalTransactionId);

//       if (subscriptionStatus.status === "NOT_FOUND") {
//         return false;
//       }

//       const cancellationInfo = this.analyzeCancellationStatus(subscriptionStatus);

//       if (cancellationInfo.isCancelled || cancellationInfo.willCancel) {
//         await this.handleCancelledAppleSubscription(originalTransactionId, cancellationInfo);
//         return true;
//       }

//       return false;
//     } catch (error) {
//       console.error("Error processing Apple cancellation:", error);
//       return false;
//     }
//   }

//   async handleCancelledAppleSubscription(originalTransactionId, cancellationInfo) {
//     try {
//       const paymentRecord = await PaymentRecord.findOne({
//         $or: [
//           { originalTransactionId: originalTransactionId },
//           { transactionId: originalTransactionId },
//         ],
//       });

//       if (!paymentRecord) {
//         throw new Error("Payment record not found for transaction");
//       }

//       const userId = paymentRecord.userId;
//       const user = await User.findOne({ _id: userId });

//       if (!user) {
//         throw new Error("User not found");
//       }

//       const newStatus = cancellationInfo.isInGracePeriod ? "grace_period" : "cancelled";

//       await PaymentRecord.updateOne(
//         { _id: paymentRecord._id },
//         {
//           $set: {
//             status: newStatus,
//             cancelledAt: new Date(),
//             cancellationReason: cancellationInfo.cancellationType,
//             lastChecked: new Date(),
//             expiryDate: cancellationInfo.expiryTime
//           }
//         }
//       );

//       const activeSubscription = await UserSubscription.findOne({
//         userId: userId,
//         isActive: true,
//       });

//       if (activeSubscription) {
//         if (cancellationInfo.finalStatus === "cancelled" && cancellationInfo.isExpired) {
//           await this.downgradeToFreePlan(userId, cancellationInfo.cancellationType);
//         } else if (cancellationInfo.finalStatus === "cancelled" && !cancellationInfo.isExpired) {
//           await UserSubscription.updateOne(
//             { _id: activeSubscription._id },
//             {
//               $set: {
//                 autoRenew: false,
//                 cancelledAt: new Date(),
//                 cancellationReason: cancellationInfo.cancellationType,
//                 status: "cancelled",
//                 endDate: cancellationInfo.expiryTime,
//                 lastUpdated: new Date()
//               }
//             }
//           );
//           await this.updateUserForCancelledButActive(userId, cancellationInfo.cancellationType, cancellationInfo.expiryTime);
//         } else if (cancellationInfo.finalStatus === "grace_period") {
//           await UserSubscription.updateOne(
//             { _id: activeSubscription._id },
//             {
//               $set: {
//                 autoRenew: false,
//                 cancelledAt: new Date(),
//                 cancellationReason: cancellationInfo.cancellationType,
//                 status: "grace_period",
//                 endDate: cancellationInfo.expiryTime,
//                 lastUpdated: new Date()
//               }
//             }
//           );
//           await this.updateUserForGracePeriod(userId);
//         }
//       }
//     } catch (error) {
//       throw new Error(`Failed to handle Apple cancellation: ${error.message}`);
//     }
//   }

//   async downgradeToFreePlan(userId, cancellationType = "unknown") {
//     try {
//       const freePlan = await SubscriptionPlan.findOne({ type: "free" });

//       if (!freePlan) {
//         throw new Error("Free plan not found");
//       }

//       const user = await User.findOne({ _id: userId });
//       if (user) {
//         user.isSubscribed = false;
//         user.subscriptionStatus = "cancelled";
//         user.cancellationReason = cancellationType;
//         user.planName = "Free";
//         user.planType = "free";
//         user.watermarkEnabled = true;
//         user.totalCredits = 4;
//         user.dailyCredits = 4;
//         user.imageGenerationCredits = 0;
//         user.promptGenerationCredits = 4;
//         user.usedImageCredits = 0;
//         user.usedPromptCredits = 0;
//         user.lastCreditReset = new Date();
//         user.planDowngradedAt = new Date();

//         await user.save();
//       }
//     } catch (error) {
//       throw new Error(`Failed to downgrade to free plan: ${error.message}`);
//     }
//   }

//   async checkAllActiveAppleSubscriptions() {
//     try {
//       const activePayments = await PaymentRecord.find({
//         paymentMethod: "apple",
//         status: "completed",
//         $or: [
//           { expiryDate: { $gt: new Date() } },
//           { expiryDate: { $exists: false } },
//         ],
//       });

//       for (const payment of activePayments) {
//         try {
//           const transactionId = payment.originalTransactionId || payment.transactionId;
//           if (transactionId) {
//             await this.processAppleSubscriptionCancellation(transactionId);
//           }
//         } catch (error) {
//           console.error(`Error checking payment ${payment._id}:`, error);
//         }
//       }
//     } catch (error) {
//       throw new Error(`Failed to check all Apple subscriptions: ${error.message}`);
//     }
//   }

//   async getSubscriptionStats() {
//     try {
//       const totalSubscriptions = await PaymentRecord.countDocuments({ platform: "ios" });
//       const activeSubscriptions = await PaymentRecord.countDocuments({ 
//         platform: "ios", 
//         status: "completed" 
//       });
//       const cancelledSubscriptions = await PaymentRecord.countDocuments({ 
//         platform: "ios", 
//         status: "cancelled" 
//       });
//       const gracePeriodSubscriptions = await PaymentRecord.countDocuments({ 
//         platform: "ios", 
//         status: "grace_period" 
//       });

//       return {
//         total: totalSubscriptions,
//         active: activeSubscriptions,
//         cancelled: cancelledSubscriptions,
//         gracePeriod: gracePeriodSubscriptions
//       };
//     } catch (error) {
//       console.error("Error getting subscription stats:", error);
//       return {};
//     }
//   }
// }

// module.exports = AppleCancellationService;