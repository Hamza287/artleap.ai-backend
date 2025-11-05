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
    console.error('[PlansCron] Failed to connect to MongoDB:', error.message);
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
    console.warn('[PlansCron] MongoDB ping failed, reconnecting...');
    await mongoose.connection.close();
    await connectToMongoDB();
    return mongoose.connection.readyState === 1;
  }
};

const executeWithConnection = async (operation, operationName) => {
  const startTime = Date.now();
  
  try {
    const isConnected = await ensureConnection();
    if (!isConnected) {
      throw new Error('Unable to establish MongoDB connection');
    }

    await operation();
    const duration = Date.now() - startTime;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[PlansCron] ${operationName} failed:`, {
      message: error.message,
      duration: `${duration}ms`
    });
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
    return;
  }
  
  isRunning = true;
  const cycleStart = Date.now();

  try {
    await syncPlans();                     
    await checkCancellations();            
    await processGracePeriodSubscriptions();
    await syncAllSubscriptions();          
    await cleanupOrphanedSubscriptions();

    const cycleDuration = Date.now() - cycleStart;
  } catch (error) {
    console.error('[PlansCron] Minute cycle failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const initializeCron = async () => {
  try {
    await connectToMongoDB();
    isInitialized = true;
  } catch (error) {
    console.error('[PlansCron] Service initialization failed:', error.message);
    process.exit(1);
  }
};

cron.schedule('* * * * *', runAllTasksOnce, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

const gracefulShutdown = async (signal) => {
  isInitialized = false;
  
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  } catch (error) {
    console.error('[PlansCron] Error during shutdown:', error.message);
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('[PlansCron] Uncaught Exception:', error.message);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[PlansCron] Unhandled Rejection:', reason);
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