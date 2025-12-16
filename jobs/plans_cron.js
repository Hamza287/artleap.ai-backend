require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const SubscriptionService = require("../service/subscriptionService");
const resetFreeUserCredits = require("./../controllers/freeCreditsReset");

let isInitialized = false;
let isRunning = false;
let shutdownInProgress = false;

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
  if (shutdownInProgress) {
    throw new Error('Shutdown in progress');
  }
  
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
  if (shutdownInProgress) {
    return;
  }
  
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

// New function to reset user credits
const resetUserCredits = async () => {
  await executeWithConnection(async () => {
    await resetFreeUserCredits();
  });
};

const runAllTasksOnce = async () => {
  if (isRunning || !isInitialized || shutdownInProgress) {
    return;
  }
  
  isRunning = true;

  try {
    await syncPlans();                     
    await checkCancellations();            
    await processGracePeriodSubscriptions();
    await syncAllSubscriptions();          
    await cleanupOrphanedSubscriptions();
    await resetUserCredits();              // Add credit reset here
  } catch (error) {
    if (!shutdownInProgress) {
      console.error('Error in cron job:', error);
    }
  } finally {
    isRunning = false;
  }
};

const initializeCron = async () => {
  await connectToMongoDB();
  isInitialized = true;
};

// Schedule the main cron job to run every minute
const cronTask = cron.schedule('* * * * *', runAllTasksOnce, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

// Keep the daily reset at midnight for backward compatibility
cron.schedule("0 0 * * *", async () => {
  console.log('Running daily credit reset...');
  await resetUserCredits();
}, {
  timezone: "Asia/Karachi"
});

const gracefulShutdown = async (signal) => {
  if (shutdownInProgress) {
    return;
  }
  
  shutdownInProgress = true;
  isInitialized = false;
  
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  cronTask.stop();
  
  let waitCount = 0;
  const maxWait = 30; 
  while (isRunning && waitCount < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
    waitCount++;
  }
  
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
  
  console.log('Graceful shutdown completed.');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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
  resetUserCredits,  // Export the new function
  runAllTasksOnce
};