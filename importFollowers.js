const mongoose = require("mongoose");
const fs = require("fs");
const User = require("./models/user"); // Import User model
const Image = require("./models/image_model"); // Import Image model

// **MongoDB Connection**
const MONGO_URI = "mongodb://localhost:27017/user-auth"; // Update if using AWS or remote MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

const filePath = "usersProfileData.json";

// **Check if JSON file exists**
if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: File "${filePath}" not found!`);
  process.exit(1);
}

// **Read & Parse JSON File**
const rawData = fs.readFileSync(filePath);
const jsonData = JSON.parse(rawData);

const importData = async () => {
  try {
    for (const item of jsonData) {
      if (!item.id || typeof item.id !== "string") {
        console.warn(`⚠️ Skipping entry due to missing or invalid user ID:`, item);
        continue;
      }

      const user = await User.findOne({ _id: item.id });

      if (!user) {
        console.warn(`⚠️ Skipping: User not found for ID: ${item.id}`);
        continue;
      }

      console.log(`✅ Found User: ${user.username} (${user.id})`);

      // **Ensure user.followers, user.following, and user.images exist as arrays**
      if (!Array.isArray(user.followers)) user.followers = [];
      if (!Array.isArray(user.following)) user.following = [];
      if (!Array.isArray(user.images)) user.images = [];

      // **Process Followers**
      if (Array.isArray(item.followers)) {
        for (const follower of item.followers) {
          if (!follower.id || typeof follower.id !== "string") {
            console.warn(`⚠️ Skipping invalid follower entry for user: ${user.username}`);
            continue;
          }

          const followerUser = await User.findOne({ _id: follower.id });

          if (followerUser) {
            const followerId = new mongoose.Types.ObjectId(); // Generate ObjectId
            if (!user.followers.some(id => id.equals(followerId))) {
              user.followers.push(followerId);
              console.log(`➡️ Added follower: ${followerUser.username} (${followerId})`);
            }
          } else {
            console.warn(`⚠️ Skipping follower: User not found for ID: ${follower._id}`);
          }
        }
      }

      // **Process Following**
      if (Array.isArray(item.following)) {
        for (const following of item.following) {
          if (!following.userid || typeof following.userid !== "string") {
            console.warn(`⚠️ Skipping invalid following entry for user: ${user.username}`);
            continue;
          }

          const followingUser = await User.findOne({ _id: following.user_id });

          if (followingUser) {
            const followingId = new mongoose.Types.ObjectId(); // Generate ObjectId
            if (!user.following.some(id => id.equals(followingId))) {
              user.following.push(followingId);
              console.log(`➡️ Added following: ${followingUser.username} (${followingId})`);
            }
          } else {
            console.warn(`⚠️ Skipping following: User not found for ID: ${following.user_id}`);
          }
        }
      }

      // **Process UserData (Image Generations)**
      const userImages = [];
      if (Array.isArray(item.userData)) {
        for (const image of item.userData) {
          if (!image.imageUrl || typeof image.imageUrl !== "string") {
            console.warn(`⚠️ Skipping image with missing URL for user: ${user.username}`);
            continue;
          }

          let createdAt = new Date();
          if (image.timestamp && typeof image.timestamp._seconds !== "undefined") {
            createdAt = new Date(image.timestamp._seconds * 1000);
          }

          const newImage = new Image({
            userId: user.id, // Link to User
            username: user.username,
            imageUrl: image.imageUrl.trim(),
            createdAt,
            modelName: image.model_name || "Unknown",
            prompt: image.prompt || "No prompt provided",
          });

          userImages.push(newImage);
        }
      }

      // **Bulk Insert Images**
      if (userImages.length > 0) {
        const insertedImages = await Image.insertMany(userImages);
        const imageIds = insertedImages.map((img) => img._id);

        // **Update User Document with Image References**
        await User.updateOne({ _id: user._id }, { $push: { images: { $each: imageIds } } });
        console.log(`✅ Added ${imageIds.length} images for user: ${user.username}`);
      }

      // **Save User Updates**
      await user.save();
      console.log(`✅ Updated user: ${user.username} with followers, following, and images`);
    }

    console.log("✅ Data Import Completed Successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing data:", err);
    mongoose.connection.close();
  }
};

// **Run Import Function**
importData();
