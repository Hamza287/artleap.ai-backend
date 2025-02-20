const mongoose = require("mongoose");
const fs = require("fs");
const User = require("./models/user");

mongoose.connect("mongodb://localhost:27017/user-auth");

const rawData = fs.readFileSync("users.json");
const jsonData = JSON.parse(rawData);

const transformedData = jsonData.map((user) => {
  let createdAt = user.timestamp && user.timestamp._seconds
    ? new Date(user.timestamp._seconds * 1000)
    : new Date();  // Default to now if missing

  let username = user.username || `Unknown_${Math.floor(Math.random() * 10000)}`;
  let email = user.email || `unknown_${Math.floor(Math.random() * 10000)}@noemail.com`; // ✅ Ensure unique emails

  return {
    _id: user._id, // Preserve Firestore user ID
    username,
    email,
    password: user.password || "",
    profilePic: user.profile_image || "",
    dailyCredits: user.credits?.remaining || 10,
    createdAt,
  };
});

const importUsers = async () => {
  try {
    for (let user of transformedData) {
      // Check if _id exists
      const existingUserById = await User.findOne({ _id: user._id });
      if (existingUserById) {
        console.log(`🔄 Skipping existing user (by _id): ${user.username}`);
        continue;
      }

      // Ensure unique username
      let newUsername = user.username;
      let usernameCounter = 1;
      while (await User.findOne({ username: newUsername })) {
        newUsername = `${user.username}_${usernameCounter}`;
        usernameCounter++;
      }
      user.username = newUsername;

      // Ensure unique email
      let newEmail = user.email;
      let emailCounter = 1;
      while (await User.findOne({ email: newEmail })) {
        newEmail = `duplicate_${emailCounter}_${user.email}`;
        emailCounter++;
      }
      user.email = newEmail;

      await User.create(user);
      console.log(`✅ Inserted User: ${user.username} (${user.email})`);
    }

    console.log("✅ Users imported successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error importing users:", err);
    mongoose.connection.close();
  }
};

importUsers();
