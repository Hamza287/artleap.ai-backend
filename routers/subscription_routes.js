const express = require("express");
const router = express.Router();
const SubscriptionController = require("../controllers/subscription_controller");
// const paymentIntentController = require('./../controllers/stripe_payment_intent_controller');

// Properly bind context using arrow functions
router.get("/plans", (req, res) => SubscriptionController.getPlans(req, res));
router.post("/sync", (req, res) => SubscriptionController.syncPlans(req, res));
router.post("/subscribe", (req, res) => SubscriptionController.subscribe(req, res));
router.post("/trial", (req, res) => SubscriptionController.startTrial(req, res));
router.post("/cancel", (req, res) => SubscriptionController.cancelSubscription(req, res));
router.get("/current", (req, res) => SubscriptionController.getCurrentSubscription(req, res));
router.get("/limits/:generationType", (req, res) => SubscriptionController.checkGeneration(req, res));
// router.post('/create-payment-intent', paymentIntentController.createPaymentIntent);

module.exports = router;
