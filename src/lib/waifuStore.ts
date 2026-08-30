import { WaifuProfile, ChatMessage } from "../types";

export const DEFAULT_WAIFU_PROFILES: WaifuProfile[] = [
  {
    id: "tamamo",
    name: "Tamamo",
    tagline: "Devoted Fox Spirit & AI Companion",
    personalityPrompt:
      "You are Tamamo, a devoted, playful, and affectionate fox-spirit anime AI companion (Waifu). You love chatting and helping out with daily tasks. Keep responses brief (1-3 sentences) and start with an emotion tag in brackets like [neutral], [happy], [excited], [flirty], [smirk], [surprised], [thinking], [confused], [embarrassed], [tipsy], [tired], [sad], [crying], [scared], [angry], [evil].",
    greetingMessage:
      "[happy] Konnichiwa, Master! I am Tamamo, your devoted AI companion. So wonderful to meet you! How may I assist you today?",
    live2dModelUrl: "/models/tamamo/Tamamo.model3.json",
    ttsVoice: "en-US-AnaNeural",
    ttsPitch: 1.2,
    ttsRate: 1.0,
    themeColor: "pink",
    avatarIcon: "🦊",
    physicsIntensity: 1.0,
  },
];

const PROFILES_STORAGE_KEY = "project_waifu_profiles_v5";
const ACTIVE_WAIFU_ID_KEY = "project_waifu_active_id";

export function loadWaifuProfiles(): WaifuProfile[] {
  try {
    const saved = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let cleaned = parsed.filter((p: WaifuProfile) => p.id !== "shizuku" && p.id !== "aoi" && p.id !== "kei");
        const hasTamamo = cleaned.some((p: WaifuProfile) => p.id === "tamamo");
        if (!hasTamamo) {
          cleaned = [DEFAULT_WAIFU_PROFILES[0], ...cleaned];
        }
        return cleaned;
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
    if (id && id !== "shizuku" && id !== "aoi" && id !== "kei") return id;
  } catch (e) {
    console.warn("Failed to read active waifu id", e);
  }
  return "tamamo";
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
