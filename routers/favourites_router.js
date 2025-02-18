const express = require("express");
const { toggleFavoriteImage, getUserFavorites } = require("../controllers/favourites_controller");

const router = express.Router();

// ✅ Route: Add/Remove Favorite Image
router.post("/toggle-favorite", toggleFavoriteImage);

// ✅ Route: Get User's Favorite Images
router.get("/favorites/:userId", getUserFavorites);

module.exports = router;
