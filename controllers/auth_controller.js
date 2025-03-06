const bcrypt = require("bcrypt");
const User = require("../models/user");


// **🔹 Signup (Email/Password)**
const signup = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });

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


// **🔹 Login (Email/Password & Firebase Migrated Users Support)**
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // **Allow login for users with empty password (Firebase Migrated Users)**
        if (!user.password || user.password.trim() === "") {
            console.log(`🟢 User ${user.email} logged in without password check.`);
            return res.status(200).json({
                message: "Login successful (password not required)",
                user: {
                    userId: user._id, // 🔹 Using single `userId`
                    username: user.username,
                    email: user.email,
                    profilePic: user.profilePic || null
                }
            });
        }

        // **If user has a password, validate it**
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        return res.status(200).json({
            message: "Login successful",
            user: {
                userId: user._id, // 🔹 Consistent `userId`
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
                username,
                email,
                profilePic,
                googleId, // 🔹 Store Google ID for reference (not separate userId)
                password: "", // No password for Google users
            });

            await user.save();
            console.log("🆕 New user created via Google:", user.email);
        }

        // **Return the same `userId` regardless of login method**
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
