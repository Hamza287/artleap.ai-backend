const User = require("../models/user");
const UserSubscription = require("../models/user_subscription");
const moment = require("moment");

async function resetFreeUserCredits() {
  const today = moment().startOf("day").toDate();

  const users = await User.find({
    planName: "Free",  // Changed from isSubscribed: false
    $or: [
      { lastCreditReset: null },
      { lastCreditReset: { $lt: today } }
    ]
  });

  for (const user of users) {
    user.dailyCredits = 4;
    user.lastCreditReset = new Date();
    user.totalCredits = 4;
    user.usedImageCredits = 0;  // Also reset used credits
    user.usedPromptCredits = 0; // Also reset used credits
    
    await user.save();

    // If free user somehow has a subscription, update it too
    if (user.currentSubscription) {
      try {
        await UserSubscription.findOneAndUpdate(
          {
            _id: user.currentSubscription,
            userId: user._id 
          },
          {
            $set: {
              "planSnapshot.totalCredits": 4,
              "planSnapshot.imageGenerationCredits": 0,
              "planSnapshot.promptGenerationCredits": 4
            }
          }
        );
      } catch (error) {
        console.error(`Error updating subscription for user ${user._id}:`, error);
      }
    }
  }

  console.log(`✅ Reset daily credits for ${users.length} free users (planName: Free)`);
}

module.exports = resetFreeUserCredits;