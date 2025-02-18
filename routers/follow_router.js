const express = require("express");
const { toggleFollowUser } = require("../controllers/follow_controller");

const followRouter = express.Router();

followRouter.post("/toggle-follow", toggleFollowUser); // Follow or Unfollow user based on current state

module.exports = followRouter;
