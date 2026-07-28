import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { pipeline, env } from "@xenova/transformers";

// Configure Transformers.js for Node runtime
env.allowLocalModels = false;
env.useBrowserCache = false;

let whisperPipeline: any = null;
let whisperLoadingPromise: Promise<any> | null = null;

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline;
  if (whisperLoadingPromise) return await whisperLoadingPromise;

  whisperLoadingPromise = (async () => {
    try {
      console.log("Loading local server Whisper STT model (Xenova/whisper-tiny)...");
      const pipe = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      whisperPipeline = pipe;
      console.log("Local Whisper model loaded successfully!");
      return pipe;
    } catch (err) {
      console.error("Failed to load local Whisper model:", err);
      whisperLoadingPromise = null;
      throw err;
    }
  })();

  return await whisperLoadingPromise;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "Project Waifu Server Running" });
  });

  // OpenWebUI / OpenAI API Proxy Endpoint to handle CORS
  app.post("/api/openwebui/proxy", async (req, res) => {
    try {
      const { baseUrl, apiKey, endpoint, method = "POST", body } = req.body;
      if (!baseUrl) {
        return res.status(400).json({ error: "baseUrl is required" });
      }

      const targetUrl = `${baseUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (body && (method === "POST" || method === "PUT")) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          error: `OpenWebUI API error (${response.status})`,
          details: data,
        });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("OpenWebUI Proxy Error:", err);
      return res.status(500).json({
        error: "Failed to connect to OpenWebUI server. Ensure the URL is accessible.",
        details: err.message,
      });
    }
  });

  // Speech-to-Text Endpoint with built-in Local Whisper STT + OpenWebUI / Gemini fallbacks
  app.post("/api/waifu/stt", async (req, res) => {
    try {
      const { pcmFloat32, audioBase64, mimeType = "audio/webm", language = "en-US", openWebUIConfig } = req.body;

      if ((!pcmFloat32 || !pcmFloat32.length) && !audioBase64) {
        return res.status(400).json({ error: "No audio PCM data or audio base64 provided" });
      }

      // 1. Built-in Local Server Whisper STT (No external keys/APIs needed!)
      if (pcmFloat32 && Array.isArray(pcmFloat32) && pcmFloat32.length > 0) {
        try {
          const audioData = new Float32Array(pcmFloat32);
          const pipe = await getWhisperPipeline();
          const langCode = language ? language.split("-")[0].toLowerCase() : "english";
          
          const result = await pipe(audioData, {
            language: langCode === "en" ? "english" : langCode === "ja" ? "japanese" : langCode,
            task: "transcribe",
          });

          if (result && result.text) {
            const text = result.text.trim();
            console.log("[Local Whisper STT Success]:", text);
            return res.json({ text });
          }
        } catch (whisperErr: any) {
          console.error("Local Whisper STT processing error:", whisperErr?.message || whisperErr);
        }
      }

      // 2. OpenWebUI API (/audio/transcriptions) if configured and audioBase64 present
      if (openWebUIConfig && openWebUIConfig.baseUrl && audioBase64) {
        try {
          const targetUrl = `${openWebUIConfig.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
          const audioBuffer = Buffer.from(audioBase64, "base64");
          const formData = new FormData();
          const fileBlob = new Blob([audioBuffer], { type: mimeType });
          formData.append("file", fileBlob, "speech.webm");
          formData.append("model", "whisper-1");

          const headers: Record<string, string> = {};
          if (openWebUIConfig.apiKey) {
            headers["Authorization"] = `Bearer ${openWebUIConfig.apiKey}`;
          }

          const owuRes = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: formData,
          });

          if (owuRes.ok) {
            const owuData = await owuRes.json();
            if (owuData.text) {
              return res.json({ text: owuData.text.trim() });
            }
          } else {
            const errText = await owuRes.text();
            console.warn(`OpenWebUI STT returned status ${owuRes.status}:`, errText);
          }
        } catch (owuErr: any) {
          console.error("OpenWebUI STT connection error:", owuErr?.message || owuErr);
        }
      }

      // 3. Fallback to Gemini API if key exists and previous methods failed
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && audioBase64) {
        const ai = new GoogleGenAI({ apiKey });
        const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
        let lastError: any = null;

        for (const model of modelsToTry) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBase64,
                    },
                  },
                  `Transcribe the spoken audio accurately in language '${language}'. Output ONLY the transcribed plain text and nothing else. Do not add quotes, markdown, or extra formatting.`,
                ],
              });

              const text = response.text ? response.text.trim() : "";
              if (text) {
                return res.json({ text });
              }
            } catch (geminiErr: any) {
              lastError = geminiErr;
              const is429 = geminiErr?.status === 429 || String(geminiErr?.message).includes("429") || String(geminiErr?.message).includes("RESOURCE_EXHAUSTED");
              if (is429 && attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 3500));
                continue;
              }
              console.warn(`Gemini STT model ${model} failed (attempt ${attempt + 1}):`, geminiErr?.message || geminiErr);
              break;
            }
          }
        }
      }

      return res.status(400).json({
        error: "Audio transcription failed. Ensure your microphone was enabled and recorded clear speech.",
      });
    } catch (err: any) {
      console.error("STT API Error:", err);
      return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // OpenAI-compatible Text-To-Speech Endpoint (for Kokoro, Open WebUI, or OpenAI TTS)
  app.post("/api/waifu/tts", async (req, res) => {
    try {
      const { text, baseUrl, apiKey, model, voice, speed } = req.body;
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "No text provided for TTS" });
      }

      const cleanBaseUrl = (baseUrl || "http://localhost:8000/v1").trim().replace(/\/$/, "");
      let targetUrl = cleanBaseUrl;
      if (targetUrl.endsWith("/audio/speech")) {
        // Full URL already provided
      } else if (targetUrl.endsWith("/v1")) {
        targetUrl = `${targetUrl}/audio/speech`;
      } else {
        targetUrl = `${targetUrl}/v1/audio/speech`;
      }

      const voiceToUse = voice && voice.trim() ? voice.trim() : "af_bella(.1)+zf_xiaoni(.9)";
      const modelToUse = model && model.trim() ? model.trim() : "kokoro";

      console.log(`[TTS Proxy] Requesting speech from ${targetUrl} (model: ${modelToUse}, voice: ${voiceToUse})`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey && apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelToUse,
          input: text.trim(),
          voice: voiceToUse,
          response_format: "mp3",
          speed: typeof speed === "number" ? speed : 1.0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TTS Proxy Error] Status ${response.status} from ${targetUrl}:`, errorText);
        return res.status(response.status).json({
          error: `TTS server error (${response.status}): ${errorText || "Failed to synthesize speech audio"}`,
        });
      }

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const audioBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      return res.send(Buffer.from(audioBuffer));
    } catch (err: any) {
      console.error("[TTS Proxy Exception]:", err?.message || err);
      return res.status(500).json({
        error: `Could not connect to OpenAI-compatible TTS server: ${err?.message || err}`,
      });
    }
  });

  // Fallback Gemini Waifu Endpoint (for live testing without local OpenWebUI running)
  app.post("/api/waifu/chat", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "GEMINI_API_KEY is not configured.",
          fallbackText: "I am ready! Connect your OpenWebUI API in settings or add a GEMINI_API_KEY to test me.",
        });
      }

      const { messages, systemPrompt, characterName = "Aoi", emotion = "happy" } = req.body;

      const ai = new GoogleGenAI({ apiKey });

      const defaultSystem = `You are ${characterName}, an affectionate, enthusiastic anime companion (Waifu) live on camera. 
Keep your responses short, expressive, engaging, and suitable for a voice assistant (1-3 sentences max).
Include an emotion tag at the very beginning of your response in brackets, chosen from: [happy], [blush], [sad], [surprised], [thinking], [excited].
Example: "[blush] Oh! I'm so happy you spoke to me! What shall we work on today?"`;

      const promptText = Array.isArray(messages)
        ? messages.map((m: any) => `${m.role}: ${m.content}`).join("\n")
        : messages || "Hello!";

      const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
      let replyText = "";
      let lastErrMessage = "";

      for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: promptText,
              config: {
                systemInstruction: systemPrompt || defaultSystem,
                temperature: 0.8,
              },
            });
            if (response.text) {
              replyText = response.text;
              break;
            }
          } catch (err: any) {
            const is429 = err?.status === 429 || String(err?.message).includes("429") || String(err?.message).includes("RESOURCE_EXHAUSTED");
            if (is429 && attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 3500));
              continue;
            }
            console.warn(`Gemini chat model ${model} failed (attempt ${attempt + 1}):`, err?.message || err);
            lastErrMessage = err?.message || String(err);
            break;
          }
        }
        if (replyText) break;
      }

      if (!replyText) {
        replyText = "[happy] Konnichiwa! I am ready to assist you.";
      }

      // Extract emotion tag if present
      let detectedEmotion = emotion || "happy";
      const emotionMatch = replyText.match(/^\[(happy|blush|sad|surprised|thinking|excited)\]/i);
      let cleanText = replyText;
      if (emotionMatch) {
        detectedEmotion = emotionMatch[1].toLowerCase();
        cleanText = replyText.replace(/^\[(happy|blush|sad|surprised|thinking|excited)\]\s*/i, "");
      }

      return res.json({
        content: cleanText,
        emotion: detectedEmotion,
        raw: replyText,
      });
    } catch (err: any) {
      console.error("Waifu Chat Error:", err);
      return res.status(500).json({
        error: "Failed to generate Waifu response",
        details: err.message,
      });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Project Waifu] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
