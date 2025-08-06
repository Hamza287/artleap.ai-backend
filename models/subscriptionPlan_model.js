const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema({
  googleProductId: { type: String, unique: true, sparse: true },
  appleProductId: { type: String, unique: true, sparse: true },
  basePlanId: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["free", "basic", "standard", "premium", "trial", "basic_weekly"],
    required: true,
  },

  description: { type: String, required: true },
  price: { type: Number, required: true },
  totalCredits: { type: Number, required: true },
  imageGenerationCredits: { type: Number, required: true },
  promptGenerationCredits: { type: Number, required: true },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
