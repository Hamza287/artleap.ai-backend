const express = require('express');
const multer = require('multer');
const path = require('path');
const { generateImagetoImage ,generateTextToImage} = require('../controllers/leonardoController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const upload = multer({ storage });

router.post('/leonardoImgToImg', upload.single('image'), generateImagetoImage);
router.post('/leanardoTxtToImg', generateTextToImage);

module.exports = router;
