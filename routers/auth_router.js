const express = require("express");
const { login, signup, googleLogin, deleteAccount, appleLogin } = require("../controllers/auth_controller");
const authrouter = express.Router();

authrouter.post('/login', login);
authrouter.post('/signup', signup);
authrouter.post('/googleLogin', googleLogin);
authrouter.post('/appleLogin', appleLogin);

authrouter.delete("/delete/:userId", deleteAccount);

module.exports = { authrouter };
