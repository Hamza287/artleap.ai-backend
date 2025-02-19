const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  modelName: { type: String },
  prompt: { type: String },
});

module.exports = mongoose.model("Image", ImageSchema);