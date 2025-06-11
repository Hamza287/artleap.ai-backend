const User = require("../models/user");
const { v4: uuidv4 } = require("uuid");
const Image = require("../models/image_model");

// 🔹 Email/Firebase Login (no password check)
const loginOrCreate = async (req, res) => {
    try {
        const { email, username, profilePic } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                _id: uuidv4(),
                username: username || "Guest",
                email,
                profilePic: profilePic || ""
            });

            await user.save();
            console.log("🆕 New user created via Firebase email:", email);
        }

        return res.status(200).json({
            message: "Login successful",
            user: {
                userId: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic || null
            }
        });

    } catch (error) {
        console.error("❌ Email login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Google Login (Firebase-authenticated)
const googleLogin = async (req, res) => {
    try {
        const { email, username, profilePic, googleId } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                _id: uuidv4(),
                username,
                email,
                profilePic,
                googleId
            });

            await user.save();
            console.log("🆕 New user created via Google:", email);
        }

        return res.status(200).json({
            message: "Google login successful",
            user: {
                userId: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic || null
            }
        });

    } catch (error) {
        console.error("❌ Google Login Error:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

// 🔹 Apple Login (Firebase-authenticated)
const appleLogin = async (req, res) => {
    try {
        const { email, username, profilePic, appleId } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                _id: uuidv4(),
                username: username || "Apple User",
                email,
                profilePic: profilePic || "",
                appleId
            });

            await user.save();
            console.log("🆕 New user created via Apple:", email);
        }

        return res.status(200).json({
            message: "Apple login successful",
            user: {
                userId: user._id,
                username: user.username,
                email: user.email,
                profilePic: user.profilePic || null
            }
        });

    } catch (error) {
        console.error("❌ Apple Login Error:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

// 🔹 Delete User Account + Related Data
const deleteAccount = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Step 1: Delete user's images
        await Image.deleteMany({ userId });

        // Step 2: Remove from others' favorites
        await User.updateMany(
            { favorites: { $in: user.images } },
            { $pull: { favorites: { $in: user.images } } }
        );

        // Step 3: Remove followers/following
        await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
        await User.updateMany({ following: userId }, { $pull: { following: userId } });

        // Step 4: Delete user
        await User.findByIdAndDelete(userId);

        return res.status(200).json({ message: "Account and all related data deleted successfully." });

    } catch (error) {
        console.error("❌ Delete Account Error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

module.exports = {
    loginOrCreate,
    googleLogin,
    appleLogin,
    deleteAccount
};
