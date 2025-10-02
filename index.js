require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { authrouter } = require("./routers/auth_router");
const { freePikTxtToImg } = require("./routers/generate_image_route");
const imageRoutes = require("./routers/get_images_route");
const favoriteRouter = require("./routers/favourites_router");
const followRouter = require("./routers/follow_router");
const userRoutes = require("./routers/user_router");
const starryAiRouter = require("./routers/starry_ai_routes");
const leonardoRoutes = require("./routers/leonardoRoutes");
const imageActionRouter = require("./routers/image_action_router");
const notificationRouter = require("./routers/notification_routes");
const subscriptionRouter = require("./routers/subscription_routes");
const { initializeFirebase } = require("./service/firebaseService");
const SubscriptionService = require("./service/subscriptionService");
const subscriptionService = require("./service/subscriptionService");
const imagePrivacyRoutes = require("./routers/image_privacy_route");
const likeRoutes = require("./routers/like_routes");
const commentRoutes = require("./routers/coment_routes");
const savedImageRoutes = require("./routers/saved_image_routes");
const os = require("os");

initializeFirebase();
const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());
app.use(cors());

// API Routes
app.use("/api", authrouter);
app.use("/api", imageRoutes);
app.use("/api", favoriteRouter);
app.use("/api", followRouter);
app.use("/api", userRoutes);
app.use("/api", starryAiRouter);
app.use("/api", leonardoRoutes);
app.use("/api", freePikTxtToImg);
app.use("/api", imageActionRouter);
app.use("/api", notificationRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api", imagePrivacyRoutes);
app.use("/api", likeRoutes);
app.use("/api", commentRoutes);
app.use("/api", savedImageRoutes);

// Database Connection
mongoose
  .connect("mongodb://127.0.0.1:27017/user-auth")
  .then(() => {
    SubscriptionService.initializeDefaultPlans();
    SubscriptionService.syncPlansWithGooglePlay();
    subscriptionService.syncPlansWithAppStore();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  // Get network interfaces
  const interfaces = os.networkInterfaces();
  let localIP = "localhost";

  for (let iface of Object.values(interfaces)) {
    for (let alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
        localIP = alias.address;
      }
    }
  }

  console.log(`🚀 Server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
});


module.exports = app;
