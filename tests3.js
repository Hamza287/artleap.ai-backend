const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
require("dotenv").config();

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Read test image file
const filePath = "./uploads/testing.png"; // Make sure you have this file in the project root
if (!fs.existsSync(filePath)) {
  console.error("❌ Test image not found! Add 'test_image.png' to your project folder.");
  process.exit(1);
}

const fileBuffer = fs.readFileSync(filePath);
const fileName = `test_upload_${Date.now()}.png`;

const params = {
  Bucket: BUCKET_NAME,
  Key: `uploads/${fileName}`,
  Body: fileBuffer,
  ContentType: "image/png",
};

(async () => {
  try {
    console.log("🟢 Uploading test image to S3...");
    await s3Client.send(new PutObjectCommand(params));
    console.log(`✅ Image uploaded successfully: https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${fileName}`);
  } catch (error) {
    console.error("❌ S3 Upload Failed:", error);
  }
})();
