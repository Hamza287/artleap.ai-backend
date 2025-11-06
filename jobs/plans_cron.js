require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const SubscriptionService = require("../service/subscriptionService");

let isInitialized = false;
let isRunning = false;

const connectToMongoDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return;
    }

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

  } catch (error) {
    throw error;
  }
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

const executeWithConnection = async (operation, operationName) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting: ${operationName}`);
  
  try {
    const isConnected = await ensureConnection();
    if (!isConnected) {
      throw new Error('Unable to establish MongoDB connection');
    }
    await operation();
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Completed: ${operationName} - ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Failed: ${operationName} - ${duration}ms - Error: ${error.message}`);
    throw error;
  }
};

const syncPlans = async () => {
  await executeWithConnection(async () => {
    await SubscriptionService.syncPlansWithGooglePlay();
    await SubscriptionService.syncPlansWithAppStore();
  }, 'Plan synchronization');
};

const checkCancellations = async () => {
  await executeWithConnection(
    () => SubscriptionService.checkAndHandleSubscriptionCancellations(),
    'Cancellation check'
  );
};

const processExpiredSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.processExpiredSubscriptions(),
    'Expired subscriptions processing'
  );
};

const processGracePeriodSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.subscriptionManagement.processGracePeriodSubscriptions(),
    'Grace period processing'
  );
};

const syncAllSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.syncAllSubscriptionStatus(),
    'Full subscription sync'
  );
};

const cleanupOrphanedSubscriptions = async () => {
  await executeWithConnection(
    () => SubscriptionService.cleanupOrphanedSubscriptions(),
    'Orphaned subscriptions cleanup'
  );
};

const runAllTasksOnce = async () => {
  if (isRunning || !isInitialized) {
    console.log(`[${new Date().toISOString()}] Skipping: Cron job already running or not initialized`);
    return;
  }
  
  isRunning = true;
  const cycleStart = Date.now();
  console.log(`[${new Date().toISOString()}] Starting cron job cycle`);

  try {
    await syncPlans();                     
    await checkCancellations();            
    await processGracePeriodSubscriptions();
    await syncAllSubscriptions();          
    await cleanupOrphanedSubscriptions();

    const cycleDuration = Date.now() - cycleStart;
    console.log(`[${new Date().toISOString()}] Completed cron job cycle - Total time: ${cycleDuration}ms`);
  } catch (error) {
    const cycleDuration = Date.now() - cycleStart;
    console.error(`[${new Date().toISOString()}] Cron job cycle failed - Total time: ${cycleDuration}ms - Error: ${error.message}`);
    throw error;
  } finally {
    isRunning = false;
  }
};

const initializeCron = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Initializing subscription cron jobs...`);
    await connectToMongoDB();
    isInitialized = true;
    console.log(`[${new Date().toISOString()}] Subscription cron jobs initialized successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize cron jobs: ${error.message}`);
    process.exit(1);
  }
};

cron.schedule('* * * * *', runAllTasksOnce, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

const gracefulShutdown = async (signal) => {
  console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);
  isInitialized = false;
  
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log(`[${new Date().toISOString()}] MongoDB connection closed`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during shutdown: ${error.message}`);
  }
  console.log(`[${new Date().toISOString()}] Shutdown complete`);
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error.message);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
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