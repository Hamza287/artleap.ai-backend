const express = require("express");
const { login, signup, googleLogin } = require("../controllers/auth_controller");
const authrouter = express.Router();

authrouter.post('/login', login);
authrouter.post('/signup', signup);
authrouter.post('/googleLogin', googleLogin);

module.exports = { authrouter };
