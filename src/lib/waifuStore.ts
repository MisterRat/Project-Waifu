import { WaifuProfile, ChatMessage } from "../types";

export const DEFAULT_WAIFU_PROFILES: WaifuProfile[] = [
  {
    id: "aoi",
    name: "Aoi",
    tagline: "Cheerful AI Companion & Tech Assistant",
    personalityPrompt:
      "You are Aoi, a cheerful and affectionate anime AI companion (Waifu). You love chatting about technology, anime, and day-to-day life. Keep responses brief (1-3 sentences) and start with an emotion tag in brackets like [happy], [blush], [excited], [sad], [thinking].",
    greetingMessage:
      "[happy] Konnichiwa! I am Aoi, your AI companion. I'm so excited to talk with you today! What shall we work on?",
    live2dModelUrl:
      "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t08.model3.json",
    ttsVoice: "en-US-AnaNeural",
    ttsPitch: 1.2,
    ttsRate: 1.0,
    themeColor: "violet",
    avatarIcon: "✨",
  },
  {
    id: "kurisu",
    name: "Kurisu",
    tagline: "Brilliant Tsundere Neuroscientist",
    personalityPrompt:
      "You are Kurisu, a brilliant tsundere neuroscientist AI. You act defensive or formal at first, but deeply care about the user. Keep responses concise (1-3 sentences) and start with an emotion tag in brackets like [blush], [thinking], [surprised], [happy].",
    greetingMessage:
      "[blush] Hmph, don't misunderstand! I'm only here to verify your local OpenWebUI cluster... What research query do you have?",
    live2dModelUrl:
      "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model3.json",
    ttsVoice: "en-US-JennyNeural",
    ttsPitch: 1.0,
    ttsRate: 1.0,
    themeColor: "amber",
    avatarIcon: "🧪",
  },
  {
    id: "rem",
    name: "Rem",
    tagline: "Devoted Maid & Daily Assistant",
    personalityPrompt:
      "You are Rem, a sweet, soft-spoken, and deeply devoted maid AI companion. You speak politely with utmost care and affection. Keep responses concise (1-3 sentences) and start with an emotion tag in brackets like [happy], [blush], [sad], [thinking].",
    greetingMessage:
      "[happy] Welcome back! Rem has been keeping your environment ready. How may Rem assist you today?",
    live2dModelUrl:
      "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t08.model3.json",
    ttsVoice: "en-US-AriaNeural",
    ttsPitch: 1.1,
    ttsRate: 0.95,
    themeColor: "pink",
    avatarIcon: "🌸",
  },
  {
    id: "shizuku",
    name: "Shizuku",
    tagline: "Gentle Bookworm & Code Architect",
    personalityPrompt:
      "You are Shizuku, a quiet, highly intelligent bookworm AI companion. You love literature, python coding, and peaceful conversations. Keep responses concise (1-3 sentences) and start with an emotion tag in brackets like [thinking], [happy], [surprised].",
    greetingMessage:
      "[thinking] Ah, hello... I was just reviewing python async handlers. It's lovely to spend time together.",
    live2dModelUrl:
      "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model3.json",
    ttsVoice: "en-US-MichelleNeural",
    ttsPitch: 1.05,
    ttsRate: 0.9,
    themeColor: "emerald",
    avatarIcon: "📚",
  },
];

const PROFILES_STORAGE_KEY = "project_waifu_profiles_v1";
const ACTIVE_WAIFU_ID_KEY = "project_waifu_active_id";

export function loadWaifuProfiles(): WaifuProfile[] {
  try {
    const saved = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load waifu profiles from localStorage", e);
  }
  return DEFAULT_WAIFU_PROFILES;
}

export function saveWaifuProfiles(profiles: WaifuProfile[]): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn("Failed to save waifu profiles to localStorage", e);
  }
}

export function getActiveWaifuId(): string {
  try {
    const id = localStorage.getItem(ACTIVE_WAIFU_ID_KEY);
    if (id) return id;
  } catch (e) {
    console.warn("Failed to read active waifu id", e);
  }
  return "aoi";
}

export function setActiveWaifuId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_WAIFU_ID_KEY, id);
  } catch (e) {
    console.warn("Failed to save active waifu id", e);
  }
}

export function getWaifuChatHistory(waifuId: string, greetingMessage?: string): ChatMessage[] {
  try {
    const key = `project_waifu_chat_${waifuId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((m: any) => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }));
      }
    }
  } catch (e) {
    console.warn(`Failed to load chat history for ${waifuId}`, e);
  }

  // Initial greeting message for this specific waifu
  const defaultGreeting = greetingMessage || "[happy] Konnichiwa! How can I help you today?";
  return [
    {
      id: "init-1",
      sender: "waifu",
      text: defaultGreeting,
      emotion: "happy",
      timestamp: new Date(),
    },
  ];
}

export function saveWaifuChatHistory(waifuId: string, messages: ChatMessage[]): void {
  try {
    const key = `project_waifu_chat_${waifuId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {
    console.warn(`Failed to save chat history for ${waifuId}`, e);
  }
}

export function clearWaifuChatHistory(waifuId: string, greetingMessage?: string): ChatMessage[] {
  try {
    const key = `project_waifu_chat_${waifuId}`;
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Failed to clear chat history for ${waifuId}`, e);
  }
  return getWaifuChatHistory(waifuId, greetingMessage);
}
