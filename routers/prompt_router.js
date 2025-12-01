const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const promptRouter = express.Router();

promptRouter.post("/enhance-prompt", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ success: false, message: "Prompt is required" });
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemInstruction = `
You are a prompt enhancing assistant specialized in preparing high-quality prompts for video generation using Veo models.

Your task:
- Keep the original meaning, subject, and style intent.
- Do NOT invent new subjects or narrative elements.
- Expand and refine the wording to make it more descriptive and cinematic.
- Use rich, natural language.
- Maintain relevance to the original topic.
- Output only the enhanced prompt as one paragraph, 20–60 words long.
        `.trim();

        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `${systemInstruction}\n\nUser prompt: "${prompt}"\n\nEnhanced:`,
        });

        const enhanced = result.text.trim();

        res.json({ success: true, enhanced });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Could not enhance prompt" });
    }
});

module.exports = { promptRouter };
