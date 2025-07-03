const mongoose = require('mongoose');
const aggregatePaginate = require('mongoose-aggregate-paginate-v2');

const notificationSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.Mixed,
    default: () => new mongoose.Types.ObjectId()
  },
  userId: {
    type: String,
    ref: 'User',
    index: true,
    required: function () {
      return this.type === 'user';
    },
    validate: {
      validator: function (v) {
        return this.type === 'general' ? v === null || v === undefined : true;
      },
      message: 'userId must be empty for general notifications'
    }
  },
  type: {
    type: String,
    enum: ['general', 'user'],
    default: 'general',
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  data: {
    type: Object,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    index: { expires: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 🔄 Pagination plugin
notificationSchema.plugin(aggregatePaginate);

// ✅ Indexes
notificationSchema.index({ type: 1, title: 1, body: 1 }, {
  unique: true,
  partialFilterExpression: { type: 'general' }
});
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ type: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;