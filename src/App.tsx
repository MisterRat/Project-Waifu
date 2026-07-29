/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { OpenWebUIConfig, TTSConfig, STTConfig } from "./types";
import { OpenWebUITester } from "./components/OpenWebUITester";
import { VoicePipelineTester } from "./components/VoicePipelineTester";
import { DebugLogViewer } from "./components/DebugLogViewer";
import { ChatConsole } from "./components/ChatConsole";
import { Heart, Terminal, Radio, Mic, MessageSquare } from "lucide-react";

const DEFAULT_OPENWEBUI_CONFIG: OpenWebUIConfig = {
  enabled: true,
  baseUrl: "http://localhost:3000/api",
  apiKey: "",
  model: "llama3",
  systemPrompt: "You are Aoi, a cheerful anime AI companion (Waifu). Keep responses short (1-3 sentences) and expressive with emotion tags like [happy], [blush], [excited], [sad].",
  useProxy: true,
};

const getInitialOpenWebUIConfig = (): OpenWebUIConfig => {
  if (typeof window === "undefined") return DEFAULT_OPENWEBUI_CONFIG;
  try {
    const saved = localStorage.getItem("project_waifu_openwebui_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: parsed.enabled ?? true,
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_OPENWEBUI_CONFIG.baseUrl,
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        model: typeof parsed.model === "string" ? parsed.model : DEFAULT_OPENWEBUI_CONFIG.model,
        systemPrompt: typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : DEFAULT_OPENWEBUI_CONFIG.systemPrompt,
        useProxy: parsed.useProxy ?? true,
      };
    }
  } catch (e) {
    console.error("Error loading openwebui_config from localStorage:", e);
  }
  return DEFAULT_OPENWEBUI_CONFIG;
};

const DEFAULT_TTS_CONFIG: TTSConfig = {
  enabled: true,
  provider: "openai",
  voice: "",
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
  customServerUrl: "http://localhost:8000/api/tts",
  openaiBaseUrl: "http://localhost:8000/v1",
  openaiApiKey: "",
  openaiModel: "kokoro",
  openaiVoice: "af_bella(.1)+zf_xiaoni(.9)",
};

const getInitialTTSConfig = (): TTSConfig => {
  if (typeof window === "undefined") return DEFAULT_TTS_CONFIG;
  try {
    const saved = localStorage.getItem("project_waifu_tts_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: parsed.enabled ?? true,
        provider: parsed.provider || DEFAULT_TTS_CONFIG.provider,
        voice: parsed.voice || "",
        pitch: typeof parsed.pitch === "number" ? parsed.pitch : 1.0,
        rate: typeof parsed.rate === "number" ? parsed.rate : 1.0,
        volume: typeof parsed.volume === "number" ? parsed.volume : 1.0,
        customServerUrl: parsed.customServerUrl || DEFAULT_TTS_CONFIG.customServerUrl,
        openaiBaseUrl: typeof parsed.openaiBaseUrl === "string" ? parsed.openaiBaseUrl : DEFAULT_TTS_CONFIG.openaiBaseUrl,
        openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey : "",
        openaiModel: typeof parsed.openaiModel === "string" ? parsed.openaiModel : DEFAULT_TTS_CONFIG.openaiModel,
        openaiVoice: typeof parsed.openaiVoice === "string" ? parsed.openaiVoice : DEFAULT_TTS_CONFIG.openaiVoice,
      };
    }
  } catch (e) {
    console.error("Error loading tts_config from localStorage:", e);
  }
  return DEFAULT_TTS_CONFIG;
};

const DEFAULT_STT_CONFIG: STTConfig = {
  enabled: true,
  provider: "web-speech",
  language: "en-US",
  autoSend: true,
  silenceTimeoutMs: 1500,
  customServerUrl: "",
};

