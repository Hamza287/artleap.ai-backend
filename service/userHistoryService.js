const UserHistory = require('../models/user_history_model');
const User = require('../models/user');
const mongoose = require('mongoose');

class HistoryService {
  static async initializeUserHistory(userId) {
    try {
      const objectId = mongoose.Types.ObjectId.isValid(userId)
        ? userId
        : new mongoose.Types.ObjectId();

      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      const history = new UserHistory({
        userId: objectId,
        creditUsage: {
          totalCredits: user.totalCredits,
          usedCredits: user.usedImageCredits + user.usedPromptCredits,
          remainingCredits: user.totalCredits - (user.usedImageCredits + user.usedPromptCredits)
        }
      });

      return await history.save();
    } catch (error) {
      console.error('Error initializing user history:', error);
      throw error;
    }
  }

  static async recordSubscription(userId, subscriptionData) {
    try {
      return await UserHistory.findOneAndUpdate(
        { userId },
        {
          $push: { subscriptions: subscriptionData },
          $set: { lastUpdated: new Date() }
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      console.error('Error recording subscription:', error);
      throw error;
    }
  }

  static async recordImageGeneration(userId, generationType = 'byPrompt') {
    try {
      const updateField = `imageGenerations.${generationType}`;
      
      return await UserHistory.findOneAndUpdate(
        { userId },
        {
          $inc: { 
            [updateField]: 1,
            'imageGenerations.total': 1
          },
          $set: { 
            'imageGenerations.lastGenerated': new Date(),
            lastUpdated: new Date() 
          }
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      console.error('Error recording image generation:', error);
      throw error;
    }
  }

  static async updateCreditUsage(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      return await UserHistory.findOneAndUpdate(
        { userId },
        {
          $set: {
            'creditUsage.totalCredits': user.totalCredits,
            'creditUsage.usedCredits': user.usedImageCredits + user.usedPromptCredits,
            'creditUsage.remainingCredits': user.totalCredits - (user.usedImageCredits + user.usedPromptCredits),
            'creditUsage.lastUpdated': new Date(),
            lastUpdated: new Date()
          }
        },
        { new: true, upsert: true }
      );
    } catch (error) {
      console.error('Error updating credit usage:', error);
      throw error;
    }
  }

  static async getUserHistory(userId) {
    try {
      return await UserHistory.findOne({ userId })
        .populate('userId')
        .populate('subscriptions.planId');
    } catch (error) {
      console.error('Error getting user history:', error);
      throw error;
    }
  }
}

module.exports = HistoryService;