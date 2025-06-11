const User = require("../models/user");
const { v4: uuidv4 } = require("uuid");
const Image = require("../models/image_model");

// 🔹 Signup (for Firebase-authenticated email users)
const signup = async (req, res) => {
    try {
        const { username, email, profilePic } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const newUser = new User({
            _id: uuidv4(),
            username,
            email,
            profilePic: profilePic || ""
        });

        await newUser.save();

        res.status(201).json({
            message: "Signup successful",
            user: {
                userId: newUser._id,
                username: newUser.username,
                email: newUser.email,
                profilePic: newUser.profilePic || null
            }
        });
    } catch (error) {
        console.error("❌ Signup Error:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

// 🔹 Firebase Email Login
const login = async (req, res) => {
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
            console.log("🆕 New user created via Email login:", user.email);
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
        console.error("❌ Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Google Login
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
            console.log("🆕 New user created via Google:", user.email);
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

// 🔹 Apple Login
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
            console.log("🆕 New user created via Apple:", user.email);
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

// 🔹 Delete Account + Data
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

        // Step 1: Get the user's image IDs from both Image collection and user.images array
        const userImagesFromCollection = await Image.find({ userId });
        const imageIds = [
            ...new Set([
                ...userImagesFromCollection.map(img => img._id.toString()),
                ...(user.images?.map(id => id.toString()) || [])
            ])
        ];

        // Step 2: Delete those images from the Image collection
        await Image.deleteMany({ _id: { $in: imageIds } });

        // Step 3: Remove those image IDs from other users' favorites
        await User.updateMany(
            { favorites: { $in: imageIds } },
            { $pull: { favorites: { $in: imageIds } } }
        );

        // Step 4: Remove this user from others' followers and following
        await User.updateMany(
            { followers: userId },
            { $pull: { followers: userId } }
        );
        await User.updateMany(
            { following: userId },
            { $pull: { following: userId } }
        );

        // Step 5: Delete the user profile
        await User.findByIdAndDelete(userId);

        return res.status(200).json({ message: "Account and all related data deleted successfully." });

    } catch (error) {
        console.error("❌ Delete Account Error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};


module.exports = {
    signup,
    login,
    googleLogin,
    appleLogin,
    deleteAccount
};
