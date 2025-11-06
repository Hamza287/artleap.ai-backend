require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const SubscriptionService = require("../service/subscriptionService");

let isInitialized = false;
let isRunning = false;

const connectToMongoDB = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/user-auth';

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    retryWrites: true,
    retryReads: true
  });
};

const ensureConnection = async () => {
  if (mongoose.connection.readyState !== 1) {
    await connectToMongoDB();
  }
  
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    await mongoose.connection.close();
    await connectToMongoDB();
    return mongoose.connection.readyState === 1;
  }
};

const executeWithConnection = async (operation) => {
  const isConnected = await ensureConnection();
  if (!isConnected) {
    throw new Error('Unable to establish MongoDB connection');
  }
  await operation();
};

const syncPlans = async () => {
  await executeWithConnection(async () => {
    await SubscriptionService.syncPlansWithGooglePlay();
    await SubscriptionService.syncPlansWithAppStore();
  });
};

const checkCancellations = async () => {
  await executeWithConnection(
    () => SubscriptionService.checkAndHandleSubscriptionCancellations()
  );
};

const processExpiredSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.processExpiredSubscriptions()
  );
};

const processGracePeriodSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.subscriptionManagement.processGracePeriodSubscriptions()
  );
};

const syncAllSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.syncAllSubscriptionStatus()
  );
};

const cleanupOrphanedSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.cleanupOrphanedSubscriptions()
  );
};

const runAllTasksOnce = async () => {
  if (isRunning || !isInitialized) {
    return;
  }
  
  isRunning = true;

  try {
    await syncPlans();                     
    await checkCancellations();            
    await processGracePeriodSubscriptions();
    await syncAllSubscriptions();          
    await cleanupOrphanedSubscriptions();
  } finally {
    isRunning = false;
  }
};

const initializeCron = async () => {
  await connectToMongoDB();
  isInitialized = true;
};

cron.schedule('* * * * *', runAllTasksOnce, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

const gracefulShutdown = async (signal) => {
  isInitialized = false;
  
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  gracefulShutdown('unhandledRejection');
});

initializeCron();

module.exports = {
  syncPlans,
  checkCancellations,
  processExpiredSubscriptions,
  processGracePeriodSubscriptions,
  syncAllSubscriptions,
  cleanupOrphanedSubscriptions,
  runAllTasksOnce
};