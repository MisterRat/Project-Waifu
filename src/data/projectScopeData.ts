import { ScopePhase, ArchitectureNode } from "../types";

export const PROJECT_OVERVIEW = {
  title: "Project Waifu - Architecture & Development Scope",
  subtitle: "Minimalist Python Backend + Web Browser Live2D AI Companion with OpenWebUI & Speech Integration",
  version: "1.0.0-Scope",
  author: "AI Architecture Team",
  targetRuntime: "Python 3.10+ (Standard Library preferred, minimal 3rd party dependencies)",
};

export const MINIMAL_DEPENDENCIES = [
  {
    package: "fastapi",
    version: "^0.110.0",
    purpose: "Ultra-fast, asynchronous web server & API framework with automatic OpenAPI documentation.",
    whyMinimal: "Provides native async support for SSE (streaming responses from LLMs & TTS audio streams). lightweight alternative to heavyweight Django/Flask.",
    isEssential: true,
  },
  {
    package: "uvicorn",
    version: "^0.28.0",
    purpose: "ASGI server implementation for running FastAPI.",
    whyMinimal: "Standard production ASGI server with minimal memory footprint (~30MB RAM).",
    isEssential: true,
  },
  {
    package: "httpx",
    version: "^0.27.0",
    purpose: "Async HTTP client for Python to call OpenWebUI API and stream response tokens.",
    whyMinimal: "Built for async Python, seamless integration with FastAPI streaming.",
    isEssential: true,
  },
  {
    package: "edge-tts",
    version: "^6.1.10",
    purpose: "Zero-key, high-quality neural Text-To-Speech Python library using Microsoft Edge TTS service.",
    whyMinimal: "No local GPU or heavy PyTorch models needed; supports multi-lingual anime voice styles natively.",
    isEssential: false,
  },
];

export const OPTIONAL_ADVANCED_DEPENDENCIES = [
  {
    package: "faster-whisper",
    version: "^1.0.0",
    purpose: "Local GPU/CPU Speech-To-Text transcription if Web Speech API isn't sufficient.",
    whyMinimal: "4x faster than vanilla OpenAI Whisper with 80% less VRAM usage.",
  },
  {
    package: "coqui-tts / piper-tts",
    version: "^0.1.0",
    purpose: "100% offline, low-latency neural TTS for custom voice cloning.",
    whyMinimal: "Runs locally without external internet dependencies.",
  },
];

export const ARCHITECTURE_NODES: ArchitectureNode[] = [
  {
    id: "browser",
    label: "Browser Frontend (HTML5 / WebGL)",
    type: "frontend",
    description: "Hosts the Live2D Cubism WebGL Canvas, Web Speech STT, HTML5 Web Audio Lip-Sync player, and Chat UI.",
    technologies: ["JavaScript ES6", "WebGL / PixiJS", "Cubism Web SDK 4", "Web Speech API"],
  },
  {
    id: "python-backend",
    label: "Minimal Python Gateway Server",
    type: "python-backend",
    description: "Lightweight FastAPI server acting as static host, OpenWebUI API bridge, session manager, and TTS/STT router.",
    technologies: ["Python 3.10+", "FastAPI", "Uvicorn", "HTTPX"],
  },
  {
    id: "openwebui",
    label: "OpenWebUI API Endpoint",
    type: "ai-service",
    description: "Local or remote OpenWebUI server providing Ollama / LLM chat completions via standard OpenAI-compatible REST API.",
    technologies: ["OpenWebUI", "Ollama / Local LLM", "REST / SSE Stream"],
  },
  {
    id: "tts-stt",
    label: "Audio Pipeline (TTS & STT)",
    type: "audio-service",
    description: "Handles voice input recognition (STT) and neural voice synthesis (TTS) with audio amplitude data for Live2D lip sync.",
    technologies: ["Web Speech API (Zero-dep)", "Edge-TTS (Python)", "Whisper (Optional)"],
  },
];

