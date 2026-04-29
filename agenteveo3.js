// agenteveo3.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import fetch from "node-fetch"; // node 18+ tiene fetch nativo; si tu Node no lo soporta, instala node-fetch
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "5mb" }));

// Servir archivos estáticos desde /public (coloca index.html allí)
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Configuración del SDK solo si existe API key
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
let useRealSdk = Boolean(GOOGLE_API_KEY);

// Carga condicional del SDK para evitar errores si no está instalado
let GoogleGenAI = null;
let ai = null;
if (useRealSdk) {
  try {
    const mod = await import("@google/genai");
    GoogleGenAI = mod.GoogleGenAI;
    ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    console.log("SDK @google/genai cargado. Usando API real.");
  } catch (e) {
    console.warn("No se pudo cargar @google/genai. Cambiando a modo mock.", e);
    useRealSdk = false;
  }
} else {
  console.log("No se encontró GOOGLE_API_KEY. Iniciando en modo mock.");
}

/**
 * POST /generate-video
 * Body: { prompt: string }
 * Respuesta JSON:
 *  - { videoUrl: string } en modo real o mock
 */
app.post("/generate-video", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Falta prompt en el body" });
    }

    // MODO MOCK: devuelve una URL pública de ejemplo o un archivo local
    if (!useRealSdk) {
      // Puedes cambiar esta URL por cualquier MP4 público o por un archivo local en /public/videos/
      const exampleUrl = "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4";
      // Si prefieres servir un archivo local, descomenta estas líneas y coloca el archivo en public/videos/
      // const exampleUrl = "/videos/ejemplo.mp4";
      return res.json({ videoUrl: exampleUrl, mode: "mock" });
    }

    // MODO REAL: usa el SDK para generar el video y hace polling
    let operation = await ai.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt: prompt,
    });

    // Polling básico: espera hasta que operation.done === true
    const pollIntervalMs = 5000;
    const maxPolls = 120; // evita loops infinitos (ajusta según tus necesidades)
    let polls = 0;

    while (!operation.done && polls < maxPolls) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      // Llama al método adecuado del SDK para obtener el estado de la operación
      // Ajusta según la forma exacta que el SDK expone (aquí usamos la misma forma que en tu ejemplo)
      operation = await ai.operations.getVideosOperation({
        operation: operation,
      });
      polls++;
    }

    if (!operation.done) {
      return res.status(500).json({ error: "Timeout: la generación tardó demasiado" });
    }

    if (!operation.response || !operation.response.generatedVideos || !operation.response.generatedVideos[0]) {
      return res.status(500).json({ error: "No se recibió video en la respuesta del SDK" });
    }

    const videoRef = operation.response.generatedVideos[0].video;
    // videoRef puede ser una URL firmada o un ID. Devolvemos tal cual para que el frontend lo use.
    return res.json({ videoUrl: videoRef, mode: "real" });
  } catch (err) {
    console.error("Error en /generate-video:", err);
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /download-proxy
 * Query: ?url=<videoUrl>
 * Descarga el recurso remoto y lo reenvía al cliente como attachment.
 * Útil si la URL es privada o quieres forzar descarga.
 */
app.get("/download-proxy", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send("Falta query param url");

  try {
    // Si la URL es relativa (archivo local en /public), sirve directamente
    if (videoUrl.startsWith("/")) {
      const localPath = path.join(publicDir, videoUrl);
      if (!fs.existsSync(localPath)) return res.status(404).send("Archivo local no encontrado");
      return res.download(localPath);
    }

    // Descarga remota y reenvía
    const response = await fetch(videoUrl);
    if (!response.ok) return res.status(502).send("No se pudo descargar el video remoto");

    // Copiar headers relevantes
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="video_generated.mp4"');

    // Stream de la respuesta al cliente
    response.body.pipe(res);
  } catch (err) {
    console.error("Error en /download-proxy:", err);
    res.status(500).send("Error al descargar el video");
  }
});

// Ruta simple para comprobar estado
app.get("/health", (req, res) => {
  res.json({ status: "ok", mode: useRealSdk ? "real" : "mock" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`Sirviendo archivos estáticos desde ${publicDir}`);
});

