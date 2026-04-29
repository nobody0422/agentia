// agenteveo3.js
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));

// Asegúrate de definir GOOGLE_API_KEY en .env
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

app.post("/generate-video", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta prompt" });

    // Inicia la generación
    let operation = await ai.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt: prompt,
    });

    // Poll hasta que termine
    while (!operation.done) {
      // espera 5 segundos entre polls
      await new Promise((r) => setTimeout(r, 5000));
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });
    }

    // Verifica respuesta
    if (!operation.response || !operation.response.generatedVideos || !operation.response.generatedVideos[0]) {
      return res.status(500).json({ error: "No se generó video" });
    }

    const videoRef = operation.response.generatedVideos[0].video;

    // Dependiendo del SDK, videoRef puede ser una URL firmada o un ID.
    // Aquí devolvemos tal cual para que el frontend lo descargue o lo muestre.
    return res.json({ videoUrl: videoRef });
  } catch (err) {
    console.error("Error generando video:", err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
