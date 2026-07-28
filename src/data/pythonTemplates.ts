export const PYTHON_MAIN_PY = `# ==============================================================================
# PROJECT WAIFU - MINIMAL PYTHON BACKEND SERVER (FastAPI + OpenWebUI + EdgeTTS)
# ==============================================================================
# Requirements: pip install fastapi uvicorn httpx edge-tts
# Run: python main.py

import os
import re
import httpx
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Project Waifu Minimal Server", version="1.0.0")

# Enable CORS for browser WebGL access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration defaults
OPENWEBUI_BASE_URL = os.getenv("OPENWEBUI_BASE_URL", "http://localhost:3000/api")
OPENWEBUI_API_KEY = os.getenv("OPENWEBUI_API_KEY", "")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "llama3")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: Optional[str] = DEFAULT_MODEL
    openwebui_url: Optional[str] = OPENWEBUI_BASE_URL
    api_key: Optional[str] = OPENWEBUI_API_KEY
    system_prompt: Optional[str] = (
        "You are Aoi, a friendly anime AI companion (Waifu). "
        "Keep responses brief (1-3 sentences). Start with an emotion tag in brackets, "
        "e.g. [happy], [blush], [sad], [surprised], [thinking]."
    )

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-AnaNeural" # or "ja-JP-NanamiNeural" for anime Japanese

# Ensure static folder exists
os.makedirs("static", exist_ok=True)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Project Waifu Python Core"}

@app.post("/api/chat")
async def chat_with_openwebui(req: ChatRequest):
    """Bridge endpoint forwarding chat requests to OpenWebUI API."""
    target_url = f"{req.openwebui_url.rstrip('/')}/chat/completions"
    
    headers = {"Content-Type": "application/json"}
    if req.api_key:
        headers["Authorization"] = f"Bearer {req.api_key}"

    formatted_messages = []
    if req.system_prompt:
        formatted_messages.append({"role": "system", "content": req.system_prompt})
    
    for msg in req.messages:
        formatted_messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": req.model,
        "messages": formatted_messages,
        "temperature": 0.8,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(target_url, json=payload, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"OpenWebUI error: {resp.text}")
            
            data = resp.json()
            raw_content = data["choices"][0]["message"]["content"]
            
            # Extract emotion tag [happy], [blush], etc.
            emotion = "happy"
            clean_text = raw_content
            emotion_match = re.search(r'^\\[(happy|blush|sad|surprised|thinking|excited)\\]', raw_content, re.IGNORECASE)
            if emotion_match:
                emotion = emotion_match.group(1).lower()
                clean_text = re.sub(r'^\\[(happy|blush|sad|surprised|thinking|excited)\\]\\s*', '', raw_content, flags=re.IGNORECASE)

            return {
                "content": clean_text,
                "emotion": emotion,
                "raw": raw_content,
                "model": req.model
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with OpenWebUI: {str(e)}")

@app.post("/api/tts")
async def generate_tts(req: TTSRequest):
    """Generates audio using edge-tts (no local GPU needed)."""
    try:
        import edge_tts
        communicate = edge_tts.Communicate(req.text, req.voice)
        audio_bytes = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes += chunk["data"]
        
        from io import BytesIO
        return StreamingResponse(BytesIO(audio_bytes), media_type="audio/mp3")
    except ImportError:
        raise HTTPException(status_code=500, detail="edge-tts is not installed. Run 'pip install edge-tts'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation error: {str(e)}")

# Mount static files for the HTML5 Live2D interface
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("--------------------------------------------------")
    print(" Starting Project Waifu Python Server on http://localhost:8000")
    print(" OpenWebUI Bridge: Ready")
    print(" Live2D WebGL Interface: http://localhost:8000")
    print("--------------------------------------------------")
    uvicorn.run(app, host="0.0.0.0", port=8000)
`;

export const PYTHON_REQUIREMENTS_TXT = `fastapi>=0.110.0
uvicorn>=0.28.0
httpx>=0.27.0
edge-tts>=6.1.10
pydantic>=2.6.0
`;