const getInitialSTTConfig = (): STTConfig => {
  if (typeof window === "undefined") return DEFAULT_STT_CONFIG;
  try {
    const saved = localStorage.getItem("project_waifu_stt_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: parsed.enabled ?? true,
        provider: parsed.provider || DEFAULT_STT_CONFIG.provider,
        language: parsed.language || DEFAULT_STT_CONFIG.language,
        autoSend: parsed.autoSend ?? true,
        silenceTimeoutMs: parsed.silenceTimeoutMs || 1500,
        customServerUrl: parsed.customServerUrl || "",
      };
    }
  } catch (e) {
    console.error("Error loading stt_config from localStorage:", e);
  }
  return DEFAULT_STT_CONFIG;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "openwebui" | "voice" | "debug-log">("chat");
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const handleDebugLog = (msg: string) => setDebugLogs(prev => [...prev, msg]);

  const [characterName] = useState("Aoi");

  const [openWebUIConfig, setOpenWebUIConfigState] = useState<OpenWebUIConfig>(getInitialOpenWebUIConfig);

  const setOpenWebUIConfig = (newConfig: OpenWebUIConfig | ((prev: OpenWebUIConfig) => OpenWebUIConfig)) => {
    setOpenWebUIConfigState((prev) => {
      const updated = typeof newConfig === "function" ? newConfig(prev) : newConfig;
      try {
        localStorage.setItem("project_waifu_openwebui_config", JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving openwebui_config to localStorage:", e);
      }
      return updated;
    });
  };

  const [ttsConfig, setTTSConfigState] = useState<TTSConfig>(getInitialTTSConfig);

  const setTTSConfig = (newConfig: TTSConfig | ((prev: TTSConfig) => TTSConfig)) => {
    setTTSConfigState((prev) => {
      const updated = typeof newConfig === "function" ? newConfig(prev) : newConfig;
      try {
        localStorage.setItem("project_waifu_tts_config", JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving tts_config to localStorage:", e);
      }
      return updated;
    });
  };

  const [sttConfig, setSTTConfigState] = useState<STTConfig>(getInitialSTTConfig);

  const setSTTConfig = (newConfig: STTConfig | ((prev: STTConfig) => STTConfig)) => {
    setSTTConfigState((prev) => {
      const updated = typeof newConfig === "function" ? newConfig(prev) : newConfig;
      try {
        localStorage.setItem("project_waifu_stt_config", JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving stt_config to localStorage:", e);
      }
      return updated;
    });
  };

  const isOpenWebUIValid =
    openWebUIConfig.enabled !== false &&
    Boolean(openWebUIConfig.baseUrl?.trim()) &&
    Boolean(openWebUIConfig.model?.trim());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      
      {/* Top Navigation Header */}
      <header className="h-16 bg-slate-900/50 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-8 flex items-center justify-between gap-4">
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white font-bold text-xs">
              PW
            </div>
            <h1 className="text-xl font-serif italic text-slate-100 tracking-tight flex items-center">
              Project Waifu
              <span className="text-xs font-sans not-italic text-slate-500 ml-2.5 uppercase tracking-widest hidden sm:inline">
                v0.1 Alpha
              </span>
            </h1>
          </div>

          {/* Navigation Pills */}
          <nav className="flex items-center gap-1 bg-slate-900/30 p-1.5 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeTab === "chat" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Live Companion</span>
            </button>



            <button
              onClick={() => setActiveTab("openwebui")}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeTab === "openwebui" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>OpenWebUI API</span>
            </button>

            <button
              onClick={() => setActiveTab("voice")}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeTab === "voice" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>STT / TTS</span>
            </button>

            <button
              onClick={() => setActiveTab("debug-log")}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeTab === "debug-log" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Debug Log</span>
            </button>
          </nav>

          {/* Right Status Pill */}
          <div className="hidden lg:flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isOpenWebUIValid ? "bg-emerald-500" : "bg-amber-500"}`}></div>
              <span className="text-xs text-slate-400 font-mono">
                API: {isOpenWebUIValid ? `OPENWEBUI (${openWebUIConfig.model})` : "GEMINI DIRECT"}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${ttsConfig.enabled !== false ? "bg-violet-500" : "bg-slate-600"}`}></div>
              <span className="text-xs text-slate-400 font-mono">
                TTS: {ttsConfig.enabled !== false ? "ON" : "OFF"}
              </span>
            </div>
          </div>

        </div>
      </header>

      {/* Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {activeTab === "chat" && (
          <ChatConsole
            onDebugLog={handleDebugLog}
            openWebUIConfig={openWebUIConfig}
            ttsConfig={ttsConfig}
            sttConfig={sttConfig}
            onTTSChange={setTTSConfig}
            onSTTChange={setSTTConfig}
            onUpdateSystemPrompt={(newPrompt) => {
              setOpenWebUIConfig((prev) => ({ ...prev, systemPrompt: newPrompt }));
            }}
          />
        )}

        {activeTab === "openwebui" && (
          <OpenWebUITester
            config={openWebUIConfig}
            onChange={(cfg) => setOpenWebUIConfig(cfg)}
          />
        )}

        {activeTab === "voice" && (
          <VoicePipelineTester
            ttsConfig={ttsConfig}
            sttConfig={sttConfig}
            onTTSChange={(cfg) => setTTSConfig(cfg)}
            onSTTChange={(cfg) => setSTTConfig(cfg)}
            onStartSpeech={() => {
              setActiveTab("chat");
            }}
          />
        )}

        {activeTab === "debug-log" && <DebugLogViewer logs={debugLogs} />}

      </main>

      {/* Bottom Status Bar / Footer */}
      <footer className="h-8 bg-slate-900/80 border-t border-slate-800 flex items-center px-6 justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex items-center space-x-4">
          <span>PID: 12480</span>
          <span>LATENCY: 42ms</span>
        </div>
        <div className="hidden sm:block italic font-serif">
          "Intelligence is the ability to adapt to change." — Project Waifu Alpha Branch
        </div>
        <div>FastAPI • Live2D • OpenWebUI</div>
      </footer>

    </div>
  );
}
