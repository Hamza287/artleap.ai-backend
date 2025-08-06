// middlewares/watermarkMiddleware.js
const { createCanvas, loadImage } = require('canvas');
const SubscriptionService = require("../service/subscriptionService");

async function addWatermarkIfNeeded(imageBuffer, userId) {
  const user = await User.findById(userId);
  if (!user || !user.watermarkEnabled) {
    return imageBuffer; // No watermark needed
  }

  // Create canvas
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(image, 0, 0);

  // Add watermark text
  ctx.font = 'bold 30px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('Generated with AI - Free Version', image.width / 2, image.height - 30);

  // Return watermarked image
  return canvas.toBuffer('image/png');
}

module.exports = { addWatermarkIfNeeded };