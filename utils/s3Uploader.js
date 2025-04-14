const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const path = require('path');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadImageFromUrl = async (imageUrl, bucketName) => {
  const ext = path.extname(imageUrl) || '.jpg';
  const key = `leonardo/outputs/${uuidv4()}${ext}`;

  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: response.data,
    ContentType: response.headers['content-type']
  };
  await s3.send(new PutObjectCommand(uploadParams));

  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

module.exports = { uploadImageFromUrl };
