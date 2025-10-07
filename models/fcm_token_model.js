const mongoose = require("mongoose");

const fcmTokenSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  tokens: [{ type: String }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("FcmToken", fcmTokenSchema);
