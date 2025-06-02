const User = require("../models/user");

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    req.user = user; // Attach user to request
    next();
};

module.exports = { authenticateUser };
