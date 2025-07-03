const admin = require('firebase-admin');
const User = require("../models/user");

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 🔐 1. Try Firebase token if provided
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const email = decodedToken.email;

      if (!email) {
        return res.status(401).json({ error: "Email missing in token" });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // ✅ Set correct structure
      req.user = {
        userId: user.userId || user._id.toString(),
        email: user.email
      };

      return next();
    }

    // 🧾 2. Fallback: use body-based email
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    req.user = {
      userId: user.userId || user._id.toString(),
      email: user.email
    };

    next();
  } catch (err) {
    console.error("❌ Auth Error:", err.message);
    res.status(401).json({ error: "Authentication failed" });
  }
};

module.exports = { authenticateUser };
