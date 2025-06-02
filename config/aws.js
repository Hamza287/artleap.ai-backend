const AWS = require("aws-sdk");
require("dotenv").config();

console.log("🔍 AWS Credentials Debug:");
console.log("AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID ? "✅ Loaded" : "❌ Missing");
console.log("AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY ? "✅ Loaded" : "❌ Missing");
console.log("AWS_REGION:", process.env.AWS_REGION ? "✅ Loaded" : "❌ Missing");

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
module.exports = s3;
