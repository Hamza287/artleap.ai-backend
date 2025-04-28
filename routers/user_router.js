const express = require("express");
const { getAllUsers, getUserProfile, getUserProfileWithImages, } = require("../controllers/user_controller");
const { updateUserProfile, upload, updateUserCredits, deductCredits,userSubscription, unSubscribeUser } = require("../controllers/user_profile_controller");
const router = express.Router();

// Fetch user profile with images (Using populate)
router.get("/users", getAllUsers);
router.get("/user/:userId", getUserProfile);
router.post("/user/update/:userId", upload.single("profilePic"), updateUserProfile);
// Fetch user profile with images (Using aggregation)
router.get("/user/profile/:userId", getUserProfileWithImages);
router.get("/user/profile/:userId", getUserProfileWithImages);
router.post("/user/credits", updateUserCredits);
router.post("/user/subscription", userSubscription);
router.post("/user/deductCredits", deductCredits);
router.post("/user/unSubscribeUser", unSubscribeUser);




module.exports = router;