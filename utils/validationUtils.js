const mongoose = require('mongoose');

class ValidationUtils {
  static isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  static validateSubscriptionData(userId, planId, paymentMethod) {
    const errors = [];
    
    if (!userId) errors.push("User ID is required");
    if (!planId) errors.push("Plan ID is required");
    if (!paymentMethod) errors.push("Payment method is required");
    
    if (userId && !this.isValidObjectId(userId)) {
      errors.push("Invalid user ID format");
    }
    
    if (planId && !this.isValidObjectId(planId)) {
      errors.push("Invalid plan ID format");
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateCreditDeduction(userId, creditsToDeduct, generationType, num_images = 1) {
    const errors = [];
    
    if (!userId) errors.push("User ID is required");
    if (typeof creditsToDeduct !== 'number') errors.push("Credits to deduct must be a number");
    if (!generationType) errors.push("Generation type is required");
    if (num_images < 1) errors.push("Number of images must be at least 1");
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = ValidationUtils;