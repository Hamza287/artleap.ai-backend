// utils/watermarkUtils.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Adds logo watermark with text below it in bottom right corner
 * @param {Buffer} imageBuffer - Input image buffer
 * @param {Object} options - { logoPath, text, textSize, opacity, margin }
 * @returns {Buffer} - Watermarked image
 */
async function addLogoWatermark(imageBuffer, options) {
    const { logoPath, text, textSize = 24, opacity = 0.8, margin = 30 } = options;
    
    try {
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;

        // Load logo if provided
        let logoBuffer = null;
        let logoHeight = 0;
        let logoWidth = 0;

        if (logoPath && fs.existsSync(logoPath)) {
            logoBuffer = await sharp(logoPath)
                .resize({ 
                    width: Math.min(150, width * 0.15), // Logo width max 15% of image width or 150px
                    height: Math.min(100, height * 0.1), // Logo height max 10% of image height or 100px
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();
            
            const logoMeta = await sharp(logoBuffer).metadata();
            logoHeight = logoMeta.height;
            logoWidth = logoMeta.width;
        }

        // Create watermark composite
        const watermarkItems = [];

        // Calculate positions for bottom right placement
        const totalWatermarkHeight = logoHeight + (text ? textSize + 10 : 0);
        const bottomPosition = height - totalWatermarkHeight - margin;
        const rightPosition = width - margin;

        // Add logo if available
        if (logoBuffer) {
            watermarkItems.push({
                input: logoBuffer,
                left: width - logoWidth - margin,
                top: height - totalWatermarkHeight - margin
            });
        }

        // Add text watermark below logo
        if (text) {
            const textSvg = Buffer.from(`
                <svg width="${width}" height="${height}">
                    <text 
                        x="${width - margin - (logoWidth/2)}" 
                        y="${height - margin}" 
                        font-family="Arial" 
                        font-size="${textSize}" 
                        fill="white" 
                        fill-opacity="${opacity}"
                        text-anchor="middle"
                        font-weight="bold">
                        ${text}
                    </text>
                </svg>
            `);

            watermarkItems.push({
                input: textSvg,
                left: width - logoWidth - margin,
                top: height - margin - textSize
            });
        }

        // Apply watermarks
        return await sharp(imageBuffer)
            .composite(watermarkItems)
            .toBuffer();

    } catch (error) {
        console.error('Watermarking failed:', error);
        throw error;
    }
}

module.exports = {
    addLogoWatermark
};