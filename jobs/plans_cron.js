require('dotenv').config();
const cron = require('node-cron');
const mongoose = require('mongoose');
const SubscriptionService = require("../service/subscriptionService");

// MongoDB connection configuration
const connectToMongoDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('[PlansCron] MongoDB already connected');
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
      maxIdleTimeMS: 30000
    });

    // Connection event listeners for production monitoring
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

// Wait for MongoDB connection to be ready
const waitForConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();
  
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('MongoDB connection timeout after ' + maxWaitTime + 'ms');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('[PlansCron] MongoDB connection ready');
};

// Function to sync plans
const syncPlans = async () => {
  const startTime = Date.now();
  
  try {
    await connectToMongoDB();
    await waitForConnection();
    
    // Verify connection with a ping
    await mongoose.connection.db.admin().ping();
    
    // Now sync plans
    await SubscriptionService.syncPlansWithGooglePlay();
    await SubscriptionService.processExpiredSubscriptions();
    
    const duration = Date.now() - startTime;
    console.log(`[PlansCron] Plan synchronization completed successfully in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[PlansCron] Plan synchronization failed:', {
      message: error.message,
      duration: duration + 'ms',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // If it's a connection error, try to reconnect
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

// Initialize database connection
const initializeCron = async () => {
  try {
    await connectToMongoDB();
    await waitForConnection();
    console.log('[PlansCron] Service initialized successfully');
  } catch (error) {
    console.error('[PlansCron] Service initialization failed:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
};

// Schedule the cron job to run daily at midnight (12:00 AM)
cron.schedule('0 0 * * *', async () => {
  console.log('[PlansCron] Midnight plan synchronization started');
  await syncPlans();
}, {
  scheduled: true,
  timezone: "Asia/Karachi"
});

// Graceful shutdown handlers
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
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PlansCron] Unhandled Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

// Initialize the service
initializeCron();