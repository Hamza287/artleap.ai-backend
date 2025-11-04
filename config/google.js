const googleCredentials = require("./../google-credentials.json");

module.exports = {
  credentials: googleCredentials,
  packageName: process.env.PACKAGE_NAME || "com.XrDIgital.ImaginaryVerse",
};