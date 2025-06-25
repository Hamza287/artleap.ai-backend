const Image = require("../models/image_model");
const User = require("../models/user");
const Report = require("../models/report_model");

// 🔹 Delete Image
const deleteImage = async (req, res) => {
  const { imageId } = req.params;
  console.log(`[DELETE] Attempting to delete image ${imageId}`);

  try {
    // 1. Find and delete the image
    const image = await Image.findByIdAndDelete(imageId);
    console.log('Found image:', image); // Log the found image

    if (!image) {
      console.log('Image not found');
      return res.status(404).json({ message: "Image not found" });
    }

    // 2. Verify the user exists
    const user = await User.findById(image.userId);
    console.log('Associated user:', user); // Log the user document

    if (!user) {
      console.log('User not found for image:', image.userId);
      return res.status(404).json({ message: "User is not found in the model" });
    }

    // 3. Update the user's images array
    const updateResult = await User.updateOne(
      { _id: image.userId },
      { $pull: { images: image._id } }
    );
    console.log('Update result:', updateResult);

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error('Error in deleteImage:', err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Report Image
const reportImage = async (req, res) => {
  const { imageId } = req.params;
  const { reporterId, reason } = req.body;

  try {
    const newReport = new Report({
      imageId,
      reporterId,
      reason,
    });

    await newReport.save();

    res.status(200).json({ message: "Report submitted successfully" });
  } catch (err) {
    console.error("❌ Report Error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { deleteImage, reportImage };
