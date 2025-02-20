const mongoose = require("mongoose");
const fs = require("fs");
const User = require("./models/user"); // Import User model
const Image = require("./models/image_model"); // Import Image model

// **AWS MongoDB Connection**
const MONGO_URI = "mongodb://localhost:27017/user-auth"; // Update if using a remote MongoDB
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
      const user = await User.findOne({ _id: item.id });

      if (!user) {
        console.log(`⚠️ Skipping: User not found for ID: ${item.id}`);
        continue;
      }

      console.log(`✅ Found User: ${user.username} (${user._id})`);

      // **Process Followers**
      for (const follower of item.followers || []) {
        const followerUser = await User.findOne({ _id: follower.id });

        if (followerUser) {
          const followerId = followerUser._id.toString();
          if (!user.followers.includes(followerId)) {
            user.followers.push(followerId);
            console.log(`➡️ Added follower: ${followerUser.username} (${followerId})`);
          }
        }
      }

      // **Process Following**
      for (const following of item.following || []) {
        const followingUser = await User.findOne({ _id: following.userid });

        if (followingUser) {
          const followingId = followingUser._id.toString();
          if (!user.following.includes(followingId)) {
            user.following.push(followingId);
            console.log(`➡️ Added following: ${followingUser.username} (${followingId})`);
          }
        }
      }

      // **Process UserData (Image Generations)**
      const userImages = [];
      for (const image of item.userData || []) {
        let createdAt = new Date();
        if (image.timestamp && typeof image.timestamp._seconds !== "undefined") {
          createdAt = new Date(image.timestamp._seconds * 1000);
        }

        const newImage = new Image({
          userId: user._id, // Link to User
          username: user.username,
          imageUrl: image.imageUrl,
          createdAt,
          modelName: image.model_name || "Unknown",
          prompt: image.prompt || "No prompt provided",
        });

        userImages.push(newImage);
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
