const mongoose = require("mongoose");
const fs = require("fs");
const User = require("./models/user");

// **MongoDB Connection**
const MONGO_URI = "mongodb://localhost:27017/user-auth";
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
      // **Find User**
      const user = await User.findOne({ _id: item.id });

      if (!user) {
        console.log(`⚠️ Skipping: User not found for ID: ${item.id}`);
        continue;
      }

      console.log(`✅ Found User: ${user.username} (${user._id})`);

      // **Ensure fields exist (Avoid undefined issues)**
      if (!Array.isArray(user.followers)) user.followers = [];
      if (!Array.isArray(user.following)) user.following = [];

      // **Process Followers**
      for (const follower of item.followers || []) {
        const followerUser = await User.findOne({ _id: follower.id });

        if (followerUser) {
          const followerId = new mongoose.Types.ObjectId(followerUser._id); // ✅ Convert to ObjectId
          if (!user.followers.some((id) => id.toString() === followerId.toString())) {
            user.followers.push(followerId);
            console.log(`➡️ Added follower: ${followerUser.username} (${followerId})`);
          }
        } else {
          console.log(`⚠️ Skipping follower: User not found for ID: ${follower.id}`);
        }
      }

      // **Process Following**
      for (const following of item.following || []) {
        const followingUser = await User.findOne({ _id: following.userid });

        if (followingUser) {
          const followingId = new mongoose.Types.ObjectId(followingUser._id); // ✅ Convert to ObjectId
          if (!user.following.some((id) => id.toString() === followingId.toString())) {
            user.following.push(followingId);
            console.log(`➡️ Added following: ${followingUser.username} (${followingId})`);
          }
        } else {
          console.log(`⚠️ Skipping following: User not found for ID: ${following.userid}`);
        }
      }

      // **Update User Document in DB**
      await user.save();
      console.log(`✅ Updated user: ${user.username}`);
    }

    console.log("✅ Followers & Following Imported Successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing data:", err);
    mongoose.connection.close();
  }
};

// **Run Import Function**
importData();
