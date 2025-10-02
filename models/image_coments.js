const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
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
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

CommentSchema.index({ image: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", CommentSchema);