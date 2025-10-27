const GoogleCancellationHandler = require("./../service/plans_handlers/googleCancellationHandler");

class GoogleCancellationController {
  constructor() {
    this.googleCancellationHandler = new GoogleCancellationHandler();
  }

  async checkSubscriptionStatus(req, res) {
    try {
      const { purchaseToken } = req.body;
      
      if (!purchaseToken) {
        return res.status(400).json({ 
          success: false,
          error: "Purchase token is required" 
        });
      }

      const result = await this.googleCancellationHandler.processGoogleSubscriptionCancellation(purchaseToken);
      
      res.json({
        success: true,
        cancelled: result,
        message: result ? "Subscription cancelled successfully" : "Subscription is still active"
      });
    } catch (error) {
      console.error("Error checking Google cancellation:", error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  async checkAllSubscriptions(req, res) {
    try {
      await this.googleCancellationHandler.checkAllActiveSubscriptions();
      
      res.json({
        success: true,
        message: "All Google subscriptions checked successfully"
      });
    } catch (error) {
      console.error("Error checking all Google subscriptions:", error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}

module.exports = new GoogleCancellationController();