export const PYTHON_STATIC_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Waifu - Live2D Interface</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- PixiJS and Pixi Live2D Display -->
  <script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/6.5.9/browser/pixi.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/index.min.js"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col font-sans">
  
  <header class="bg-slate-800/80 border-b border-slate-700 p-4 flex justify-between items-center backdrop-blur">
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
      <h1 class="font-bold text-lg text-pink-400">Project Waifu Live2D</h1>
    </div>
    <div class="text-xs text-slate-400">Connected to Python Backend</div>
  </header>

  <main class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 max-w-7xl mx-auto w-full">
    
    <!-- Live2D Avatar Canvas Viewport -->
    <div class="md:col-span-2 bg-slate-950 rounded-2xl border border-slate-800 relative overflow-hidden flex flex-col items-center justify-center min-h-[450px]">
      <canvas id="live2d-canvas" class="w-full h-full max-h-[550px] object-contain"></canvas>
      
      <!-- Emotion Badge Overlay -->
      <div id="emotion-badge" class="absolute top-4 left-4 bg-pink-500/20 border border-pink-500/40 text-pink-300 text-xs px-3 py-1.5 rounded-full font-medium">
        Emotion: Happy [😊]
      </div>

      <!-- Lip-Sync Audio Status Indicator -->
      <div id="audio-indicator" class="absolute bottom-4 left-4 flex items-center gap-2 bg-slate-900/80 border border-slate-700 px-3 py-1.5 rounded-full text-xs text-slate-300 hidden">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"></span>
        <span>Speaking / Audio Active</span>
      </div>
    </div>

    <!-- Interactive Chat Console & Settings -->
    <div class="bg-slate-800/50 border border-slate-700/80 rounded-2xl p-4 flex flex-col h-[550px]">
      <div class="flex items-center justify-between pb-3 border-b border-slate-700 mb-3">
        <h2 class="font-semibold text-sm text-slate-200">Conversation</h2>
        <button id="btn-mic" class="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1.5 rounded-lg text-slate-200 flex items-center gap-1 transition">
          🎤 Start STT Voice
        </button>
      </div>

      <!-- Message History Box -->
      <div id="chat-messages" class="flex-1 overflow-y-auto space-y-3 pr-2 text-sm">
        <div class="bg-pink-950/40 border border-pink-800/40 rounded-xl p-3 text-pink-200">
          <strong>Aoi:</strong> Konnichiwa! I am your AI companion powered by Python & OpenWebUI. Ask me anything!
        </div>
      </div>

      <!-- Input Box -->
      <form id="chat-form" class="mt-3 flex gap-2">
        <input type="text" id="chat-input" placeholder="Type a message..." required class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-pink-500 text-slate-100">
        <button type="submit" class="bg-pink-600 hover:bg-pink-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition">
          Send
        </button>
      </form>
    </div>

  </main>

  <script>
    // Frontend JS logic for Live2D, OpenWebUI API connection, and Speech Synthesis
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const emotionBadge = document.getElementById('emotion-badge');

    function appendMessage(sender, text) {
      const msgDiv = document.createElement('div');
      msgDiv.className = sender === 'User' 
        ? 'bg-slate-700/60 border border-slate-600 rounded-xl p-3 text-slate-100 self-end ml-8'
        : 'bg-pink-950/40 border border-pink-800/40 rounded-xl p-3 text-pink-200 mr-8';
      msgDiv.innerHTML = \`<strong>\${sender}:</strong> \${text}\`;
      chatMessages.appendChild(msgDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function speakText(text) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = 1.2;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      appendMessage('User', text);
      chatInput.value = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: text }]
          })
        });
        const data = await res.json();
        if (data.content) {
          appendMessage('Aoi', data.content);
          emotionBadge.textContent = \`Emotion: \${data.emotion} [✨]\`;
          speakText(data.content);
        }
      } catch (err) {
        appendMessage('System', 'Error communicating with backend: ' + err.message);
      }
    });
  </script>
</body>
</html>
`;

export const DOCKERFILE_TEMPLATE = `# Project Waifu Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
`;

export const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'

services:
  project-waifu:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: project-waifu
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - OPENWEBUI_BASE_URL=\${OPENWEBUI_BASE_URL:-http://host.docker.internal:8080/api}
      - OPENWEBUI_API_KEY=\${OPENWEBUI_API_KEY:-}
      - GEMINI_API_KEY=\${GEMINI_API_KEY:-}
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;

export const PYTHON_README_MD = `# Project Waifu - Multi-Persona Live2D Companion (Portainer & Docker Ready)

A lightweight multi-waifu AI companion platform with Live2D avatars, OpenWebUI bridge, and local storage persistence.

## 🚀 Portainer Docker Deployment Guide

1. **Push Repository to GitHub**: Commit this codebase to a repository on your GitHub account.
2. **Open Portainer Web UI**: Go to **Stacks** -> **Add stack**.
3. **Select Repository**:
   - Repository URL: \`https://github.com/your-username/project-waifu\`
   - Compose path: \`docker-compose.yml\`
4. **Set Environment Variables in Portainer**:
   - \`OPENWEBUI_BASE_URL\`: \`http://host.docker.internal:8080/api\` (or your local OpenWebUI URL)
   - \`OPENWEBUI_API_KEY\`: (Optional API key for OpenWebUI)
5. **Deploy Stack**: Portainer will pull the code, build the container, and launch Project Waifu on port \`3000\`!

---

## 💻 Local Development Setup

\`\`\`bash
# Install dependencies
npm install

# Run dev server
npm run dev
\`\`\`

Access the live companion at \`http://localhost:3000\`.

## 💖 Multi-Waifu & Local Persistence Features
- **Multi-Waifu Manager**: Switch between Aoi, Kurisu, Rem, Shizuku, or create custom personas.
- **Per-Waifu Storage**: Personality prompt, greeting, Live2D avatar model URL, voice parameters, and chat history are saved per Waifu in \`localStorage\`.
- **OpenWebUI Bridge**: Communicates directly with local LLMs (Llama 3, Mistral, Gemma) running in OpenWebUI or Ollama.
- **Lip Sync & Voice Synthesis**: Neural TTS stream paired with animated mouth openness canvas rendering.
`;

