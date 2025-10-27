const express = require('express');
const router = express.Router();
const googleCancellationController = require('./../controllers/googleCancellationController');
const appleCancellationController = require('../controllers/appleCancellationController');
const subscriptionController = require('../controllers/subscriptionController');

router.post('/google/check-status', googleCancellationController.checkSubscriptionStatus);
router.post('/google/check-all', googleCancellationController.checkAllSubscriptions);
router.post('/apple/check-status', appleCancellationController.checkSubscriptionStatus);
router.post('/apple/check-all', appleCancellationController.checkAllSubscriptions);
router.post('/check-all-cancellations', subscriptionController.checkAllCancellations);

module.exports = router;