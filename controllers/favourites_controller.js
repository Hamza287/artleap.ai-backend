const User = require("../models/user");
const Image = require("../models/image_model");

const toggleFavoriteImage = async (req, res) => {
    try {
        const { userId, imageId } = req.body;
        // Check if User & Image Exist
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const image = await Image.findById(imageId);
        if (!image) return res.status(404).json({ error: "Image not found" });
        // Ensure 'favorites' field is an array
        if (!user.favorites) {
            user.favorites = [];
        }
        // Check if Image is Already in Favorites
        const index = user.favorites.indexOf(imageId);
        if (index === -1) {
            // Add to Favorites
            user.favorites.push(imageId);
            await user.save();
            return res.json({ success: true, message: "Image added to favorites", user });
        } else {
            // Remove from Favorites
            user.favorites.splice(index, 1);
            await user.save();
            return res.json({ success: true, message: "Image removed from favorites", user });
        }
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

// ✅ Get User's Favorite Images
const getUserFavorites = async (req, res) => {
    try {
        const { userId } = req.params;
        // Find User & Populate Favorite Images
        const user = await User.findById(userId).populate("favorites");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, favorites: user.favorites });
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

module.exports = { toggleFavoriteImage, getUserFavorites };
