const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  favorites: { type: [mongoose.Schema.Types.ObjectId], ref: "Image", default: [] }, // Ensure default empty array
  profilePic: { type: String, default: "" }, // URL to the profile picture
  dailyCredits: { type: Number, default: 10 }, // Default daily credits
  isSubscribed: { type: Boolean, default: false }, // Subscription status
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: "Image" }], 
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who follow this user
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users this user follows
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);



