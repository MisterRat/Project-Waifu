export type EmotionType = "happy" | "blush" | "sad" | "surprised" | "thinking" | "excited" | "neutral";

export interface ChatMessage {
  id: string;
  sender: "user" | "waifu" | "system";
  text: string;
  emotion?: EmotionType;
  timestamp: Date;
  audioUrl?: string;
}

export interface OpenWebUIConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  useProxy: boolean;
}

export interface TTSConfig {
  enabled?: boolean;
  provider: "openai" | "web-speech" | "edge-tts" | "custom-python";
  voice: string;
  pitch: number;
  rate: number;
  volume: number;
  customServerUrl: string;
  // OpenAI-compatible TTS (Kokoro / Open WebUI / OpenAI TTS)
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiVoice?: string;
}

export interface STTConfig {
  enabled?: boolean;
  provider: "web-speech" | "whisper-python";
  language: string;
  autoSend: boolean;
  silenceTimeoutMs: number;
  customServerUrl: string;
}

export interface Live2DModelConfig {
  modelUrl: string;
  scale: number;
  xOffset: number;
  yOffset: number;
  enableMouseTracking: boolean;
  autoBreathing: boolean;
  currentEmotion: EmotionType;
  isSpeaking: boolean;
  mouthOpenness: number; // 0 to 1
}

export interface WaifuProfile {
  id: string;
  name: string;
  tagline: string;
  personalityPrompt: string;
  greetingMessage: string;
  live2dModelUrl: string;
  ttsVoice: string;
  ttsPitch: number;
  ttsRate: number;
  openWebUIModel?: string;
  themeColor: "violet" | "pink" | "blue" | "emerald" | "amber";
  isCustom?: boolean;
  avatarIcon?: string;
  live2dScale?: number;
  live2dX?: number;
  live2dY?: number;
}

export interface WaifuSettings {
  characterName: string;
  personality: string;
  openWebUI: OpenWebUIConfig;
  tts: TTSConfig;
  stt: STTConfig;
  live2d: Live2DModelConfig;
}

export interface ScopePhase {
  id: string;
  title: string;
  subtitle: string;
  status: "completed" | "in-progress" | "planned";
  duration: string;
  keyDeliverables: string[];
  pythonLibraries: { name: string; purpose: string; isMinimal: boolean }[];
  description: string;
}

export interface ArchitectureNode {
  id: string;
  label: string;
  type: "frontend" | "python-backend" | "ai-service" | "audio-service";
  description: string;
  technologies: string[];
}
