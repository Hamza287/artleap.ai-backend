const mongoose = require("mongoose");

const userSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, ref: "User", required: true },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubscriptionPlan",
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isTrial: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  paymentMethod: { type: String },
  autoRenew: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  planSnapshot: {
    name: { type: String, required: true },
    type: { type: String, required: true },
    price: { type: Number, required: true },
    totalCredits: { type: Number, required: true },
    imageGenerationCredits: { type: Number, required: true },
    promptGenerationCredits: { type: Number, required: true },
    features: [{ type: String }],
    version: { type: Number, required: true },
  },
});

module.exports = mongoose.model("UserSubscription", userSubscriptionSchema);
