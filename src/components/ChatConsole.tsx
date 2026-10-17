import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChatMessage, EmotionType, MotionType, OpenWebUIConfig, TTSConfig, STTConfig, WaifuProfile } from "../types";
import { fetchOpenAITTSAudioBlob } from "../lib/openaiTts";
import { lipSyncEngine } from "../lib/lipSyncEngine";
import { parseEmotionAndMotionTags } from "../lib/tagParser";
import { DEFAULT_TTS_BASE_URL, DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE } from "../lib/voiceDefaults";
import { createConversationListener, cleanTranscript, float32ToBase64, ConversationListener, ListenerState } from "../lib/conversationMode";
import { Live2DAvatar } from "./Live2DAvatar";
import { PersonaEditorModal } from "./PersonaEditorModal";
import {
  loadWaifuProfiles,
  saveWaifuProfiles,
  getActiveWaifuId,
  setActiveWaifuId,
  getWaifuChatHistory,
  saveWaifuChatHistory,
  clearWaifuChatHistory,
  DEFAULT_WAIFU_PROFILES,
} from "../lib/waifuStore";
import { Send, Mic, MicOff, Volume2, VolumeX, RefreshCw, Bot, User, Trash2, Settings2, Plus, Heart, Sparkles, Loader2, ChevronDown, MessagesSquare, AudioLines } from "lucide-react";
import confetti from "canvas-confetti";

