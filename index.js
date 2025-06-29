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
const starryAiRouter = require("./routers/starry_ai_routes")
const leonardoRoutes = require("./routers/leonardoRoutes")
const imageActionRouter = require("./routers/image_action_router")

const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/api", authrouter);
app.use("/api", imageRoutes);
app.use("/api", favoriteRouter);
app.use("/api", followRouter);
app.use("/api", userRoutes);
app.use("/api", starryAiRouter);
app.use('/api', leonardoRoutes);
app.use('/api', freePikTxtToImg); 
app.use('/api', imageActionRouter); 



// Database Connection
mongoose
  .connect(
    "mongodb://127.0.0.1:27017/user-auth"
  )
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

// Start the server
app.listen(PORT, '0.0.0.0', () => 
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
);

