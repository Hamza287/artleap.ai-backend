const Image = require("../models/image_model");
const User = require("../models/user");

const updateImagePrivacy = async (req, res) => {
  try {
    const { imageId } = req.params;
    const { privacy } = req.body;
    const userId = req.body.userId || (req.user && req.user._id);

    if (
      !privacy ||
      !["public", "private", "followers", "personal"].includes(privacy)
    ) {
      return res
        .status(400)
        .json({ error: "Invalid or missing privacy option" });
    }

    const image = await Image.findById(imageId);
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    if (String(image.userId) !== String(userId)) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this image" });
    }

    image.privacy = privacy;
    await image.save();

    return res.json({
      success: true,
      message: "Privacy updated successfully",
      image,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal server error", detail: err.message });
  }
};

module.exports = { updateImagePrivacy };