interface ChatConsoleProps {
  openWebUIConfig: OpenWebUIConfig;
  ttsConfig: TTSConfig;
  sttConfig: STTConfig;
  profiles?: WaifuProfile[];
  activeProfileId?: string;
  emotion?: EmotionType;
  motion?: MotionType;
  onSwitchWaifu?: (id: string) => void;
  onSaveProfile?: (updatedProfile: WaifuProfile) => void;
  onCreateProfile?: (newProfile: WaifuProfile) => void;
  onDeleteProfile?: (id: string) => void;
  onResetDefaults?: () => void;
  onOpenPersonaTab?: () => void;
  onTTSChange?: (config: TTSConfig) => void;
  onSTTChange?: (config: STTConfig) => void;
  onUpdateSystemPrompt?: (newPrompt: string) => void;
  onDebugLog?: (msg: string) => void;
  onMicStatusChange?: (status: { isListening: boolean; isTranscribing: boolean; toggleListening: () => void }) => void;
  onEmotionChange?: (emo: EmotionType) => void;
  onMotionChange?: (mo: MotionType) => void;
  trackingEngineEnabled?: boolean;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  openWebUIConfig,
  ttsConfig,
  sttConfig,
  profiles: propsProfiles,
  activeProfileId: propsActiveProfileId,
  emotion: propsEmotion,
  motion: propsMotion,
  onSwitchWaifu: propsOnSwitchWaifu,
  onSaveProfile: propsOnSaveProfile,
  onCreateProfile: propsOnCreateProfile,
  onDeleteProfile: propsOnDeleteProfile,
  onResetDefaults: propsOnResetDefaults,
  onOpenPersonaTab,
  onTTSChange,
  onSTTChange,
  onUpdateSystemPrompt,
  onDebugLog,
  onMicStatusChange,
  onEmotionChange,
  onMotionChange,
  trackingEngineEnabled = true,
}) => {
  const [localProfiles, setLocalProfiles] = useState<WaifuProfile[]>(loadWaifuProfiles);
  const [localActiveProfileId, setLocalActiveProfileId] = useState<string>(getActiveWaifuId);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const profiles = propsProfiles || localProfiles;
  const activeProfileId = propsActiveProfileId || localActiveProfileId;

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_WAIFU_PROFILES[0];

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getWaifuChatHistory(activeProfile.id, activeProfile.greetingMessage)
  );

  const prevActiveProfileIdRef = useRef(activeProfile.id);
  useEffect(() => {
    if (prevActiveProfileIdRef.current !== activeProfile.id) {
      prevActiveProfileIdRef.current = activeProfile.id;
      setMessages(getWaifuChatHistory(activeProfile.id, activeProfile.greetingMessage));
    }
  }, [activeProfile.id, activeProfile.greetingMessage]);

  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>(propsEmotion || "neutral");
  const [currentMotion, setCurrentMotion] = useState<MotionType>(propsMotion || "none");
  const avatarSectionRef = useRef<HTMLDivElement | null>(null);

  // The stage layout keeps her on screen at all times, so nothing to scroll.
  const scrollToAvatarOnSpeak = () => {};

  useEffect(() => {
    if (propsEmotion && propsEmotion !== currentEmotion) {
      setCurrentEmotion(propsEmotion);
    }
  }, [propsEmotion]);

  useEffect(() => {
    if (propsMotion && propsMotion !== currentMotion) {
      setCurrentMotion(propsMotion);
    }
  }, [propsMotion]);

  const handleEmotionChange = (emo: EmotionType) => {
    setCurrentEmotion(emo);
    if (onEmotionChange) onEmotionChange(emo);
  };

  const handleMotionChange = (mo: MotionType) => {
    setCurrentMotion(mo);
    if (onMotionChange) onMotionChange(mo);
  };

  // Each reply's speech gets a number. When it finishes, she returns to her default
  // face and pose, but only if no newer reply has started in the meantime.
  const speechTokenRef = useRef(0);
  const returnToDefault = (token: number, delayMs = 600) => {
    setTimeout(() => {
      if (token !== speechTokenRef.current) return;
      handleEmotionChange("neutral");
      handleMotionChange("none");
    }, delayMs);
  };
  // With no voice, hold the expression for roughly the time it takes to read the reply.
  const readingTimeMs = (text: string) =>
    Math.min(12000, Math.max(2500, text.split(/\s+/).filter(Boolean).length * 350));

  useEffect(() => {
    if (onEmotionChange) onEmotionChange(currentEmotion);
    if (onMotionChange) onMotionChange(currentMotion);
  }, []);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Desktop: width of the chat panel beside the stage, set with the drag handle
  // between them and remembered in this browser.
  const CHAT_MIN_WIDTH = 320;
  const CHAT_DEFAULT_WIDTH = 440;
  const chatMaxWidth = () => Math.max(CHAT_MIN_WIDTH, Math.floor(window.innerWidth * 0.6));
  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("waifu_chat_width"));
      if (Number.isFinite(saved) && saved >= CHAT_MIN_WIDTH) return saved;
    } catch (e) {}
    return CHAT_DEFAULT_WIDTH;
  });
  const [isResizingChat, setIsResizingChat] = useState(false);

  const startChatResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizingChat(true);
  };

  useEffect(() => {
    if (!isResizingChat) return;
    const move = (e: PointerEvent) => {
      // The chat panel sits against the right edge, so its width is the distance to it.
      setChatWidth(Math.min(chatMaxWidth(), Math.max(CHAT_MIN_WIDTH, window.innerWidth - e.clientX)));
    };
    const stop = () => setIsResizingChat(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizingChat]);

  useEffect(() => {
    if (isResizingChat) return;
    try {
      localStorage.setItem("waifu_chat_width", String(Math.round(chatWidth)));
    } catch (e) {}
  }, [chatWidth, isResizingChat]);

  const handleSplitterKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") setChatWidth((w) => Math.min(chatMaxWidth(), w + step));
    else if (e.key === "ArrowRight") setChatWidth((w) => Math.max(CHAT_MIN_WIDTH, w - step));
    else return;
    e.preventDefault();
  };

  // Phone: the full conversation opens as a sheet over the stage; otherwise the
  // latest lines show as subtitles over her.
  const [showHistory, setShowHistory] = useState(false);

  // Desktop puts the persona picker in the app header (a slot App renders).
  const [personaSlot, setPersonaSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPersonaSlot(document.getElementById("persona-slot"));
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastTranscriptRef = useRef<string>("");

  // When switching waifu, load her chat history
  const handleSwitchWaifu = (newId: string) => {
    if (propsOnSwitchWaifu) {
      propsOnSwitchWaifu(newId);
    } else {
      setLocalActiveProfileId(newId);
      setActiveWaifuId(newId);
    }

    const targetProfile = profiles.find((p) => p.id === newId) || DEFAULT_WAIFU_PROFILES[0];
    const newHistory = getWaifuChatHistory(newId, targetProfile.greetingMessage);
    setMessages(newHistory);

    if (onUpdateSystemPrompt) {
      onUpdateSystemPrompt(targetProfile.personalityPrompt);
    }
  };

  // Auto-save chat history per waifu
  useEffect(() => {
    saveWaifuChatHistory(activeProfile.id, messages);
  }, [messages, activeProfile.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, showHistory, loading]);

  const handleClearHistory = () => {
    const freshMessages = clearWaifuChatHistory(activeProfile.id, activeProfile.greetingMessage);
    setMessages(freshMessages);
  };

  const handleSaveProfile = (updatedProfile: WaifuProfile) => {
    if (propsOnSaveProfile) {
      propsOnSaveProfile(updatedProfile);
    } else {
      const updated = profiles.map((p) => (p.id === updatedProfile.id ? updatedProfile : p));
      setLocalProfiles(updated);
      saveWaifuProfiles(updated);
    }
    if (onUpdateSystemPrompt && updatedProfile.id === activeProfileId) {
      onUpdateSystemPrompt(updatedProfile.personalityPrompt);
    }
  };

  const handleCreateProfile = (newProfile: WaifuProfile) => {
    if (propsOnCreateProfile) {
      propsOnCreateProfile(newProfile);
    } else {
      const updated = [...profiles, newProfile];
      setLocalProfiles(updated);
      saveWaifuProfiles(updated);
      handleSwitchWaifu(newProfile.id);
    }
  };

  const handleDeleteProfile = (id: string) => {
    if (propsOnDeleteProfile) {
      propsOnDeleteProfile(id);
    } else {
      const updated = profiles.filter((p) => p.id !== id);
      setLocalProfiles(updated);
      saveWaifuProfiles(updated);
      if (activeProfileId === id && updated.length > 0) {
        handleSwitchWaifu(updated[0].id);
      }
    }
  };

  const handleResetDefaults = () => {
    if (propsOnResetDefaults) {
      propsOnResetDefaults();
    } else {
      setLocalProfiles(DEFAULT_WAIFU_PROFILES);
      saveWaifuProfiles(DEFAULT_WAIFU_PROFILES);
      handleSwitchWaifu("aoi");
    }
  };

  const isTTSEnabled = ttsConfig.enabled !== false;

  const toggleTTS = () => {
    const nextEnabled = !isTTSEnabled;
    if (!nextEnabled) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    }
    if (onTTSChange) {
      onTTSChange({ ...ttsConfig, enabled: nextEnabled });
    }
  };

  const decodeAudioBlobTo16kHzFloat32 = async (blob: Blob): Promise<number[] | null> => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      await audioCtx.close();
      return Array.from(channelData);
    } catch (err) {
      console.warn("AudioContext decode error:", err);
      return null;
    }
  };

  const startMediaRecorder = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support microphone audio recording.");
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        // Attempt fallback with explicit device enumeration if generic audio: true failed in Firefox
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          if (audioInputs.length > 0) {
            for (const input of audioInputs) {
              if (input.deviceId) {
                try {
                  stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: input.deviceId },
                  });
                  if (stream) break;
                } catch (subErr) {
                  // continue trying
                }
              }
            }
          }
        } catch (enumErr) {
          // ignore
        }

        if (!stream) throw e;
      }
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        stream?.getTracks().forEach((track) => track.stop());

        if (audioChunks.length === 0) return;
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });

        setIsTranscribing(true);
        try {
          const pcmSamples = await decodeAudioBlobTo16kHzFloat32(audioBlob);

          const reader = new FileReader();
          reader.onloadend = async () => {
            const resultStr = reader.result as string;
            const base64Data = resultStr.includes(",") ? resultStr.split(",")[1] : resultStr;

            try {
              const response = await fetch("/api/waifu/stt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pcmFloat32: pcmSamples,
                  audioBase64: base64Data,
                  mimeType: audioBlob.type || "audio/webm",
                  language: sttConfig.language || "en-US",
                  openWebUIConfig,
                }),
              });

              const data = await response.json();
              if (data.text) {
                setInput(data.text);
                handleSendMessage(data.text);
              } else if (data.error) {
                console.warn("STT error:", data.error);
                alert("Audio Speech-to-Text: " + data.error);
              }
            } catch (err: any) {
              console.error("STT request error:", err);
              alert("Failed to transcribe microphone audio.");
            } finally {
              setIsTranscribing(false);
            }
          };
          reader.readAsDataURL(audioBlob);
        } catch (err: any) {
          console.error("FileReader error:", err);
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
    } catch (err: any) {
      console.error("MediaRecorder start error:", err);
      setIsListening(false);

      if (
        err.name === "NotFoundError" ||
        err.message?.includes("The object can not be found here") ||
        err.name === "DevicesNotFoundError"
      ) {
        alert(
          "No microphone hardware was detected by Firefox.\n\n" +
            "Even though website permission is Allowed, Firefox cannot find an active audio input device on your operating system.\n\n" +
            "How to fix:\n" +
            "1. Verify a microphone/headset is plugged in and recognized in your OS Sound Settings.\n" +
            "2. Check OS privacy settings (e.g. Windows 'Microphone privacy settings' -> 'Allow apps/desktop apps to access your microphone', or macOS 'Security & Privacy -> Microphone -> Firefox').\n" +
            "3. Restart Firefox after plugging in or enabling the microphone."
        );
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        alert(
          "Microphone access was denied. Please click the permissions icon next to the URL bar in Firefox and ensure Microphone is set to 'Allow'."
        );
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        alert(
          "Microphone is currently in use or locked by another application. Please close other recording programs and try again."
        );
      } else {
        alert("Microphone error: " + (err.message || err));
      }
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error(e);
        }
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Browsers like Firefox without built-in Web Speech API -> use MediaRecorder directly!
      await startMediaRecorder();
      return;
    }

    // Explicitly prompt user for microphone access if needed
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (err: any) {
      console.warn("Microphone access error:", err);
      alert("Microphone access was denied or is blocked by browser permissions.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = sttConfig.language || "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;

      lastTranscriptRef.current = "";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        if (currentText) {
          setInput(currentText);
          lastTranscriptRef.current = currentText;
        }
      };

      recognition.onerror = async (event: any) => {
        console.warn("Speech recognition error, trying MediaRecorder fallback:", event.error);
        setIsListening(false);
        if (event.error !== "aborted") {
          await startMediaRecorder();
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        const finalRecordedText = lastTranscriptRef.current.trim();
        if (finalRecordedText) {
          handleSendMessage(finalRecordedText);
          lastTranscriptRef.current = "";
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err: any) {
      console.warn("SpeechRecognition start failed, trying MediaRecorder:", err);
      await startMediaRecorder();
    }
  };

  useEffect(() => {
    if (onMicStatusChange) {
      onMicStatusChange({
        isListening,
        isTranscribing,
        toggleListening,
      });
    }
  }, [isListening, isTranscribing, onMicStatusChange]);

  const speakText = async (text: string) => {
    const token = ++speechTokenRef.current;
    const { cleanText: cleanSpeech } = parseEmotionAndMotionTags(text, currentEmotion);

    if (ttsConfig.enabled === false || !cleanSpeech) {
      returnToDefault(token, readingTimeMs(cleanSpeech));
      return;
    }

    if (ttsConfig.provider === "openai") {
      setIsSpeaking(true);
      scrollToAvatarOnSpeak();

      try {
        const blob = await fetchOpenAITTSAudioBlob({
          text: cleanSpeech,
          baseUrl: ttsConfig.openaiBaseUrl || DEFAULT_TTS_BASE_URL,
          apiKey: ttsConfig.openaiApiKey || "",
          model: ttsConfig.openaiModel || DEFAULT_TTS_MODEL,
          voice: activeProfile.ttsVoice || ttsConfig.openaiVoice || DEFAULT_TTS_VOICE,
          speed: activeProfile.ttsRate || ttsConfig.rate || 1.0,
        });

        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);

        let detachLipSync: (() => void) | null = null;

        const cleanup = () => {
          if (detachLipSync) {
            detachLipSync();
            detachLipSync = null;
          }
          lipSyncEngine.stop();
          setAudioVolume(0);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };

        audio.onplay = () => {
          detachLipSync = lipSyncEngine.attachAudioElement(audio);
        };

        audio.onended = () => {
          cleanup();
          returnToDefault(token);
        };
        audio.onerror = (e) => {
          console.error("Waifu TTS audio playback error:", e);
          cleanup();
          // No voice: keep the face up for about as long as the reply takes to read.
          returnToDefault(token, readingTimeMs(cleanSpeech));
        };

        await audio.play();
      } catch (err: any) {
        console.error("Waifu OpenAI TTS error:", err);
        lipSyncEngine.stop();
        setAudioVolume(0);
        setIsSpeaking(false);
        returnToDefault(token, readingTimeMs(cleanSpeech));
      }
      return;
    }

    // Default Web Speech API fallback
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      returnToDefault(token, readingTimeMs(cleanSpeech));
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    scrollToAvatarOnSpeak();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.pitch = activeProfile.ttsPitch || ttsConfig.pitch || 1.1;
    utterance.rate = activeProfile.ttsRate || ttsConfig.rate || 1.0;
    utterance.volume = ttsConfig.volume;

    const voices = window.speechSynthesis.getVoices();
    const voiceToFind = activeProfile.ttsVoice || ttsConfig.voice;
    if (voiceToFind) {
      const selected = voices.find((v) => v.name.toLowerCase().includes(voiceToFind.toLowerCase()));
      if (selected) utterance.voice = selected;
    }

    let detachUtterance: (() => void) | null = null;
    utterance.onstart = () => {
      detachUtterance = lipSyncEngine.startSpeechUtterance();
    };

    utterance.onend = () => {
      if (detachUtterance) {
        detachUtterance();
        detachUtterance = null;
      }
      lipSyncEngine.stop();
      setAudioVolume(0);
      setIsSpeaking(false);
      returnToDefault(token);
    };

    utterance.onerror = () => {
      if (detachUtterance) {
        detachUtterance();
        detachUtterance = null;
      }
      lipSyncEngine.stop();
      setAudioVolume(0);
      setIsSpeaking(false);
      returnToDefault(token);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || input).trim();
    if (!userText || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let replyContent = "";
      let newEmotion: EmotionType = "neutral";

      const systemPromptToUse = activeProfile.personalityPrompt || openWebUIConfig.systemPrompt;

      const isOpenWebUIActive =
        openWebUIConfig.enabled !== false &&
        Boolean(openWebUIConfig.baseUrl?.trim()) &&
        Boolean(openWebUIConfig.model?.trim());

      if (isOpenWebUIActive) {
        // Exclusively use OpenAI-compatible API (OpenWebUI, Ollama, LM Studio, vLLM, OpenAI)
        try {
          const res = await fetch("/api/openwebui/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl: openWebUIConfig.baseUrl.trim(),
              apiKey: openWebUIConfig.apiKey?.trim() || "",
              endpoint: "/chat/completions",
              method: "POST",
              body: {
                model: openWebUIConfig.model.trim(),
                messages: [
                  { role: "system", content: systemPromptToUse },
                  ...messages.slice(-5).map((m) => ({
                    role: m.sender === "user" ? "user" : "assistant",
                    content: m.text,
                  })),
                  { role: "user", content: userText },
                ],
                temperature: 0.8,
              },
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `OpenAI / OpenWebUI API returned status ${res.status}`);
          }

          replyContent = data.choices?.[0]?.message?.content || "";
          if (!replyContent) {
            replyContent = "[OpenAI API Error] Model returned empty content.";
          }
        } catch (e: any) {
          console.error("OpenAI / OpenWebUI chat error:", e);
          replyContent = `[OpenAI API Error] ${e.message || "Failed to communicate with OpenAI / OpenWebUI server"}.`;
          newEmotion = "sad";
        }
      } else {
        // No OpenAI-compatible server configured: direct user to Settings
        replyContent = `[Configuration Required] No OpenAI-compatible API server is configured. Please open Settings (⚙️) and enter your OpenAI / OpenWebUI / Ollama / Local Server Base URL, Model name, and API Key to chat.`;
        newEmotion = "confused";
      }

      const parsedTags = parseEmotionAndMotionTags(replyContent, currentEmotion);
      newEmotion = parsedTags.primaryEmotion;
      const newMotion = parsedTags.primaryMotion;

      if (newEmotion === "excited" || newMotion === "laugh") {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      }

      handleEmotionChange(newEmotion);
      handleMotionChange(newMotion);

      const waifuMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "waifu",
        text: replyContent,
        emotion: newEmotion,
        motion: newMotion,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, waifuMsg]);
      speakText(parsedTags.cleanText);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "system",
          text: `[Error] ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Conversation mode (hands-free). Listening pauses while she is thinking or
  // speaking and resumes shortly after, so she never answers her own voice.
  // ---------------------------------------------------------------------------
  const [conversationOn, setConversationOn] = useState(false);
  const [listenerState, setListenerState] = useState<ListenerState | null>(null);
  const listenerRef = useRef<ConversationListener | null>(null);
  const sendMessageRef = useRef(handleSendMessage);
  sendMessageRef.current = handleSendMessage;
  const busyRef = useRef(false);
  busyRef.current = isSpeaking || loading || isTranscribing;
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const transcribeUtterance = async (audio: Float32Array) => {
    if (busyRef.current) return;
    const durationSec = audio.length / 16000;
    setIsTranscribing(true);
    try {
      const res = await fetch("/api/waifu/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcmBase64: float32ToBase64(audio), language: sttConfig.language || "en-US" }),
      });
      const data = await res.json().catch(() => ({}));
      const text = cleanTranscript(data.text || "", durationSec);
      if (text) sendMessageRef.current(text);
    } catch (err) {
      console.error("Conversation mode transcription failed:", err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const stopConversation = () => {
    listenerRef.current?.destroy();
    listenerRef.current = null;
    setConversationOn(false);
    setListenerState(null);
  };

  const toggleConversation = async () => {
    if (conversationOn) {
      stopConversation();
      return;
    }
    if (isListening) toggleListening(); // finish any push-to-talk first
    setConversationOn(true);
    try {
      listenerRef.current = await createConversationListener({
        onUtterance: (audio) => void transcribeUtterance(audio),
        onState: setListenerState,
      });
      if (!busyRef.current) await listenerRef.current.resume();
      else setListenerState("paused");
    } catch (err: any) {
      console.error("Conversation mode failed to start:", err);
      stopConversation();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "system",
          text: `[Error] Conversation mode could not start: ${err?.message || err}. Check microphone permission.`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  useEffect(() => {
    const listener = listenerRef.current;
    if (!conversationOn || !listener) return;
    if (isSpeaking || loading || isTranscribing || !pageVisible) {
      void listener.pause();
      return;
    }
    // A short gap after she stops talking keeps the tail of her voice out.
    const t = window.setTimeout(() => {
      if (listenerRef.current === listener && !busyRef.current) void listener.resume();
    }, 350);
    return () => window.clearTimeout(t);
  }, [conversationOn, isSpeaking, loading, isTranscribing, pageVisible]);

  useEffect(() => () => listenerRef.current?.destroy(), []);

  const conversationButton = (
    <button
      type="button"
      onClick={toggleConversation}
      className={`p-2.5 sm:p-3 rounded-full transition border flex-shrink-0 ${
        conversationOn
          ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20"
          : "bg-slate-900 text-emerald-300 border-slate-700 hover:text-white hover:bg-slate-800 hover:border-emerald-500"
      }`}
      title={conversationOn ? "Stop conversation mode" : "Conversation mode: just talk, she answers when you pause"}
      aria-pressed={conversationOn}
    >
      <AudioLines className="w-4 h-4" />
    </button>
  );

  const conversationStatus = conversationOn
    ? isSpeaking
      ? { label: `${activeProfile.name} is speaking`, dot: "bg-violet-400" }
      : loading
      ? { label: `${activeProfile.name} is thinking`, dot: "bg-violet-400 animate-pulse" }
      : isTranscribing
      ? { label: "Got it…", dot: "bg-amber-400 animate-pulse" }
      : listenerState === "hearing"
      ? { label: "Hearing you…", dot: "bg-rose-500 animate-ping" }
      : listenerState === "starting"
      ? { label: "Starting microphone…", dot: "bg-slate-400 animate-pulse" }
      : listenerState === "listening"
      ? { label: "Listening", dot: "bg-emerald-400" }
      : { label: "Paused", dot: "bg-slate-500" }
    : null;

  const statusPill = conversationStatus ? (
    <div className="pointer-events-none flex items-center gap-2 bg-slate-950/80 border border-slate-700/70 backdrop-blur px-3 py-1.5 rounded-full text-xs text-slate-200 shadow-lg">
      <span className={`w-2 h-2 rounded-full ${conversationStatus.dot}`} />
      <span>{conversationStatus.label}</span>
    </div>
  ) : null;

  const personaModal = (
      <PersonaEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSelectProfile={handleSwitchWaifu}
        onSaveProfile={handleSaveProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        onResetDefaults={handleResetDefaults}
      />
  );

  const personaChips = (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
      {profiles.map((p) => {
        const isActive = p.id === activeProfileId;
        return (
          <button
            key={p.id}
            onClick={() => handleSwitchWaifu(p.id)}
            title={`Switch to ${p.name}`}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap border flex-shrink-0 ${
              isActive
                ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/20"
                : "bg-slate-950/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span>{p.avatarIcon || "👧"}</span>
            <span>{p.name}</span>
          </button>
        );
      })}
    </div>
  );

  const phoneFramingKey = `waifu_phone_framing_${activeProfile.id}_${activeProfile.live2dModelUrl}`;
  const phoneFraming: { scale?: number; x?: number; y?: number; refHeight?: number } | null = (() => {
    if (!isMobile) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(phoneFramingKey) || "null");
      return saved && typeof saved.scale === "number" ? saved : null;
    } catch (e) {
      return null;
    }
  })();

  const avatar = (
    <Live2DAvatar
      key={activeProfile.id + activeProfile.live2dModelUrl}
      fill
      onDebugLog={onDebugLog}
      emotion={currentEmotion}
      motion={currentMotion}
      isSpeaking={isSpeaking}
      characterName={activeProfile.name}
      modelUrl={activeProfile.live2dModelUrl}
      physicsIntensity={activeProfile.physicsIntensity ?? 1.0}
      trackingEngineEnabled={trackingEngineEnabled}
      initialScale={isMobile ? phoneFraming?.scale : activeProfile.live2dScale}
      initialX={isMobile ? phoneFraming?.x : activeProfile.live2dX}
      initialY={isMobile ? phoneFraming?.y : activeProfile.live2dY}
      initialRefHeight={isMobile ? phoneFraming?.refHeight : activeProfile.live2dRefHeight}
      onTransformChange={(scale, x, y, refHeight) => {
        if (isMobile) {
          // Phone framing stays on this device; the profile keeps the desktop framing.
          try {
            localStorage.setItem(phoneFramingKey, JSON.stringify({ scale, x, y, refHeight }));
          } catch (e) {}
          return;
        }
        handleSaveProfile({
          ...activeProfile,
          live2dScale: scale,
          live2dX: x,
          live2dY: y,
          live2dRefHeight: refHeight,
        });
      }}
      onPhysicsIntensityChange={(intensity) => {
        handleSaveProfile({
          ...activeProfile,
          physicsIntensity: intensity,
        });
      }}
      onModelUrlChange={(newUrl) => {
        handleSaveProfile({
          ...activeProfile,
          live2dModelUrl: newUrl,
        });
      }}
      onEmotionChange={(emo) => handleEmotionChange(emo)}
      onMotionTrigger={(mo) => handleMotionChange(mo)}
      audioVolume={audioVolume}
    />
  );

  const displayText = (msg: ChatMessage) =>
    msg.sender === "waifu" ? parseEmotionAndMotionTags(msg.text).cleanText : msg.text;

  const messageList = (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[85%] ${
            msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
          }`}
        >
          <div
            className={`w-6 sm:w-7 h-6 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              msg.sender === "user"
                ? "bg-slate-800 text-slate-300 border border-slate-700"
                : msg.sender === "waifu"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "bg-amber-600 text-white"
            }`}
          >
            {msg.sender === "user" ? <User className="w-3.5 sm:w-4 h-3.5 sm:h-4" /> : <Bot className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
          </div>

          <div
            className={`p-2.5 sm:p-3.5 rounded-2xl leading-relaxed text-xs sm:text-sm ${
              msg.sender === "user"
                ? "bg-violet-600/10 border border-violet-500/30 text-violet-100 rounded-br-none"
                : msg.sender === "waifu"
                ? "bg-slate-900 border border-slate-800 text-slate-300 rounded-bl-none"
                : "bg-amber-950/40 border border-amber-800/40 text-amber-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1">
              <span className="font-bold text-[11px] sm:text-xs opacity-90">
                {msg.sender === "user" ? "You" : msg.sender === "waifu" ? activeProfile.name : "System"}
              </span>
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                {msg.emotion && (
                  <span className="text-[9px] sm:text-[10px] bg-violet-500/20 border border-violet-500/30 px-1.5 sm:px-2 py-0.5 rounded text-violet-300 font-mono uppercase tracking-wider">
                    [{msg.emotion}]
                  </span>
                )}
                {msg.motion && msg.motion !== "none" && (
                  <span className="text-[9px] sm:text-[10px] bg-emerald-500/20 border border-emerald-500/30 px-1.5 sm:px-2 py-0.5 rounded text-emerald-300 font-mono uppercase tracking-wider">
                    [{msg.motion}]
                  </span>
                )}
              </div>
            </div>

            <p className="whitespace-pre-wrap">{displayText(msg)}</p>
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex gap-2 items-center text-xs text-violet-300 bg-violet-950/30 p-2.5 rounded-xl border border-violet-800/40 w-max">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
          <span>{activeProfile.name} is thinking...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );

  const micButton = (
    <button
      type="button"
      onClick={toggleListening}
      disabled={isTranscribing || conversationOn}
      className={`p-2.5 sm:p-3 rounded-full transition border flex-shrink-0 ${
        isTranscribing
          ? "bg-violet-950 text-violet-300 border-violet-500/50"
          : isListening
          ? "bg-rose-600 text-white border-rose-500 animate-pulse shadow-lg"
          : "bg-slate-900 text-slate-200 border-slate-700 hover:text-white hover:bg-slate-800 hover:border-violet-500"
      }`}
      title={
        isTranscribing
          ? "Transcribing voice audio..."
          : isListening
          ? "Stop listening (Recording... Click to stop)"
          : "Click to speak with microphone (Speech-to-Text)"
      }
    >
      {isTranscribing ? (
        <Loader2 className="w-4 h-4 text-violet-300 animate-spin" />
      ) : isListening ? (
        <MicOff className="w-4 h-4 text-white" />
      ) : (
        <Mic className="w-4 h-4 text-violet-400" />
      )}
    </button>
  );

  const textInput = (
    <input
      type="text"
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder={`Talk to ${activeProfile.name}...`}
      enterKeyHint="send"
      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-full py-2.5 sm:py-3 px-3.5 sm:px-5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition"
    />
  );

  const sendButton = (
    <button
      type="submit"
      disabled={loading || !input.trim()}
      title="Send"
      className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-full text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-violet-500/20 flex-shrink-0"
    >
      <Send className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Send</span>
    </button>
  );

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const clearButton = (
    <button
      onClick={handleClearHistory}
      className="p-1.5 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800/60 transition flex items-center gap-1.5 text-xs font-medium"
      title={`Clear chat history for ${activeProfile.name}`}
    >
      <Trash2 className="w-3.5 h-3.5" />
      <span>Clear</span>
    </button>
  );

  // ---------------------------------------------------------------------------
  // Desktop: she is the stage; the conversation is a panel beside her whose
  // width is set by dragging the handle between them.
  // ---------------------------------------------------------------------------
  if (!isMobile) {
    const panelWidth = Math.min(chatWidth, chatMaxWidth());
    return (
      <div className="flex w-full h-full min-h-0">
        {personaSlot ? createPortal(personaChips, personaSlot) : null}

        <section ref={avatarSectionRef} className="relative flex-1 min-w-0 h-full">
          {!personaSlot && <div className="absolute top-3 left-3 z-30">{personaChips}</div>}
          {statusPill && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">{statusPill}</div>}
          {avatar}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize conversation panel"
          aria-valuenow={Math.round(panelWidth)}
          tabIndex={0}
          onPointerDown={startChatResize}
          onKeyDown={handleSplitterKey}
          onDoubleClick={() => setChatWidth(CHAT_DEFAULT_WIDTH)}
          title="Drag to resize · double-click to reset"
          className={`group relative w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center border-l border-slate-800 focus:outline-none focus-visible:bg-violet-600/30 ${
            isResizingChat ? "bg-violet-600/30" : "bg-slate-950 hover:bg-violet-600/15"
          }`}
        >
          <div className={`w-0.5 h-12 rounded-full ${isResizingChat ? "bg-violet-400" : "bg-slate-700 group-hover:bg-violet-400"}`} />
        </div>

        <aside
          style={{ width: panelWidth }}
          className="flex-shrink-0 h-full min-h-0 flex flex-col bg-slate-900 p-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
              <h3 className="font-bold text-sm text-slate-100 font-serif italic truncate">
                {activeProfile.name}'s Conversation Thread
              </h3>
            </div>
            {clearButton}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 text-xs font-sans">{messageList}</div>

          <form onSubmit={submitForm} className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2 w-full">
            {micButton}
            {conversationButton}
            {textInput}
            {sendButton}
          </form>
        </aside>

        {personaModal}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Phone / narrow: she fills the screen, the latest lines float over her as
  // subtitles, and the input stays pinned at the bottom. The full conversation
  // opens as a sheet over the stage.
  // ---------------------------------------------------------------------------
  const subtitleMessages = messages.slice(-2);
  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden bg-slate-950">
      <div ref={avatarSectionRef} className="absolute inset-0">
        {avatar}
      </div>

      <div className="absolute top-2.5 left-2.5 right-2.5 z-30 flex flex-col items-start gap-2">
        {personaChips}
        {statusPill}
      </div>

      {showHistory ? (
        <div className="absolute inset-x-0 top-[42%] bottom-0 z-30 flex flex-col bg-slate-950/90 backdrop-blur-md border-t border-slate-800 rounded-t-2xl">
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-slate-800 gap-2">
            <h3 className="font-bold text-sm text-slate-100 font-serif italic truncate">Conversation</h3>
            <div className="flex items-center gap-2">
              {clearButton}
              <button
                onClick={() => setShowHistory(false)}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
                title="Back to her"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-3 py-3 text-xs font-sans">{messageList}</div>
          <div className="h-[68px] flex-shrink-0" />
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-[68px] z-20 px-3 pb-2 flex flex-col gap-1.5 pointer-events-none">
          {subtitleMessages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => setShowHistory(true)}
              className={`pointer-events-auto text-left max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-snug backdrop-blur-sm line-clamp-4 ${
                msg.sender === "user"
                  ? "self-end bg-violet-600/70 text-white rounded-br-sm"
                  : msg.sender === "waifu"
                  ? "self-start bg-slate-950/75 text-slate-100 border border-slate-700/60 rounded-bl-sm"
                  : "self-start bg-amber-950/80 text-amber-200 border border-amber-800/50"
              }`}
            >
              {displayText(msg)}
            </button>
          ))}
          {loading && (
            <div className="self-start flex gap-2 items-center text-xs text-violet-200 bg-slate-950/75 px-3 py-2 rounded-2xl backdrop-blur-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
              <span>{activeProfile.name} is thinking...</span>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={submitForm}
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        className="absolute inset-x-0 bottom-0 z-40 px-2.5 pt-2 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border-t border-slate-800/80"
      >
        {micButton}
        {conversationButton}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={`p-2.5 rounded-full border flex-shrink-0 transition ${
            showHistory ? "bg-violet-600 text-white border-violet-500" : "bg-slate-900 text-violet-300 border-slate-700"
          }`}
          title={showHistory ? "Hide conversation" : "Show conversation"}
        >
          <MessagesSquare className="w-4 h-4" />
        </button>
        {textInput}
        {sendButton}
      </form>

      {personaModal}
    </div>
  );
};
