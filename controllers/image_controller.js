const Image = require("../models/image_model");
// Get All Images Controller
const getAllImages = async (req, res) => {
    try {
        // Fetch all images from MongoDB
        const images = await Image.find();
        // Return the list of images
        res.json({
            success: true,
            message: "All images fetched successfully",
            images: images, // Send all images in response
        });
    } catch (error) {
        console.error("❌ Error fetching images:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};
// Export the function
module.exports = { getAllImages };
