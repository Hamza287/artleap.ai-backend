const Image = require("../models/image_model");

// Get All Images with Dynamic Pagination (Latest Images First)
const getAllImages = async (req, res) => {
  try {
    // Get the requested page number (default = 1)
    let page = parseInt(req.query.page) || 1;
    if (page < 1) page = 1; // Ensure page is always at least 1

    // Define limit per page
    const limit = 100;

    // Get total number of images
    const totalImages = await Image.countDocuments();
    const totalPages = Math.ceil(totalImages / limit);

    // Calculate how many documents to skip
    const skip = (page - 1) * limit;

    // Fetch latest images first (newest first), then paginate
    const images = await Image.find()
      .sort({ createdAt: -1 }) // Latest images first
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      message: "Images fetched successfully",
      currentPage: page,
      totalPages: totalPages,
      totalImages: totalImages,
      images: images, // Only the correct page's images
    });

  } catch (error) {
    console.error("❌ Error fetching images:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

module.exports = { getAllImages };
