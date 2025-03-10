const Image = require("../models/image_model");

// Get All Images with Dynamic Pagination
const getAllImages = async (req, res) => {
    try {
        // Get the requested page number (default = 1)
        let page = parseInt(req.query.page) || 1;

        // Get total number of images
        const totalImages = await Image.countDocuments();

        // Define limit per page
        const limit = 100;
        const totalPages = Math.ceil(totalImages / limit);

        let images;

        // If requested page exceeds total pages, return ALL images
        if (page > totalPages) {
            images = await Image.find(); // Fetch all images
            page = 1; // Reset page to 1
        } else {
            const skip = (page - 1) * limit;
            images = await Image.find().skip(skip).limit(limit);
        }

        res.json({
            success: true,
            message: page > totalPages
                ? "Requested page exceeded limit, returning all images."
                : "Images fetched successfully",
            currentPage: page,
            totalPages: totalPages,
            totalImages: totalImages,
            images: images, // Either paginated or full list
        });

    } catch (error) {
        console.error("❌ Error fetching images:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

module.exports = { getAllImages };
