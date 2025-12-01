const User = require("./../models/user");

const userPreferencesController = {
  acceptPrivacyPolicy: async (req, res) => {
    try {
      const { userId, version = "1.0" } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          message: "User ID is required" 
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            "privacyPolicyAccepted.accepted": true,
            "privacyPolicyAccepted.acceptedAt": new Date(),
            "privacyPolicyAccepted.version": version
          }
        },
        { new: true }
      ).select("privacyPolicyAccepted username email");

      if (!updatedUser) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      res.status(200).json({
        success: true,
        message: "Privacy policy accepted successfully",
        data: updatedUser
      });
    } catch (error) {
      console.error("Error accepting privacy policy:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error",
        error: error.message 
      });
    }
  },

  // Update user interests
  updateInterests: async (req, res) => {
    try {
      const { userId, selected, categories } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          message: "User ID is required" 
        });
      }

      const updateData = {
        "interests.lastUpdated": new Date()
      };

      if (selected !== undefined) {
        updateData["interests.selected"] = selected;
      }
      
      if (categories !== undefined) {
        updateData["interests.categories"] = categories;
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
      ).select("interests username email");

      if (!updatedUser) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      res.status(200).json({
        success: true,
        message: "Interests updated successfully",
        data: updatedUser
      });
    } catch (error) {
      console.error("Error updating interests:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error",
        error: error.message 
      });
    }
  },

  // Get user preferences (privacy policy status and interests)
  getUserPreferences: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select("privacyPolicyAccepted interests username email");

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error("Error fetching user preferences:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error",
        error: error.message 
      });
    }
  },

  // Check if user needs to accept privacy policy
  checkPrivacyPolicyStatus: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select("privacyPolicyAccepted username");

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      const needsAcceptance = !user.privacyPolicyAccepted.accepted;

      res.status(200).json({
        success: true,
        data: {
          needsPrivacyPolicyAcceptance: needsAcceptance,
          privacyPolicyAccepted: user.privacyPolicyAccepted.accepted,
          acceptedAt: user.privacyPolicyAccepted.acceptedAt,
          version: user.privacyPolicyAccepted.version
        }
      });
    } catch (error) {
      console.error("Error checking privacy policy status:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error",
        error: error.message 
      });
    }
  }
};

module.exports = userPreferencesController;