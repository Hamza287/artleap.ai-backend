const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false },
  favorites: { type: [mongoose.Schema.Types.ObjectId], ref: "Image", default: [] },
  profilePic: { type: String, default: "" },
  dailyCredits: { type: Number, default: 4 },
  isSubscribed: { type: Boolean, default: false },
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: "Image" }],
  lastCreditReset: { type: Date, default: null },
  followers: [{ type: mongoose.Schema.Types.Mixed }],
  following: [{ type: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  hiddenNotifications: { type: [String], default: [] },
  currentSubscription: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "UserSubscription" 
  },
  subscriptionStatus: { 
    type: String, 
    enum: ['active', 'expired', 'cancelled', 'none'], 
    default: 'none' 
  },
  planName: { type: String, default: "Free" }, 
  totalCredits: { type: Number, default: 4 },
  usedImageCredits: { type: Number, default: 0 },
  usedPromptCredits: { type: Number, default: 0 },
  hasActiveTrial: { type: Boolean, default: false },
  paymentMethods: [{
    type: { type: String, enum: ['google_pay', 'apple_pay', 'card'] },
    details: { type: mongoose.Schema.Types.Mixed },
    isDefault: { type: Boolean, default: false }
  }],
  watermarkEnabled: { type: Boolean, default: true }
});

module.exports = mongoose.model("User", UserSchema);