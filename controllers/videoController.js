const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const videoGenerationController = async (req, res) => {
    try {
        const API_KEY = process.env.GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const { prompt, aspectRatio = "1:1", duration = 3, enableAudio = true } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, message: "Prompt is required!!!" });
        }

        let operation = await ai.models.generateVideos({
            model: "veo-3.1-generate-preview",
            prompt,
            aspectRatio,
            duration,
            enableAudio,
        });

        while (!operation.done) {
            console.log("Waiting for video generation to complete...");
            await new Promise((resolve) => setTimeout(resolve, 8000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        const videoRef = operation?.response?.generatedVideos?.[0]?.video;
        if (!videoRef) return res.status(500).json({ success: false, message: "Video not generated" });

        const outputDir = path.resolve(__dirname, "../public/generated");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputFile = `video_${Date.now()}.mp4`;
        const outputPath = path.join(outputDir, outputFile);

        await ai.files.download({
            file: videoRef,
            downloadPath: outputPath,
        });

        return res.status(200).json({
            success: true,
            video_url: `/generated/${outputFile}`,
        });

    } catch (error) {
        console.error("Video generation error:", error);
        return res.status(500).json({
            success: false,
            message: error || "Failed to generate video",
        });
    }
};

module.exports = { videoGenerationController };
