export interface User {
  id: string;
  email: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  pin?: string | null;
  created_at: number;
  last_login: number | null;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromEmail: string;
  adminEmail: string;
}

export type EmotionType =
  | "angry"
  | "confused"
  | "crying"
  | "embarrassed"
  | "evil"
  | "excited"
  | "flirty"
  | "happy"
  | "sad"
  | "scared"
  | "smirk"
  | "surprised"
  | "thinking"
  | "tipsy"
  | "tired";

export const EMOTION_TYPES: { id: EmotionType; label: string; emoji: string }[] = [
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "excited", label: "Excited", emoji: "🤩" },
  { id: "flirty", label: "Flirty", emoji: "😘" },
  { id: "smirk", label: "Smirk", emoji: "😏" },
  { id: "surprised", label: "Surprised", emoji: "😲" },
  { id: "thinking", label: "Thinking", emoji: "🤔" },
  { id: "confused", label: "Confused", emoji: "❓" },
  { id: "embarrassed", label: "Embarrassed", emoji: "😳" },
  { id: "tipsy", label: "Tipsy", emoji: "🥴" },
  { id: "tired", label: "Tired", emoji: "🥱" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "crying", label: "Crying", emoji: "😭" },
  { id: "scared", label: "Scared", emoji: "😨" },
  { id: "angry", label: "Angry", emoji: "💢" },
  { id: "evil", label: "Evil", emoji: "😈" },
];

export type MotionType =
  | "nod"
  | "wave"
  | "shake"
  | "bow"
  | "laugh"
  | "wink"
  | "check_nails"
  | "jiggle_dance"
  | "sigh_tilt"
  | "curious_glance"
  | "stretch_wave"
  | "none";

export interface ChatMessage {
  id: string;
  sender: "user" | "waifu" | "system";
  text: string;
  emotion?: EmotionType;
  motion?: MotionType;
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
  physicsIntensity?: number; // 0.0 to 2.5 (default 1.0)
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
  physicsIntensity?: number;
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
