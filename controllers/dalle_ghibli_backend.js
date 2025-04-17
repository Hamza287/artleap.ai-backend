
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 8000;

app.use(express.json());

app.post('/generate-ghibli-style', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const base64DataUrl = `data:image/png;base64,${base64Image}`;

    // Step 1: Get description using GPT-4 Vision
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in detail for anime conversion." },
            { type: "image_url", image_url: { url: base64DataUrl } }
          ]
        }
      ],
      max_tokens: 300
    });

    const description = visionResponse.choices[0].message.content;
    const stylizedPrompt = `${description}, Studio Ghibli anime style, watercolor soft background, cel-shaded`;

    // Step 2: Generate image with DALL·E 3
    const dalleResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: stylizedPrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd"
    });

    const imageUrl = dalleResponse.data[0].url;
    fs.unlinkSync(imagePath); // Clean up

    return res.status(200).json({
      message: "Ghibli-style image generated successfully!",
      prompt: stylizedPrompt,
      imageUrl
    });

  } catch (err) {
    console.error('❌ Error:', err);
    return res.status(500).json({ error: 'Image generation failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
