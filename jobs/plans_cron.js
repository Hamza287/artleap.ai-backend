require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const SubscriptionService = require("../service/subscriptionService");

const connectToMongoDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) return;

    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/user-auth';

    await mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000
    });

    mongoose.connection.on('error', (err) => {
      console.error('[PlansCron] MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[PlansCron] MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[PlansCron] MongoDB reconnected');
    });

  } catch (error) {
    console.error('[PlansCron] Failed to connect to MongoDB:', {
      message: error.message,
      code: error.code,
      codeName: error.codeName
    });
    throw error;
  }
};

const waitForConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('MongoDB connection timeout after ' + maxWaitTime + 'ms');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

const syncPlans = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.syncPlansWithGooglePlay();
    await SubscriptionService.syncPlansWithAppStore();
    await SubscriptionService.processExpiredSubscriptions();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Plan synchronization completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Plan synchronization failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('connection') || error.message.includes('timeout')) {
      try {
        await mongoose.connection.close();
        await connectToMongoDB();
      } catch (reconnectError) {
        console.error('[PlansCron] Reconnection failed:', {
          message: reconnectError.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
};

const checkCancellations = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.checkAndHandleSubscriptionCancellations();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Cancellation check completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Cancellation check failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    if (error.message.includes('connection') || error.message.includes('timeout')) {
      try {
        await mongoose.connection.close();
        await connectToMongoDB();
      } catch (reconnectError) {
        console.error('[PlansCron] Reconnection failed:', {
          message: reconnectError.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
};

const processExpiredSubscriptions = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.processExpiredSubscriptions();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Expired subscriptions processing completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Expired subscriptions processing failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};

const processGracePeriodSubscriptions = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.subscriptionManagement.processGracePeriodSubscriptions();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Grace period processing completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Grace period processing failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};

const syncAllSubscriptions = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.syncAllSubscriptionStatus();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Full subscription sync completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Full subscription sync failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};

const cleanupOrphanedSubscriptions = async () => {
  const startTime = Date.now();
  try {
    await connectToMongoDB();
    await waitForConnection();
    await mongoose.connection.db.admin().ping();

    await SubscriptionService.cleanupOrphanedSubscriptions();

    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Orphaned subscriptions cleanup completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Orphaned subscriptions cleanup failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
};

// const generateSubscriptionHealthReport = async () => {
//   const startTime = Date.now();
//   try {
//     await connectToMongoDB();
//     await waitForConnection();
//     await mongoose.connection.db.admin().ping();

//     const report = await SubscriptionService.getSubscriptionHealthReport();

//     const duration = Date.now() - startTime;
//     console.log(`[PlansCron] Health report generated in ${duration}ms`, {
//       totalSubscriptions: report.localSubscriptions?.total || 0,
//       activeSubscriptions: report.localSubscriptions?.active || 0,
//       expiredSubscriptions: report.localSubscriptions?.expired || 0,
//       gracePeriodSubscriptions: report.localSubscriptions?.gracePeriod || 0,
//       issuesFound: report.issues?.length || 0
//     });
//   } catch (error) {
//     const duration = Date.now() - startTime;
//     console.error('[PlansCron] Health report generation failed:', {
//       message: error.message,
//       duration: duration + 'ms',
//       stack: error.stack,
//       timestamp: new Date().toISOString()
//     });
//   }
// };

let isRunning = false;

const runAllTasksOnce = async () => {
  if (isRunning) {
    console.warn('[PlansCron] Previous cycle still running; skipping this minute.');
    return;
  }
  isRunning = true;
  const cycleStart = Date.now();
  console.log('[PlansCron] Minute cycle started');

  try {
    
    await syncPlans();                     
    await checkCancellations();            
    await processGracePeriodSubscriptions();
    await syncAllSubscriptions();          
    await cleanupOrphanedSubscriptions();    
    // await generateSubscriptionHealthReport();

    const cycleDuration = Date.now() - cycleStart;
    console.log(`[PlansCron] Minute cycle completed in ${cycleDuration}ms`);
  } catch (e) {
    console.error('[PlansCron] Minute cycle failed:', {
      message: e.message,
      stack: e.stack,
      timestamp: new Date().toISOString()
    });
  } finally {
    isRunning = false;
  }
};

const initializeCron = async () => {
  try {
    await connectToMongoDB();
    await waitForConnection();
    console.log('[PlansCron] Subscription cron service initialized successfully');
  } catch (error) {
    console.error('[PlansCron] Service initialization failed:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
};

cron.schedule('* * * * *', async () => {
  await runAllTasksOnce();
}, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

const gracefulShutdown = async (signal) => {
  console.log(`[PlansCron] Received ${signal}, shutting down gracefully...`);
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('[PlansCron] MongoDB connection closed');
    }
  } catch (error) {
    console.error('[PlansCron] Error during shutdown:', {
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('[PlansCron] Uncaught Exception:', error);
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
  // generateSubscriptionHealthReport,
  runAllTasksOnce
};
