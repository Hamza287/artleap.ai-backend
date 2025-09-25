const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  userId: { type: String, ref: "User", required: true },
  username: { type: String, required: true },
  creatorEmail: { type: String },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  modelName: { type: String },
  prompt: { type: String },
  privacy: { type: String, enum: ["public", "private", "followers", "personal"], default: "public", index: true }
});

module.exports = mongoose.model("Image", ImageSchema);
