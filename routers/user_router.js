const express = require("express");
const { getUserProfile, getUserProfileWithImages } = require("../controllers/user_controller");
const { updateUserProfile, upload } = require("../controllers/user_profile_controller");
const router = express.Router();

// Fetch user profile with images (Using populate)
router.get("/user/:userId", getUserProfile);
router.post("/user/update/:userId", upload.single("profilePic"), updateUserProfile);
// Fetch user profile with images (Using aggregation)
router.get("/user/profile/:userId", getUserProfileWithImages);

module.exports = router;