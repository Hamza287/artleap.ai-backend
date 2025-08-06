// models/UserHistory.js
const mongoose = require('mongoose');

const UserHistorySchema = new mongoose.Schema({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  accountCreated: {
    type: Date,
    default: Date.now
  },
  subscriptions: [{
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan'
    },
    startDate: Date,
    endDate: Date,
    status: String,
    paymentMethod: String
  }],
  imageGenerations: {
    total: {
      type: Number,
      default: 0
    },
    byPrompt: {
      type: Number,
      default: 0
    },
    byImage: {
      type: Number,
      default: 0
    },
    lastGenerated: Date
  },
  creditUsage: {
    totalCredits: Number,
    usedCredits: Number,
    remainingCredits: Number,
    lastUpdated: Date
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('UserHistory', UserHistorySchema);