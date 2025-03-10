
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  _id: { type: String, required: true },  // Explicitly storing Firestore user IDs
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false }, // ✅ Make password optional
  favorites: { type: [mongoose.Schema.Types.ObjectId], ref: "Image", default: [] }, 
  profilePic: { type: String, default: "" },
  dailyCredits: { type: Number, default: 10 },
  isSubscribed: { type: Boolean, default: false },
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: "Image" }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
