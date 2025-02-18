require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { authrouter } = require("./routers/auth_router");
const { generateRouter } = require("./routers/generate_image_route");
const imageRoutes = require("./routers/get_images_route");
const favoriteRouter = require("./routers/favourites_router");
const followRouter = require("./routers/follow_router");
const userRoutes = require("./routers/user_router");
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/auth", authrouter);
app.use("/api", generateRouter);
app.use("/images", imageRoutes);
app.use("/api", favoriteRouter);
app.use("/api", followRouter);
app.use("/api", userRoutes);


// Database Connection
mongoose
  .connect(
    "mongodb://localhost:27017/user-auth"
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

