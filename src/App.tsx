/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { OpenWebUIConfig, TTSConfig, STTConfig, WaifuProfile, User, EmotionType, MotionType } from "./types";
import { OpenWebUITester } from "./components/OpenWebUITester";
import { VoicePipelineTester } from "./components/VoicePipelineTester";
import { DebugLogViewer } from "./components/DebugLogViewer";
import { ChatConsole } from "./components/ChatConsole";
import { PersonaEditorModal } from "./components/PersonaEditorModal";
import { AuthModal } from "./components/AuthModal";
import { AdminPanelModal } from "./components/AdminPanelModal";
import {
  loadWaifuProfiles,
  saveWaifuProfiles,
  getActiveWaifuId,
  setActiveWaifuId,
  DEFAULT_WAIFU_PROFILES,
} from "./lib/waifuStore";
import pkg from "../package.json";
import { Heart, Terminal, Radio, Mic, MessageSquare, Settings2, Menu, X, ChevronRight, Activity, Shield, UserCheck, Key, Mail } from "lucide-react";

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
    // Purge any legacy cached API keys from localStorage
    const saved = localStorage.getItem("project_waifu_openwebui_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey) {
        localStorage.removeItem("project_waifu_openwebui_config");
      }
      return {
        enabled: parsed.enabled ?? true,
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_OPENWEBUI_CONFIG.baseUrl,
        apiKey: "", // Never precache or restore API keys from browser storage
        model: typeof parsed.model === "string" ? parsed.model : DEFAULT_OPENWEBUI_CONFIG.model,
        systemPrompt: typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : DEFAULT_OPENWEBUI_CONFIG.systemPrompt,
        useProxy: parsed.useProxy ?? true,
      };
    }
  } catch (e) {
    console.error("Error loading openwebui_config:", e);
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
    // Purge any legacy cached API keys from localStorage
    const saved = localStorage.getItem("project_waifu_tts_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.openaiApiKey) {
        localStorage.removeItem("project_waifu_tts_config");
      }
      return {
        enabled: parsed.enabled ?? true,
        provider: parsed.provider || DEFAULT_TTS_CONFIG.provider,
        voice: parsed.voice || "",
        pitch: typeof parsed.pitch === "number" ? parsed.pitch : 1.0,
        rate: typeof parsed.rate === "number" ? parsed.rate : 1.0,
        volume: typeof parsed.volume === "number" ? parsed.volume : 1.0,
        customServerUrl: parsed.customServerUrl || DEFAULT_TTS_CONFIG.customServerUrl,
        openaiBaseUrl: typeof parsed.openaiBaseUrl === "string" ? parsed.openaiBaseUrl : DEFAULT_TTS_CONFIG.openaiBaseUrl,
        openaiApiKey: "", // Never precache or restore API keys from browser storage
        openaiModel: typeof parsed.openaiModel === "string" ? parsed.openaiModel : DEFAULT_TTS_CONFIG.openaiModel,
        openaiVoice: typeof parsed.openaiVoice === "string" ? parsed.openaiVoice : DEFAULT_TTS_CONFIG.openaiVoice,
      };
    }
  } catch (e) {
    console.error("Error loading tts_config:", e);
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
  const [activeTab, setActiveTab] = useState<"chat" | "persona" | "openwebui" | "voice" | "debug-log">("chat");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>("neutral");
  const [currentMotion, setCurrentMotion] = useState<MotionType>("none");
  const handleDebugLog = (msg: string) => setDebugLogs(prev => [...prev, msg]);

  const [profiles, setProfiles] = useState<WaifuProfile[]>(loadWaifuProfiles);
  const [activeProfileId, setActiveProfileIdState] = useState<string>(getActiveWaifuId);

  const [trackingEngineEnabled, setTrackingEngineEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("waifu_tracking_engine_enabled");
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {}
    return true;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userCount, setUserCount] = useState<number>(0);
  const [hasOwner, setHasOwner] = useState<boolean>(false);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>(`v${pkg.version}`);
  const [authLoaded, setAuthLoaded] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      setActiveTab("chat");
      setIsMenuOpen(false);
    }
  }, [currentUser]);

  const fetchAuthMe = async () => {
    try {
      const savedToken = localStorage.getItem("waifu_session_token") || "";
      const headers: Record<string, string> = {};
      if (savedToken) {
        headers["Authorization"] = `Bearer ${savedToken}`;
      }
      const res = await fetch("/api/auth/me", {
        headers,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setUserCount(data.userCount || 0);
        setHasOwner(Boolean(data.hasOwner));
        if (data.ownerEmail) setOwnerEmail(data.ownerEmail);
        if (data.version) {
          setAppVersion(`v${data.version}`);
        }
        if (data.settings) {
          applyServerSettings(data.settings);
        }
        if (data.user) {
          setCurrentUser(data.user);
        }
      }
    } catch (e) {
      console.error("Failed to fetch auth status:", e);
    } finally {
      setAuthLoaded(true);
    }
  };

  const applyServerSettings = (settings: any) => {
    if (settings.openwebuiConfig) {
      setOpenWebUIConfigState(settings.openwebuiConfig);
    }
    if (settings.ttsConfig) {
      setTTSConfigState(settings.ttsConfig);
    }
    if (settings.sttConfig) {
      setSTTConfigState(settings.sttConfig);
    }
    if (settings.waifuProfiles && Array.isArray(settings.waifuProfiles) && settings.waifuProfiles.length > 0) {
      setProfiles(settings.waifuProfiles);
      saveWaifuProfiles(settings.waifuProfiles);
    }
    if (settings.activeProfileId) {
      setActiveProfileIdState(settings.activeProfileId);
      setActiveWaifuId(settings.activeProfileId);
    }
    if (settings.trackingEngineEnabled !== undefined) {
      const isEnabled = Boolean(settings.trackingEngineEnabled);
      setTrackingEngineEnabled(isEnabled);
      localStorage.setItem("waifu_tracking_engine_enabled", JSON.stringify(isEnabled));
    }
  };

  const syncSettingsToServer = async (overrides?: any) => {
    const payload = {
      activeProfileId: overrides?.activeProfileId || activeProfileId,
      waifuProfiles: overrides?.waifuProfiles || profiles,
      ttsConfig: overrides?.ttsConfig || ttsConfig,
      sttConfig: overrides?.sttConfig || sttConfig,
      openwebuiConfig: overrides?.openwebuiConfig || openWebUIConfig,
      trackingEngineEnabled: overrides?.trackingEngineEnabled !== undefined ? overrides.trackingEngineEnabled : trackingEngineEnabled,
    };

    const savedToken = localStorage.getItem("waifu_session_token") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (savedToken) {
      headers["Authorization"] = `Bearer ${savedToken}`;
    }

    try {
      // Sync to system-level SQLite database
      await fetch("/api/system/settings", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        credentials: "include",
      });

      // If user logged in, also sync to user_settings
      if (currentUser) {
        await fetch("/api/user/settings", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
        });
      }
    } catch (e) {
      console.error("Failed to sync settings to server:", e);
    }
  };

  useEffect(() => {
    fetchAuthMe();
  }, []);

  const handleSwitchWaifu = (id: string) => {
    setActiveWaifuId(id);
    setActiveProfileIdState(id);
    syncSettingsToServer({ activeProfileId: id });
  };

  const handleSaveProfile = (updatedProfile: WaifuProfile) => {
    const updated = profiles.map((p) => (p.id === updatedProfile.id ? updatedProfile : p));
    setProfiles(updated);
    saveWaifuProfiles(updated);
    syncSettingsToServer({ waifuProfiles: updated });
  };

  const handleCreateProfile = (newProfile: WaifuProfile) => {
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    saveWaifuProfiles(updated);
    handleSwitchWaifu(newProfile.id);
    syncSettingsToServer({ waifuProfiles: updated, activeProfileId: newProfile.id });
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    saveWaifuProfiles(updated);
    if (activeProfileId === id && updated.length > 0) {
      handleSwitchWaifu(updated[0].id);
    }
    syncSettingsToServer({ waifuProfiles: updated });
  };

  const handleResetDefaults = () => {
    setProfiles(DEFAULT_WAIFU_PROFILES);
    saveWaifuProfiles(DEFAULT_WAIFU_PROFILES);
    handleSwitchWaifu(DEFAULT_WAIFU_PROFILES[0].id);
    syncSettingsToServer({ waifuProfiles: DEFAULT_WAIFU_PROFILES, activeProfileId: DEFAULT_WAIFU_PROFILES[0].id });
  };

  const [openWebUIConfig, setOpenWebUIConfigState] = useState<OpenWebUIConfig>(getInitialOpenWebUIConfig);

  const setOpenWebUIConfig = (newConfig: OpenWebUIConfig | ((prev: OpenWebUIConfig) => OpenWebUIConfig)) => {
    setOpenWebUIConfigState((prev) => {
      const updated = typeof newConfig === "function" ? newConfig(prev) : newConfig;
      try {
        // Strip API key before any local preference caching
        const sanitized = { ...updated, apiKey: "" };
        localStorage.setItem("project_waifu_openwebui_config", JSON.stringify(sanitized));
      } catch (e) {
        console.error("Error saving openwebui_config to localStorage:", e);
      }
      syncSettingsToServer({ openwebuiConfig: updated });
      return updated;
    });
  };

  const [ttsConfig, setTTSConfigState] = useState<TTSConfig>(getInitialTTSConfig);

  const setTTSConfig = (newConfig: TTSConfig | ((prev: TTSConfig) => TTSConfig)) => {
    setTTSConfigState((prev) => {
      const updated = typeof newConfig === "function" ? newConfig(prev) : newConfig;
      try {
        // Strip API key before any local preference caching
        const sanitized = { ...updated, openaiApiKey: "" };
        localStorage.setItem("project_waifu_tts_config", JSON.stringify(sanitized));
      } catch (e) {
        console.error("Error saving tts_config to localStorage:", e);
      }
      syncSettingsToServer({ ttsConfig: updated });
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
      syncSettingsToServer({ sttConfig: updated });
      return updated;
    });
  };

  const isOpenWebUIValid =
    openWebUIConfig.enabled !== false &&
    Boolean(openWebUIConfig.baseUrl?.trim()) &&
    Boolean(openWebUIConfig.model?.trim());

  const isTTSEnabled = ttsConfig.enabled !== false;
  const toggleTTS = () => {
    setTTSConfig((prev) => ({ ...prev, enabled: !isTTSEnabled }));
  };

  const [micStatus, setMicStatus] = useState<{
    isListening: boolean;
    isTranscribing: boolean;
    toggleListening?: () => void;
  }>({
    isListening: false,
    isTranscribing: false,
  });

  const handleToggleSTT = () => {
    if (activeTab !== "chat") {
      setActiveTab("chat");
    }
    if (micStatus.toggleListening) {
      micStatus.toggleListening();
    }
  };

  if (!authLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center font-sans">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-violet-600 animate-ping"></div>
          <span className="font-mono text-sm">Loading Project Waifu...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-4 font-sans selection:bg-violet-600 selection:text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-400">
            <Shield className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-serif text-slate-100">Project Waifu</h1>
            <p className="text-sm text-slate-400">
              All functionality is securely protected behind authentication. Please sign in or register to access your AI companion and persistent settings.
            </p>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-semibold py-3 px-6 rounded-2xl text-sm shadow-xl shadow-violet-600/20 transition cursor-pointer"
          >
            <UserCheck className="w-5 h-5" />
            <span>Sign In / Register Account</span>
          </button>
        </div>

        <AuthModal
          isOpen={isAuthModalOpen || !currentUser}
          onClose={() => setIsAuthModalOpen(false)}
          currentUser={currentUser}
          userCount={userCount}
          onLoginSuccess={(user, settings) => {
            setCurrentUser(user);
            if (settings) {
              applyServerSettings(settings);
            }
          }}
          onLogout={async () => {
            try {
              await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            } catch (e) {
              console.error(e);
            }
            setCurrentUser(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      
      {/* Top Navigation Header */}
      <header className="h-14 sm:h-16 bg-slate-900/80 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md w-full max-w-full overflow-hidden">
        <div className="max-w-7xl mx-auto h-full px-2 sm:px-4 md:px-8 flex items-center justify-between gap-1 sm:gap-3">
          
          {/* Left: Brand Logo & Title */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white font-bold text-[11px] sm:text-xs flex-shrink-0">
              PW
            </div>
            <h1 className="text-sm sm:text-xl font-serif italic text-slate-100 tracking-tight flex items-center truncate">
              Project Waifu
              <span className="text-[10px] font-sans not-italic text-slate-500 ml-2 uppercase tracking-widest hidden sm:inline border border-slate-800 px-1.5 py-0.5 rounded-md">
                {appVersion}
              </span>
            </h1>
          </div>

            {/* Center / Right: Dedicated Status Controls */}
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 flex-shrink-0">
              {/* STT Status Button (Mirrors Microphone State) */}
              <button
                onClick={handleToggleSTT}
                className={`flex items-center gap-1.5 sm:gap-2 border px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-mono shadow-inner transition cursor-pointer ${
                  micStatus.isListening
                    ? "bg-rose-950/80 border-rose-500/80 text-rose-200 animate-pulse shadow-rose-500/20"
                    : micStatus.isTranscribing
                    ? "bg-violet-950/80 border-violet-500/80 text-violet-200"
                    : "bg-slate-950/70 hover:bg-slate-900 border-slate-800/80 hover:border-pink-500/40 text-slate-300"
                }`}
                title={
                  micStatus.isTranscribing
                    ? "Transcribing voice audio..."
                    : micStatus.isListening
                    ? "Microphone is RECORDING (Listening). Click to stop."
                    : "Click to start Microphone (Speech-To-Text)"
                }
              >
                <div
                  className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full flex-shrink-0 ${
                    micStatus.isTranscribing
                      ? "bg-violet-400 animate-spin"
                      : micStatus.isListening
                      ? "bg-rose-500 animate-ping"
                      : "bg-slate-600"
                  }`}
                ></div>
                <span>
                  STT:{" "}
                  <strong
                    className={
                      micStatus.isListening
                        ? "text-rose-300 font-bold"
                        : micStatus.isTranscribing
                        ? "text-violet-300 font-semibold"
                        : "text-slate-500 font-semibold"
                    }
                  >
                    {micStatus.isTranscribing
                      ? "TRANSCRIBING"
                      : micStatus.isListening
                      ? "RECORDING"
                      : "OFF"}
                  </strong>
                </span>
              </button>

              {/* TTS Status Button */}
              <button
                onClick={toggleTTS}
                className="flex items-center gap-1.5 sm:gap-2 bg-slate-950/70 hover:bg-slate-900 border border-slate-800/80 hover:border-violet-500/40 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-mono shadow-inner transition cursor-pointer"
                title={isTTSEnabled ? "Text-To-Speech (TTS) is ON. Click to toggle OFF." : "Text-To-Speech (TTS) is OFF. Click to toggle ON."}
              >
                <div className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full flex-shrink-0 ${isTTSEnabled ? "bg-violet-500 animate-pulse" : "bg-slate-600"}`}></div>
                <span className="text-slate-300">
                  TTS: <strong className={isTTSEnabled ? "text-violet-400 font-semibold" : "text-slate-500 font-semibold"}>
                    {isTTSEnabled ? "ON" : "OFF"}
                  </strong>
                </span>
              </button>

              {/* Admin Panel Button (if admin) */}
              {currentUser?.role === "admin" && (
                <button
                  onClick={() => setIsAdminModalOpen(true)}
                  className="flex items-center gap-1 sm:gap-1.5 bg-violet-950/60 hover:bg-violet-900 border border-violet-800/80 text-violet-200 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-mono shadow-inner transition cursor-pointer"
                  title="Open Admin & User Approvals Panel"
                >
                  <Shield className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-violet-400" />
                  <span className="font-semibold hidden sm:inline">Admin</span>
                </button>
              )}

              {/* Hamburger Button (Admin only) */}
              {currentUser?.role === "admin" && (
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="bg-slate-800/90 hover:bg-slate-700 text-slate-100 p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl border border-slate-700/80 flex items-center gap-1.5 sm:gap-2 transition shadow-lg shadow-black/20 group cursor-pointer"
                  title="Toggle settings & menu"
                >
                  {isMenuOpen ? <X className="w-4 sm:w-5 h-4 sm:h-5 text-violet-400" /> : <Menu className="w-4 sm:w-5 h-4 sm:h-5 text-violet-400 group-hover:scale-110 transition-transform" />}
                  <span className="text-xs font-medium pr-1 hidden lg:inline">
                    {activeTab === "chat" && "Live Companion"}
                    {activeTab === "persona" && "Edit Persona"}
                    {activeTab === "openwebui" && "OpenAI API"}
                    {activeTab === "voice" && "Voice Settings"}
                    {activeTab === "debug-log" && "Debug Logs"}
                  </span>
                </button>
              )}
            </div>

        </div>
      </header>

      {/* Slide-over Hamburger Drawer & Backdrop */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Sidebar */}
          <div className="relative w-full max-w-sm bg-slate-900 border-l border-slate-800 h-full p-6 shadow-2xl flex flex-col z-10 overflow-y-auto">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2.5">
                <Activity className="w-5 h-5 text-violet-400" />
                <h2 className="text-base font-bold font-serif italic text-slate-100">
                  Settings & Navigation
                </h2>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs List */}
            <nav className="space-y-2 flex-1">
              <button
                onClick={() => { setActiveTab("chat"); setIsMenuOpen(false); }}
                className={`w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border ${
                  activeTab === "chat"
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : "bg-slate-950/40 text-slate-300 border-slate-800/60 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === "chat" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Live Companion</div>
                    <div className="text-xs text-slate-400 font-normal">Interactive 2D avatar & chat console</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { setActiveTab("persona"); setIsMenuOpen(false); }}
                className={`w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border ${
                  activeTab === "persona"
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : "bg-slate-950/40 text-slate-300 border-slate-800/60 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === "persona" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Edit Persona & Models</div>
                    <div className="text-xs text-slate-400 font-normal">Waifu profiles, Live2D zip, voices</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { setActiveTab("openwebui"); setIsMenuOpen(false); }}
                className={`w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border ${
                  activeTab === "openwebui"
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : "bg-slate-950/40 text-slate-300 border-slate-800/60 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === "openwebui" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">OpenAI API (OpenWebUI)</div>
                    <div className="text-xs text-slate-400 font-normal">Local LLM server & endpoint settings</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { setActiveTab("voice"); setIsMenuOpen(false); }}
                className={`w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border ${
                  activeTab === "voice"
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : "bg-slate-950/40 text-slate-300 border-slate-800/60 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === "voice" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Voice Pipeline (STT / TTS)</div>
                    <div className="text-xs text-slate-400 font-normal">Speech input & voice synthesis tester</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <button
                onClick={() => { setActiveTab("debug-log"); setIsMenuOpen(false); }}
                className={`w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border ${
                  activeTab === "debug-log"
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/50 shadow-lg shadow-violet-500/10"
                    : "bg-slate-950/40 text-slate-300 border-slate-800/60 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${activeTab === "debug-log" ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Debug Log</div>
                    <div className="text-xs text-slate-400 font-normal">Runtime traces & event stream history</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <div className="pt-2 border-t border-slate-800/80 my-2"></div>

              <button
                onClick={() => { setIsAuthModalOpen(true); setIsMenuOpen(false); }}
                className="w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border bg-pink-950/20 text-pink-200 border-pink-800/40 hover:bg-pink-900/30"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-pink-600/30 text-pink-300 border border-pink-500/40">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">User Account & Settings Sync</div>
                    <div className="text-xs text-pink-300/80 font-normal">
                      {currentUser ? `Signed in as ${currentUser.email}` : "Sign in to save profiles server-side"}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              {currentUser?.role === "admin" && (
                <button
                  onClick={() => { setIsAdminModalOpen(true); setIsMenuOpen(false); }}
                  className="w-full text-left p-3.5 rounded-2xl font-medium transition flex items-center justify-between border bg-violet-950/30 text-violet-200 border-violet-800/50 hover:bg-violet-900/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-600/30 text-violet-300 border border-violet-500/40">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Admin Panel & SMTP Config</div>
                      <div className="text-xs text-violet-300/80 font-normal">User approvals, roles & email setup</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </button>
              )}
            </nav>

            {/* Drawer Status Footer */}
            <div className="pt-6 border-t border-slate-800 mt-6 bg-slate-950/60 p-4 rounded-2xl border text-xs space-y-2.5">
              <div className="font-semibold text-slate-300 flex items-center justify-between">
                <span>Active Status Overview</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                <span>Active LLM Provider:</span>
                <span className={`font-semibold ${isOpenWebUIValid ? "text-emerald-400" : "text-amber-400"}`}>
                  {isOpenWebUIValid ? "OpenAI / OpenWebUI" : "Not Configured"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                <span>Text-to-Speech (TTS):</span>
                <button
                  onClick={toggleTTS}
                  className={isTTSEnabled ? "text-violet-400 font-semibold hover:underline" : "text-slate-500 hover:underline"}
                >
                  {isTTSEnabled ? "Active (ON)" : "Disabled (OFF)"}
                </button>
              </div>
              <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                <span>Speech-to-Text (Mic STT):</span>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleToggleSTT();
                  }}
                  className={
                    micStatus.isListening
                      ? "text-rose-400 font-bold hover:underline"
                      : micStatus.isTranscribing
                      ? "text-violet-400 font-semibold hover:underline"
                      : "text-slate-500 hover:underline"
                  }
                >
                  {micStatus.isTranscribing
                    ? "Transcribing..."
                    : micStatus.isListening
                    ? "Recording (ON)"
                    : "Idle (OFF)"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Main Body Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-4 md:p-6 space-y-4 sm:space-y-6 overflow-x-hidden">
        
        {activeTab === "chat" && (
          <ChatConsole
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSwitchWaifu={handleSwitchWaifu}
            onSaveProfile={handleSaveProfile}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
            onResetDefaults={handleResetDefaults}
            onOpenPersonaTab={() => setActiveTab("persona")}
            onDebugLog={handleDebugLog}
            openWebUIConfig={openWebUIConfig}
            ttsConfig={ttsConfig}
            sttConfig={sttConfig}
            trackingEngineEnabled={trackingEngineEnabled}
            emotion={currentEmotion}
            motion={currentMotion}
            onTTSChange={setTTSConfig}
            onSTTChange={setSTTConfig}
            onMicStatusChange={setMicStatus}
            onEmotionChange={setCurrentEmotion}
            onMotionChange={setCurrentMotion}
            onUpdateSystemPrompt={(newPrompt) => {
              setOpenWebUIConfig((prev) => ({ ...prev, systemPrompt: newPrompt }));
            }}
          />
        )}

        {activeTab === "persona" && (
          <PersonaEditorModal
            inline
            onOpenChatTab={() => setActiveTab("chat")}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelectProfile={handleSwitchWaifu}
            onSaveProfile={handleSaveProfile}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
            onResetDefaults={handleResetDefaults}
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

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        userCount={userCount}
        hasOwner={hasOwner}
        ownerEmail={ownerEmail}
        onLoginSuccess={(user, settings, sessionId) => {
          setCurrentUser(user);
          if (sessionId) {
            localStorage.setItem("waifu_session_token", sessionId);
          }
          if (settings) {
            applyServerSettings(settings);
          }
          fetchAuthMe();
        }}
        onLogout={async () => {
          try {
            const savedToken = localStorage.getItem("waifu_session_token") || "";
            await fetch("/api/auth/logout", {
              method: "POST",
              headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
              credentials: "include",
            });
          } catch (e) {
            console.error(e);
          }
          localStorage.removeItem("waifu_session_token");
          setCurrentUser(null);
        }}
      />

      {/* Admin Panel Modal */}
      <AdminPanelModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentUser={currentUser}
        trackingEngineEnabled={trackingEngineEnabled}
        currentEmotion={currentEmotion}
        currentMotion={currentMotion}
        activeCharacterName={profiles.find((p) => p.id === activeProfileId)?.name || "Waifu"}
        onToggleTrackingEngine={(enabled) => {
          setTrackingEngineEnabled(enabled);
          localStorage.setItem("waifu_tracking_engine_enabled", JSON.stringify(enabled));
        }}
        onTestEmotion={(emotion) => {
          setCurrentEmotion(emotion);
          handleDebugLog(`[Admin Testing] Triggered emotion: ${emotion}`);
        }}
        onTestMotion={(motion) => {
          setCurrentMotion(motion);
          handleDebugLog(`[Admin Testing] Triggered motion: ${motion}`);
        }}
      />

      {/* Bottom Status Bar / Footer */}
      <footer className="h-8 bg-slate-900/80 border-t border-slate-800 flex items-center px-3 sm:px-6 justify-between text-[10px] text-slate-500 font-mono w-full max-w-full overflow-hidden">
        <div className="hidden md:flex items-center space-x-4">
          <span>PID: 12480</span>
          <span>LATENCY: 42ms</span>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-3 text-[10px] sm:text-[11px] font-mono mx-auto md:mx-0 truncate">
          <span className="text-slate-400 font-semibold truncate">EXPR: <span className="text-violet-300 font-bold uppercase">[{currentEmotion}]</span></span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-semibold truncate">MOTION: <span className={currentMotion !== "none" ? "text-emerald-400 font-bold uppercase animate-pulse" : "text-slate-400 uppercase"}>[{currentMotion}]</span></span>
        </div>
        <div className="hidden sm:inline">FastAPI • Live2D • OpenWebUI</div>
      </footer>

    </div>
  );
}
