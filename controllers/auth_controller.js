const bcrypt = require("bcrypt");
const User = require("../models/user");
const { v4: uuidv4 } = require("uuid");

// **🔹 Signup (Email/Password)**
const signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // ✅ Explicitly setting `_id` since it's required in your schema
        const newUser = new User({
            _id: uuidv4(),  // 🔹 Generate a unique string-based ID
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({
            message: "Signup successful",
            user: {
                userId: newUser._id, // 🔹 Use the same `userId` for all auth methods
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




const login = async (req, res) => {
    try {
        const { email } = req.body;

        // 🔹 Check if the user exists
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        console.log(`🟢 User ${user.email} logged in without password check.`);

        return res.status(200).json({
            message: "Login successful",
            user: {
                userId: user._id, // 🔹 Return unique user ID
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





// **🔹 Google Login (If user exists, login; else, create account)**
const googleLogin = async (req, res) => {
    try {
        const { email, username, profilePic, googleId } = req.body;

        let user = await User.findOne({ email });

        if (!user) {
            // **Create a new user if they don’t exist**
            user = new User({
                _id: uuidv4(),  // ✅ Generate a unique `_id`
                username,
                email,
                profilePic,
                googleId, // 🔹 Store Google ID for reference
                password: "" // No password for Google users
            });

            await user.save();
            console.log("🆕 New user created via Google:", user.email);
        }

        return res.status(200).json({
            message: "Google login successful",
            user: {
                userId: user._id, // 🔹 Unified ID
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


module.exports = { signup, login, googleLogin };
