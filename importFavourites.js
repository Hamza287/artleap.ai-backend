const mongoose = require("mongoose");
const fs = require("fs");
const User = require("./models/user");
const Image = require("./models/image_model");

// **MongoDB Connection**
const MONGO_URI = "mongodb://localhost:27017/user-auth";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

const filePath = "userFavourites.json";

// **Check if JSON file exists**
if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: File "${filePath}" not found!`);
  process.exit(1);
}

// **Read & Parse JSON File**
const rawData = fs.readFileSync(filePath);
const jsonData = JSON.parse(rawData);

const importFavorites = async () => {
  try {
    for (const item of jsonData) {
      const user = await User.findOne({ _id: item._id });

      if (!user) {
        console.log(`⚠️ Skipping: User not found for ID: ${item._id}`);
        continue;
      }

      console.log(`✅ Found User: ${user.username} (${user._id})`);

      if (!item.favourites || item.favourites.length === 0) {
        console.log(`⚠️ User ${user.username} has no favorites, skipping...`);
        continue;
      }

      const favoriteImages = [];
      for (const fav of item.favourites) {
        if (!fav.imageUrl || fav.imageUrl.trim() === "") {
          console.warn(`⚠️ Skipping favorite with missing imageUrl for user: ${user.username}`);
          continue;
        }

        let createdAt = new Date(); // Default timestamp

        // **Create Image Document**
        const newImage = new Image({
          userId: user.id, // ✅ Store user ID as `String`
          username: fav.creator_name || "Unknown",
          imageUrl: fav.imageUrl.trim(), // Ensure valid URL
          createdAt,
          modelName: fav.model_name || "Unknown",
          prompt: fav.prompt || "No prompt provided",
        });

        favoriteImages.push(newImage);
      }

      // **Bulk Insert Images & Get their IDs**
      if (favoriteImages.length > 0) {
        const insertedImages = await Image.insertMany(favoriteImages);
        const imageIds = insertedImages.map((img) => img._id);

        // **Update User's Favorite Images**
        await User.updateOne({ _id: user._id }, { $push: { favorites: { $each: imageIds } } });

        console.log(`✅ Added ${imageIds.length} favorite images for user: ${user.username}`);
      } else {
        console.log(`⚠️ No valid favorite images found for user: ${user.username}, skipping insert.`);
      }
    }

    console.log("✅ User Favorites Imported Successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing favorites:", err);
    mongoose.connection.close();
  }
};

// **Run Import Function**
importFavorites();
