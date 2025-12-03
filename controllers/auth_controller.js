const { v4: uuidv4 } = require("uuid");
const Image = require("../models/image_model");
const User = require("../models/user");
const SubscriptionPlan = require("../models/subscriptionPlan_model");
const UserSubscription = require("../models/user_subscription");
const SubscriptionService = require("../service/subscriptionService");
const HistoryService = require("../service/userHistoryService");
const UserHistory = require("../models/user_history_model");

const createFreeSubscription = async (userId) => {
  const freePlan = await SubscriptionPlan.findOne({ type: "free" });
  if (!freePlan) {
    throw new Error("Free subscription plan not found");
  }

  const freeSubscription = new UserSubscription({
    userId: userId,
    planId: freePlan._id,
    startDate: new Date(),
    endDate: new Date(8640000000000000),
    isActive: true,
    isTrial: false,
    autoRenew: true,
    planSnapshot: {
      name: freePlan.name,
      type: freePlan.type,
      price: freePlan.price,
      totalCredits: freePlan.totalCredits,
      imageGenerationCredits: freePlan.imageGenerationCredits,
      promptGenerationCredits: freePlan.promptGenerationCredits,
      features: freePlan.features,
      version: freePlan.version,
    },
  });

  await freeSubscription.save();
  return freeSubscription;
};

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
      profilePic: profilePic || "",
      isSubscribed: false,
      subscriptionStatus: "none",
    });

    await newUser.save();

    const freeSubscription = await createFreeSubscription(newUser._id);

    newUser.currentSubscription = freeSubscription._id;
    newUser.subscriptionStatus = "active";
    newUser.planName = "Free";
    await newUser.save();

    await HistoryService.initializeUserHistory(newUser._id);

    await HistoryService.recordSubscription(newUser._id, {
      planId: freeSubscription.planId,
      startDate: freeSubscription.startDate,
      endDate: freeSubscription.endDate,
      status: "active",
      paymentMethod: "free",
    });

    res.status(201).json({
      message: "Signup successful",
      user: {
        userId: newUser._id,
        username: newUser.username,
        email: newUser.email,
        profilePic: newUser.profilePic || null,
        planName: newUser.planName,
        isSubscribed: newUser.isSubscribed,
      },
    });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

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
        profilePic: profilePic || "",
        isSubscribed: false,
        subscriptionStatus: "none",
      });

      await user.save();

      const freeSubscription = await createFreeSubscription(user._id);

      user.currentSubscription = freeSubscription._id;
      user.subscriptionStatus = "active";
      user.planName = "Free";
      await user.save();

      await HistoryService.initializeUserHistory(user._id);
      await HistoryService.recordSubscription(user._id, {
        planId: freeSubscription.planId,
        startDate: freeSubscription.startDate,
        endDate: freeSubscription.endDate,
        status: "active",
        paymentMethod: "free",
      });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic || null,
        planName: user.planName || "Free",
        isSubscribed: user.isSubscribed || false,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

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
        googleId,
        isSubscribed: false,
        subscriptionStatus: "none",
      });

      await user.save();

      const freeSubscription = await createFreeSubscription(user._id);

      user.currentSubscription = freeSubscription._id;
      user.subscriptionStatus = "active";
      user.planName = "Free";
      await user.save();

      await HistoryService.initializeUserHistory(user._id);
      await HistoryService.recordSubscription(user._id, {
        planId: freeSubscription.planId,
        startDate: freeSubscription.startDate,
        endDate: freeSubscription.endDate,
        status: "active",
        paymentMethod: "free",
      });
    }

    return res.status(200).json({
      message: "Google login successful",
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic || null,
        planName: user.planName || "Free",
        isSubscribed: user.isSubscribed || false,
      },
    });
  } catch (error) {
    console.error("❌ Google Login Error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

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
        appleId,
        isSubscribed: false,
        subscriptionStatus: "none",
      });

      await user.save();

      const freeSubscription = await createFreeSubscription(user._id);

      user.currentSubscription = freeSubscription._id;
      user.subscriptionStatus = "active";
      user.planName = "Free";
      await user.save();

      await HistoryService.initializeUserHistory(user._id);
      await HistoryService.recordSubscription(user._id, {
        planId: freeSubscription.planId,
        startDate: freeSubscription.startDate,
        endDate: freeSubscription.endDate,
        status: "active",
        paymentMethod: "free",
      });
    }

    return res.status(200).json({
      message: "Apple login successful",
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic || null,
        planName: user.planName || "Free",
        isSubscribed: user.isSubscribed || false,
      },
    });
  } catch (error) {
    console.error("❌ Apple Login Error:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
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
      return res.status(404).json({ message: "User not found" });
    }

    if (user.planType !== "free") {
      return res.status(400).json({
        message:
          "You must cancel your active subscription before deleting your account",
      });
    }

    const activeSubscription = await UserSubscription.findOne({ userId });

    if (
      activeSubscription &&
      activeSubscription.planSnapshot?.type !== "free"
    ) {
      return res.status(400).json({
        message:
          "You must cancel your active subscription before deleting your account",
      });
    }

    // await UserHistory.deleteOne({ userId });

    await UserSubscription.deleteMany({ userId });

    const userImagesFromCollection = await Image.find({ userId });
    const imageIds = [
      ...new Set([
        ...userImagesFromCollection.map((img) => img._id.toString()),
        ...(user.images?.map((id) => id.toString()) || []),
      ]),
    ];

    await Image.deleteMany({ _id: { $in: imageIds } });
    await User.updateMany(
      { favorites: { $in: imageIds } },
      { $pull: { favorites: { $in: imageIds } } }
    );
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );
    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );

    await User.findByIdAndDelete(userId);

    return res
      .status(200)
      .json({ message: "Account and all related data deleted successfully." });
  } catch (error) {
    console.error("❌ Delete Account Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  signup,
  login,
  googleLogin,
  appleLogin,
  deleteAccount,
};
