const express = require("express");
const router = express.Router();
const userPreferencesController = require("./../controllers/userPreferencesController");

router.post("/user-preferences/privacy-policy/accept", userPreferencesController.acceptPrivacyPolicy);
router.get("/user-preferences/privacy-policy/status/:userId", userPreferencesController.checkPrivacyPolicyStatus);

router.post("/user-preferences/interests/update", userPreferencesController.updateInterests);
router.get("/user-preferences/preferences/:userId", userPreferencesController.getUserPreferences);

module.exports = router;