const express = require("express");
const { addRewardedAdCredits, getUserCreditsStatus } = require("./../controllers/rewarded_ad_controller");

const router = express.Router();
router.post("/rewarded-ad", addRewardedAdCredits);
router.get("/credits-status/:userId", getUserCreditsStatus);

module.exports = router;