const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', required: true },
  reporterId: { type: String, ref: 'User', required: true },
  reason: { type: String, default: 'Inappropriate content' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Report', ReportSchema);
