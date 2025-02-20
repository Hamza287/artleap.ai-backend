const mongoose = require("mongoose");
const fs = require("fs");
const Image = require("./models/image_model");
const User = require("./models/user");

mongoose.connect("mongodb://localhost:27017/user-auth");

const rawData = fs.readFileSync("CommunityCreations.json");
const jsonData = JSON.parse(rawData);

const importData = async () => {
  try {
    for (let item of jsonData[0].userData || []) {  // ✅ Access userData inside array
      // Ensure required fields exist
      if (!item.userId || !item.username || !item.imageUrl) {
        console.warn(`⚠️ Skipping entry due to missing required fields:`, item);
        continue; // Skip the invalid entry
      }

      // Convert timestamp to Date object
      let createdAt = new Date();
      if (item.timestamp && typeof item.timestamp.seconds !== "undefined") {
        createdAt = new Date(item.timestamp.seconds * 1000);
      }

      // Find user by Firestore ID (string)
      const user = await User.findOne({ _id: item.userId });

      // If user exists, use their ID; otherwise, set it to `null`
      const userId = user ? user._id.toString() : null;

      // Create new Image document
      const newImage = new Image({
        userId,
        username: item.username || "Unknown User",
        imageUrl: item.imageUrl || "",
        createdAt,
        modelName: item.model_name || "Unknown",
        prompt: item.prompt || "No prompt provided",
      });

      const savedImage = await newImage.save();

      // If user exists, add image to their profile
      if (user) {
        user.images.push(savedImage._id);
        await user.save();
        console.log(`✅ Added Image for ${user.username}`);
      }
    }

    console.log("✅ Community Creations imported successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing creations:", err);
    mongoose.connection.close();
  }
};

importData();