export const DEVELOPMENT_PHASES: ScopePhase[] = [
  {
    id: "phase-1",
    title: "Phase 1: Minimal Python Server & Live2D Web Viewer",
    subtitle: "Establish core browser-to-Python infrastructure and render animated Live2D model.",
    status: "completed",
    duration: "1-2 Days",
    description: "Set up a lightweight FastAPI static server. Mount WebGL canvas in browser and load sample Live2D model with cursor head tracking, breathing, and basic emotion parameters.",
    keyDeliverables: [
      "FastAPI server (`main.py`) serving `/static` WebGL index.html",
      "Live2D Cubism Web SDK 4 / Pixi.js integration in browser",
      "Head motion tracking following mouse pointer",
      "Emotion trigger controls (Happy, Blush, Sad, Surprised, Thinking)",
    ],
    pythonLibraries: [
      { name: "fastapi", purpose: "Web framework", isMinimal: true },
      { name: "uvicorn", purpose: "ASGI app server", isMinimal: true },
    ],
  },
  {
    id: "phase-2",
    title: "Phase 2: OpenWebUI API Integration & Streaming Chat",
    subtitle: "Connect the companion's mind to OpenWebUI LLM via async API proxy.",
    status: "completed",
    duration: "2-3 Days",
    description: "Implement `/api/chat` route in Python backend using `httpx` async client to forward prompts to OpenWebUI `/api/chat/completions`. Parse emotion tags `[blush]`, `[happy]` in AI responses to drive model expressions.",
    keyDeliverables: [
      "OpenWebUI API client in Python (`httpx.AsyncClient`)",
      "Token streaming support (Server-Sent Events / WebSockets)",
      "System prompt configuration for Waifu persona",
      "Regex tag parser extracting emotion parameters from LLM output",
    ],
    pythonLibraries: [
      { name: "httpx", purpose: "Async HTTP calls to OpenWebUI", isMinimal: true },
    ],
  },
  {
    id: "phase-3",
    title: "Phase 3: Text-to-Speech (TTS) & Real-time Lip Sync",
    subtitle: "Give the Waifu a voice and align mouth movements automatically.",
    status: "in-progress",
    duration: "2-3 Days",
    description: "Add TTS pipeline. Primary zero-dependency path using Browser SpeechSynthesis API, with secondary Python `edge-tts` streaming route. Extract audio frequency/volume web audio analyzer to update Live2D `ParamMouthOpenY` in real-time.",
    keyDeliverables: [
      "Web Audio API context with `AnalyserNode` for volume detection",
      "Live2D `ParamMouthOpenY` parameter binding to audio peak amplitude",
      "Python `edge-tts` streaming endpoint `/api/tts` for high quality neural Japanese/English anime voices",
      "Speech rate, pitch, and voice preset customization",
    ],
    pythonLibraries: [
      { name: "edge-tts", purpose: "Zero-key neural TTS", isMinimal: true },
    ],
  },
  {
    id: "phase-4",
    title: "Phase 4: Speech-to-Text (STT) & Hands-Free Conversation",
    subtitle: "Enable direct spoken microphone conversation with voice activity detection.",
    status: "planned",
    duration: "2 Days",
    description: "Integrate continuous Speech-To-Text. Use browser `webkitSpeechRecognition` for zero Python dependency overhead, or add optional `/api/stt` using `faster-whisper` for offline local transcription.",
    keyDeliverables: [
      "Continuous microphone listener with automatic silence detection",
      "Hands-free wake mode (User speaks -> STT transcribes -> OpenWebUI responds -> TTS speaks & Live2D animates)",
      "Audio input waveform UI indicator",
    ],
    pythonLibraries: [
      { name: "faster-whisper", purpose: "Optional local STT", isMinimal: false },
    ],
  },
  {
    id: "phase-5",
    title: "Phase 5: Memory, Custom Model Loader & Polish",
    subtitle: "Custom model loading, persistent conversation history, and fine-grained expression tuning.",
    status: "planned",
    duration: "2-3 Days",
    description: "Allow users to drag-and-drop or specify custom `.model3.json` Live2D files. Add local SQLite or JSON session storage for multi-turn conversational memory.",
    keyDeliverables: [
      "Custom Live2D model zip / JSON loader",
      "Persistent chat history (SQLite / JSON file)",
      "Customizable Waifu background environments & outfit toggle",
    ],
    pythonLibraries: [
      { name: "sqlite3", purpose: "Built-in Python DB for chat history", isMinimal: true },
    ],
  },
];

export const LIVE2D_PARAM_MAPPING = [
  { param: "ParamAngleX", range: "-30 to +30", description: "Head rotation left/right" },
  { param: "ParamAngleY", range: "-30 to +30", description: "Head tilt up/down" },
  { param: "ParamAngleZ", range: "-30 to +30", description: "Head sway roll" },
  { param: "ParamEyeLOpen", range: "0.0 to 1.0", description: "Left eye open ratio" },
  { param: "ParamEyeROpen", range: "0.0 to 1.0", description: "Right eye open ratio" },
  { param: "ParamEyeBallX", range: "-1.0 to +1.0", description: "Gaze horizontal direction" },
  { param: "ParamMouthOpenY", range: "0.0 to 1.0", description: "Mouth open ratio (driven by TTS audio amplitude)" },
  { param: "ParamMouthForm", range: "-1.0 to +1.0", description: "Mouth shape (-1: frown, 0: neutral, +1: smile)" },
  { param: "ParamCheek", range: "0.0 to 1.0", description: "Blush cheek intensity" },
  { param: "ParamBreath", range: "0.0 to 1.0", description: "Breathing idle loop" },
];
