const Image = require("../models/image_model");
const User = require("../models/user");
const Report = require("../models/report_model");

const deleteImage = async (req, res) => {
  const { imageId } = req.params;

  try {
    const image = await Image.findByIdAndDelete(imageId);

    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }
    const user = await User.findById(image.userId);

    if (!user) {
      return res.status(404).json({ message: "User is not found in the model" });
    }

    const updateResult = await User.updateOne(
      { _id: image.userId },
      { $pull: { images: image._id } }
    );

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error('Error in deleteImage:', err);
    res.status(500).json({ message: "Server error" });
  }
};

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
