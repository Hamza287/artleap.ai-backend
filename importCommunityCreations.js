const mongoose = require("mongoose");
const fs = require("fs");
const Image = require("./models/Image");
const User = require("../models/User");

mongoose.connect("mongodb://localhost:27017/user-auth", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const rawData = fs.readFileSync("CommunityCreations.json");
const jsonData = JSON.parse(rawData);

const importData = async () => {
  try {
    for (let item of jsonData) {
      // Find the user by Firestore user ID
      const user = await User.findOne({ _id: item.userid });

      // If user exists, associate the image with the user
      const newImage = new Image({
        userId: user ? user._id : null,
        username: item.username,
        imageUrl: item.imageUrl,
        createdAt: new Date(item.timestamp._seconds * 1000),
        modelName: item.model_name,
        prompt: item.prompt,
      });

      const savedImage = await newImage.save();

      // If user exists, add image to their profile
      if (user) {
        user.images.push(savedImage._id);
        await user.save();
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
