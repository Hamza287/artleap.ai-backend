const bcrypt = require("bcrypt");
const User = require("../models/user");
const { v4: uuidv4 } = require("uuid");
const Image = require("../models/image_model");

// 🔹 Signup (Email/Password)
const signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            _id: uuidv4(), // 🔹 Generate a unique string-based ID
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({
            message: "Signup successful",
            user: {
                userId: newUser._id, // 🔹 Your MongoDB _id to use everywhere
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

// 🔹 Email/Password or Firebase Email Login (without password check)
const login = async (req, res) => {
    try {
        const { email, username, profilePic } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        let user = await User.findOne({ email });

        if (!user) {
            // First-time login → create user
            user = new User({
                _id: uuidv4(),
                username: username || "Guest",
                email,
                profilePic: profilePic || "",
                password: "" // 🔹 Empty password since Firebase handled auth
            });
            await user.save();
            console.log("🆕 New user created via Email login:", user.email);
        }

        console.log(`🟢 User ${user.email} logged in.`);

        return res.status(200).json({
            message: "Login successful",
            user: {
                userId: user._id, // 🔹 MongoDB _id (correct id for app use)
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

// 🔹 Google Login (If user exists, login; else, create account)
const googleLogin = async (req, res) => {
    try {
        const { email, username, profilePic, googleId } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        let user = await User.findOne({ email });

        if (!user) {
            // First-time Google login → create user
            user = new User({
                _id: uuidv4(),
                username,
                email,
                profilePic,
                googleId,
                password: "" // 🔹 No password needed for Google users
            });

            await user.save();
            console.log("🆕 New user created via Google:", user.email);
        }

        return res.status(200).json({
            message: "Google login successful",
            user: {
                userId: user._id, // 🔹 MongoDB _id
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

const deleteAccount = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.log("❌ User not found:", userId);
            return res.status(404).json({ message: "User not found" });
        }

        // Step 1: Delete user's images from the Image collection
        await Image.deleteMany({ userId });

        // Step 2: Remove userId from others' favorites
        await User.updateMany(
            { favorites: { $in: user.images } },
            { $pull: { favorites: { $in: user.images } } }
        );

        // Step 3: Remove userId from others' followers and following
        await User.updateMany(
            { followers: { $in: [userId] } },
            { $pull: { followers: userId } }
        );

        await User.updateMany(
            { following: { $in: [userId] } },
            { $pull: { following: userId } }
        );

        // Step 4: Delete user from User collection
        await User.findByIdAndDelete(userId);

        return res.status(200).json({ message: "Account and all related data deleted successfully." });
    } catch (error) {
        console.error("❌ Delete Account Error:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

module.exports = { signup, login, googleLogin, deleteAccount };
