const express = require("express");
const { login, signup } = require("../controllers/auth_controller");

const authrouter = express.Router();

authrouter.post('/login', login);
authrouter.post('/signup', signup);

module.exports = { authrouter }; 
