const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  userId: { type: String, ref: "User", required: true },  // ✅ Store Firestore ID as String
  username: { type: String, required: true },
  creatorEmail: { type: String },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  modelName: { type: String },
  prompt: { type: String },
});

module.exports = mongoose.model("Image", ImageSchema);