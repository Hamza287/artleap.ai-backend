const express = require("express");
<<<<<<< HEAD
const { login, signup, googleLogin } = require("../controllers/auth_controller");
=======
const { login, signup, googleLogin,deleteAccount } = require("../controllers/auth_controller");
>>>>>>> 4543a32ee135dd648f896cb7826674e162889348
const authrouter = express.Router();

authrouter.post('/login', login);
authrouter.post('/signup', signup);
authrouter.post('/googleLogin', googleLogin);
<<<<<<< HEAD
=======
authrouter.delete("/delete/:userId", deleteAccount);
>>>>>>> 4543a32ee135dd648f896cb7826674e162889348

module.exports = { authrouter };
