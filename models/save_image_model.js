const mongoose = require("mongoose");

const SavedImageSchema = new mongoose.Schema({
  image: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Image",
    required: true
  },
  user: {
    type: String,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

SavedImageSchema.index({ image: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("SavedImage", SavedImageSchema);