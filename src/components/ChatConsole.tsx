import React, { useState, useEffect, useRef } from "react";
import { ChatMessage, EmotionType, MotionType, OpenWebUIConfig, TTSConfig, STTConfig, WaifuProfile } from "../types";
import { fetchOpenAITTSAudioBlob } from "../lib/openaiTts";
import { lipSyncEngine } from "../lib/lipSyncEngine";
import { parseEmotionAndMotionTags } from "../lib/tagParser";
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
import { Send, Mic, MicOff, Volume2, VolumeX, RefreshCw, Bot, User, Trash2, Settings2, Plus, Heart, Sparkles, Loader2 } from "lucide-react";
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

  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>(propsEmotion || "neutral");
  const [currentMotion, setCurrentMotion] = useState<MotionType>(propsMotion || "none");
  const avatarSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToAvatarOnSpeak = () => {
    if (avatarSectionRef.current) {
      const rect = avatarSectionRef.current.getBoundingClientRect();
      if (rect.top < -40 || rect.bottom > window.innerHeight + 100 || window.innerWidth < 1024) {
        avatarSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

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

  const [chatPos, setChatPos] = useState(() => {
    try {
      const saved = localStorage.getItem("waifu_chat_pos");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { x: 0, y: 0 };
  });

  const [chatSize, setChatSize] = useState<{ width: string; height: string }>(() => {
    try {
      const saved = localStorage.getItem("waifu_chat_size");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { width: "", height: "" };
  });

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("waifu_chat_pos", JSON.stringify(chatPos));
    } catch (e) {}
  }, [chatPos]);

  const handleChatResizeSave = () => {
    if (isMobile) return;
    const el = chatContainerRef.current;
    if (el) {
      const newSize = { width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` };
      setChatSize(newSize);
      try {
        localStorage.setItem("waifu_chat_size", JSON.stringify(newSize));
      } catch (e) {}
    }
  };

  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const chatDragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handleChatHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    setIsDraggingChat(true);
    chatDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: chatPos.x,
      initialY: chatPos.y,
    };
    e.stopPropagation();
  };

  const handleChatHeaderTouchStart = (e: React.TouchEvent) => {
    if (isMobile) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDraggingChat(true);
      chatDragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        initialX: chatPos.x,
        initialY: chatPos.y,
      };
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingChat) return;
      const dx = e.clientX - chatDragRef.current.startX;
      const dy = e.clientY - chatDragRef.current.startY;
      setChatPos({
        x: chatDragRef.current.initialX + dx,
        y: chatDragRef.current.initialY + dy,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingChat || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - chatDragRef.current.startX;
      const dy = touch.clientY - chatDragRef.current.startY;
      setChatPos({
        x: chatDragRef.current.initialX + dx,
        y: chatDragRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDraggingChat(false);
    };

    const handleTouchEnd = () => {
      setIsDraggingChat(false);
    };

    if (isDraggingChat) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDraggingChat]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (ttsConfig.enabled === false) return;

    const { cleanText: cleanSpeech } = parseEmotionAndMotionTags(text, currentEmotion);
    if (!cleanSpeech) return;

    if (ttsConfig.provider === "openai") {
      setIsSpeaking(true);
      scrollToAvatarOnSpeak();

      try {
        const blob = await fetchOpenAITTSAudioBlob({
          text: cleanSpeech,
          baseUrl: ttsConfig.openaiBaseUrl || "http://localhost:8000/v1",
          apiKey: ttsConfig.openaiApiKey || "",
          model: ttsConfig.openaiModel || "kokoro",
          voice: activeProfile.ttsVoice || ttsConfig.openaiVoice || "af_bella(.1)+zf_xiaoni(.9)",
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

        audio.onended = cleanup;
        audio.onerror = (e) => {
          console.error("Waifu TTS audio playback error:", e);
          cleanup();
        };

        await audio.play();
      } catch (err: any) {
        console.error("Waifu OpenAI TTS error:", err);
        lipSyncEngine.stop();
        setAudioVolume(0);
        setIsSpeaking(false);
      }
      return;
    }

    // Default Web Speech API fallback
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

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
    };

    utterance.onerror = () => {
      if (detachUtterance) {
        detachUtterance();
        detachUtterance = null;
      }
      lipSyncEngine.stop();
      setAudioVolume(0);
      setIsSpeaking(false);
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

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      
      {/* Top Waifu Quick Selector & Persona Manager Bar */}
      <div className="bg-slate-900 border border-slate-800 p-2.5 sm:p-3.5 rounded-2xl flex items-center justify-between gap-2 shadow-lg w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-0.5 max-w-full no-scrollbar">
          <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5 mr-1 flex-shrink-0">
            <Heart className="w-3.5 h-3.5 text-violet-400 fill-violet-400/20" />
            <span className="hidden xs:inline sm:inline">Active Persona:</span>
          </span>

          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            return (
              <button
                key={p.id}
                onClick={() => handleSwitchWaifu(p.id)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap border flex-shrink-0 ${
                  isActive
                    ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <span>{p.avatarIcon || "👧"}</span>
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start w-full max-w-full">
        
        {/* Live2D Avatar Area (5 cols on lg, full width top on mobile) */}
        <div ref={avatarSectionRef} className="w-full max-w-full mx-auto lg:col-span-5">
          <Live2DAvatar
            key={activeProfile.id + activeProfile.live2dModelUrl}
            onDebugLog={onDebugLog}
            emotion={currentEmotion}
            motion={currentMotion}
            isSpeaking={isSpeaking}
            characterName={activeProfile.name}
            modelUrl={activeProfile.live2dModelUrl}
            physicsIntensity={activeProfile.physicsIntensity ?? 1.0}
            trackingEngineEnabled={trackingEngineEnabled}
            initialScale={activeProfile.live2dScale}
            initialX={activeProfile.live2dX}
            initialY={activeProfile.live2dY}
            onTransformChange={(scale, x, y) => {
              handleSaveProfile({
                ...activeProfile,
                live2dScale: scale,
                live2dX: x,
                live2dY: y,
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
        </div>

        {/* Chat Console Area (7 cols on lg, full width bottom on mobile, stacked vertically) */}
        <div
          ref={chatContainerRef}
          onMouseUp={isMobile ? undefined : handleChatResizeSave}
          onTouchEnd={isMobile ? undefined : handleChatResizeSave}
          style={{
            transform: isMobile ? undefined : `translate(${chatPos.x}px, ${chatPos.y}px)`,
            position: "relative",
            zIndex: isDraggingChat ? 30 : 10,
            width: isMobile ? "100%" : (chatSize.width || undefined),
            height: isMobile ? undefined : (chatSize.height || undefined),
            maxWidth: "100%",
          }}
          className={`w-full max-w-full mx-auto lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-5 shadow-xl flex flex-col h-[520px] overflow-auto min-w-0 min-h-[380px] ${
            isMobile ? "resize-none" : "lg:resize lg:min-w-[320px] lg:min-h-[400px]"
          }`}
        >
          
          {/* Console Header */}
          <div
            onMouseDown={isMobile ? undefined : handleChatHeaderMouseDown}
            onTouchStart={isMobile ? undefined : handleChatHeaderTouchStart}
            className={`flex items-center justify-between border-b border-slate-800 pb-2.5 sm:pb-3 mb-3 sm:mb-4 select-none ${
              isMobile ? "cursor-default" : "cursor-move"
            }`}
            title={isMobile ? undefined : "Drag to move conversation window"}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
              <h3 className="font-bold text-xs sm:text-sm text-slate-100 font-serif italic truncate">
                {activeProfile.name}'s Conversation Thread
              </h3>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 flex-shrink-0">
              <button
                onClick={handleClearHistory}
                className="p-1 sm:p-1.5 px-2 sm:px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800/60 transition flex items-center gap-1.5 text-[11px] sm:text-xs font-medium"
                title={`Clear chat history for ${activeProfile.name}`}
              >
                <Trash2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                <span className="hidden xs:inline">Clear Chat</span>
              </button>
            </div>
          </div>

          {/* Messages History */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 sm:pr-2 text-xs font-sans">
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

                  <p className="whitespace-pre-wrap">{msg.text}</p>
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
          </div>

          {/* Chat Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-800 flex items-center gap-1.5 sm:gap-2 w-full max-w-full"
          >
            <button
              type="button"
              onClick={toggleListening}
              disabled={isTranscribing}
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

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Enter command or talk to ${activeProfile.name}...`}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-full py-2.5 sm:py-3 px-3.5 sm:px-5 text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-full text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-violet-500/20 flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Send</span>
            </button>
          </form>

        </div>

      </div>

      {/* Persona Manager Modal */}
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

    </div>
  );
};
