const mongoose = require("mongoose");
const fs = require("fs");
const Image = require("./models/image_model");
const User = require("./models/user");

// **MongoDB Connection (Use ENV for EC2)**
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/user-auth";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// **Check if JSON file exists**
const filePath = "CommunityCreations.json";
if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: File "${filePath}" not found!`);
  process.exit(1);
}

// **Read & Parse JSON File**
const rawData = fs.readFileSync(filePath);
const jsonData = JSON.parse(rawData);

const importData = async () => {
  try {
    for (const item of jsonData[0].userData || []) {
      if (!item.userId || !item.username || !item.imageUrl) {
        console.warn(`⚠️ Skipping entry due to missing required fields:`, item);
        continue;
      }

      // **Convert timestamp**
      let createdAt = new Date();
      if (item.timestamp && typeof item.timestamp.seconds !== "undefined") {
        createdAt = new Date(item.timestamp.seconds * 1000);
      }

      // **Find user by Firestore ID (_id is a STRING, not ObjectId)**
      const user = await User.findOne({ _id: item.userId });

      if (!user) {
        console.warn(`⚠️ Skipping image because user not found: ${item.userId}`);
        continue; // 🚀 Skip the image if the user doesn't exist
      }

      // **Create new Image document**
      const newImage = new Image({
        userId: user._id, // ✅ Store user ID correctly
        username: item.username || "Unknown User",
        imageUrl: item.imageUrl || "",
        createdAt,
        modelName: item.model_name || "Unknown",
        prompt: item.prompt || "No prompt provided",
      });

      const savedImage = await newImage.save();

      // **Attach image to user if user exists**
      user.images.push(savedImage._id);
      await user.save();
      console.log(`✅ Added Image for ${user.username}`);
    }

    console.log("✅ Community Creations imported successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing creations:", err);
    mongoose.connection.close();
  }
};

// **Run Import Function**
importData();
