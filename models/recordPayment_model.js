const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentRecordSchema = new Schema({
  userId: {
    type: String,
    ref: 'User',
    required: true
  },
  originalTransactionId: {
  type: String
},
  planId: {
    type: String,
    ref: 'SubscriptionPlan',
    required: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['google_pay','google_play', 'apple_pay', 'credit_card', 'other','stripe','apple']
  },
  transactionId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'INR']
  },
  platform: {
    type: String,
    required: true,
    enum: ['android', 'ios', 'web','stripe']
  },
  receiptData: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded', 'grace_period', 'cancelled'],
    default: 'pending'
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: Date,
  isTrial: {
    type: Boolean,
    default: false
  },
  cancellationReason: String,
  metadata: Schema.Types.Mixed,
  billingDetails: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  planSnapshot: {
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ["free", "basic", "standard", "premium", "trial", "basic_weekly"] },
    price: { type: Number, required: true },
    totalCredits: { type: Number, required: true },
    imageGenerationCredits: { type: Number, required: true },
    promptGenerationCredits: { type: Number, required: true },
    features: [{ type: String }],
    version: { type: Number, required: true },
    googleProductId: { type: String }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

paymentRecordSchema.index({ userId: 1 });
paymentRecordSchema.index({ transactionId: 1 });
paymentRecordSchema.index({ status: 1 });
paymentRecordSchema.index({ paymentDate: 1 });
paymentRecordSchema.index({ expiryDate: 1 });
paymentRecordSchema.index({ 'planSnapshot.googleProductId': 1 });

paymentRecordSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

paymentRecordSchema.virtual('plan', {
  ref: 'SubscriptionPlan',
  localField: 'planId',
  foreignField: '_id',
  justOne: true
});

paymentRecordSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed') {
    const planType = this.planSnapshot?.type || this.metadata?.planDuration;
    if (planType) {
      const expiry = new Date(this.paymentDate);
      switch (planType) {
        case 'basic':
          expiry.setDate(expiry.getDate() + 7);
          break;
        case 'standard':
          expiry.setMonth(expiry.getMonth() + 1);
          break;
        case 'premium':
          expiry.setFullYear(expiry.getFullYear() + 1);
          break;
        case 'trial':
          expiry.setDate(expiry.getDate() + 7);
          break;
      }
      this.expiryDate = expiry;
    }
  }
  next();
});

paymentRecordSchema.statics.verifyPayment = async function(transactionId) {
  const payment = await this.findOne({ transactionId });
  if (!payment) {
    throw new Error('Payment record not found');
  }
  return payment.status === 'completed';
};

paymentRecordSchema.methods.getReceiptDetails = function() {
  return {
    transactionId: this.transactionId,
    amount: this.amount,
    currency: this.currency,
    paymentDate: this.paymentDate,
    plan: this.planSnapshot || this.planId,
    status: this.status,
    googleProductId: this.planSnapshot?.googleProductId
  };
};


const PaymentRecord = mongoose.model('PaymentRecord', paymentRecordSchema);

module.exports = PaymentRecord;