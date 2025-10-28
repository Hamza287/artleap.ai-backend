const admin = require("./../service/firebaseService");

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        return res.status(404).json({
          success: false,
          message: "No account found with this email.",
        });
      }
      throw error;
    }
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    console.log(`Password reset link for ${email}: ${resetLink}`);

    return res.status(200).json({
      success: true,
      message: "Password reset link has been sent to your email.",
      link: resetLink,
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  forgotPassword,
}