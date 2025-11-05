const AppleCancellationHandler = require("./../service/plans_handlers/appleCancellationHandler");

class AppleCancellationController {
  constructor() {
    this.appleCancellationHandler = new AppleCancellationHandler();
  }

  async checkSubscriptionStatus(req, res) {
    try {
      const { originalTransactionId } = req.body;
      
      if (!originalTransactionId) {
        return res.status(400).json({ 
          success: false,
          error: "Original transaction ID is required" 
        });
      }

      const result = await this.appleCancellationHandler.processAppleSubscriptionCancellation(originalTransactionId);
      
      res.json({
        success: true,
        cancelled: result,
        message: result ? "Subscription cancelled successfully" : "Subscription is still active"
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  async checkAllSubscriptions(req, res) {
    try {
      await this.appleCancellationHandler.checkAllActiveAppleSubscriptions();
      
      res.json({
        success: true,
        message: "All Apple subscriptions checked successfully"
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }

  async checkSubscriptionWithReceipt(req, res) {
    try {
      const { originalTransactionId } = req.body;
      
      if (!originalTransactionId) {
        return res.status(400).json({ 
          success: false,
          error: "Original transaction ID is required" 
        });
      }

      const isCancelled = await this.appleCancellationHandler.checkSubscriptionWithReceipt(originalTransactionId);
      
      res.json({
        success: true,
        cancelled: isCancelled,
        message: isCancelled ? "Subscription cancelled" : "Subscription active"
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
}

module.exports = new AppleCancellationController();