import React, { useState, useEffect, useRef } from "react";
import { ChatMessage, EmotionType, OpenWebUIConfig, TTSConfig, STTConfig, WaifuProfile } from "../types";
import { fetchOpenAITTSAudioBlob } from "../lib/openaiTts";
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
  onTTSChange?: (config: TTSConfig) => void;
  onSTTChange?: (config: STTConfig) => void;
  onUpdateSystemPrompt?: (newPrompt: string) => void;
  onDebugLog?: (msg: string) => void;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  openWebUIConfig,
  ttsConfig,
  sttConfig,
  onTTSChange,
  onSTTChange,
  onUpdateSystemPrompt,
  onDebugLog,
}) => {
  const [profiles, setProfiles] = useState<WaifuProfile[]>(loadWaifuProfiles);
  const [activeProfileId, setActiveProfileIdState] = useState<string>(getActiveWaifuId);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0] || DEFAULT_WAIFU_PROFILES[0];

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    getWaifuChatHistory(activeProfile.id, activeProfile.greetingMessage)
  );

  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>("happy");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastTranscriptRef = useRef<string>("");

  // When switching waifu, load her chat history
  const handleSwitchWaifu = (newId: string) => {
    setActiveProfileIdState(newId);
    setActiveWaifuId(newId);

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
    const updated = profiles.map((p) => (p.id === updatedProfile.id ? updatedProfile : p));
    setProfiles(updated);
    saveWaifuProfiles(updated);
    if (onUpdateSystemPrompt && updatedProfile.id === activeProfileId) {
      onUpdateSystemPrompt(updatedProfile.personalityPrompt);
    }
  };

  const handleCreateProfile = (newProfile: WaifuProfile) => {
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    saveWaifuProfiles(updated);
    handleSwitchWaifu(newProfile.id);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    saveWaifuProfiles(updated);
    if (activeProfileId === id && updated.length > 0) {
      handleSwitchWaifu(updated[0].id);
    }
  };

  const handleResetDefaults = () => {
    setProfiles(DEFAULT_WAIFU_PROFILES);
    saveWaifuProfiles(DEFAULT_WAIFU_PROFILES);
    handleSwitchWaifu("aoi");
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((track) => track.stop());

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
      alert("Microphone access was denied or is blocked by browser permissions: " + (err.message || err));
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

  const speakText = async (text: string) => {
    if (ttsConfig.enabled === false) return;

    const cleanSpeech = text.replace(/^\[(happy|blush|sad|surprised|thinking|excited)\]\s*/i, "").trim();
    if (!cleanSpeech) return;

    if (ttsConfig.provider === "openai") {
      setIsSpeaking(true);
      setAudioVolume(0.2);

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

        let audioCtx: AudioContext | null = null;
        let animFrameId: number;

        const cleanup = () => {
          cancelAnimationFrame(animFrameId);
          if (audioCtx && audioCtx.state !== "closed") {
            audioCtx.close().catch(() => {});
          }
          setAudioVolume(0);
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };

        audio.onplay = () => {
          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              audioCtx = new AudioContextClass();
              const source = audioCtx.createMediaElementSource(audio);
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);
              analyser.connect(audioCtx.destination);

              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);

              const updateVolume = () => {
                if (audio.paused || audio.ended) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const avg = sum / bufferLength;
                setAudioVolume(Math.min(1, avg / 100));
                animFrameId = requestAnimationFrame(updateVolume);
              };
              updateVolume();
            }
          } catch (e) {
            let simInterval = setInterval(() => {
              if (audio.paused || audio.ended) {
                clearInterval(simInterval);
                return;
              }
              setAudioVolume(Math.random() * 0.7 + 0.3);
            }, 90);
          }
        };

        audio.onended = cleanup;
        audio.onerror = (e) => {
          console.error("Waifu TTS audio playback error:", e);
          cleanup();
        };

        await audio.play();
      } catch (err: any) {
        console.error("Waifu OpenAI TTS error:", err);
        setAudioVolume(0);
        setIsSpeaking(false);
      }
      return;
    }

    // Default Web Speech API fallback
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(true);

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

    let volInterval: any;
    utterance.onstart = () => {
      volInterval = setInterval(() => {
        setAudioVolume(Math.random() * 0.8 + 0.2);
      }, 90);
    };

    utterance.onend = () => {
      clearInterval(volInterval);
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
      let newEmotion: EmotionType = "happy";

      const systemPromptToUse = activeProfile.personalityPrompt || openWebUIConfig.systemPrompt;

      const isOpenWebUIActive =
        openWebUIConfig.enabled !== false &&
        Boolean(openWebUIConfig.baseUrl?.trim()) &&
        Boolean(openWebUIConfig.model?.trim());

      if (isOpenWebUIActive) {
        // Exclusively use OpenWebUI when valid settings exist (do NOT call Gemini)
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
            throw new Error(data.error || `OpenWebUI API returned status ${res.status}`);
          }

          replyContent = data.choices?.[0]?.message?.content || "";
          if (!replyContent) {
            replyContent = "[OpenWebUI Error] Model returned empty content.";
          }
        } catch (e: any) {
          console.error("OpenWebUI chat error:", e);
          replyContent = `[OpenWebUI Error] ${e.message || "Failed to communicate with OpenWebUI server"}. (Note: Gemini API fallback is disabled because OpenWebUI is configured as your active LLM provider).`;
          newEmotion = "sad";
        }
      } else {
        // Fall back to Gemini API only when OpenWebUI is unconfigured or disabled
        const res = await fetch("/api/waifu/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: userText }],
            systemPrompt: systemPromptToUse,
            characterName: activeProfile.name,
            emotion: currentEmotion,
          }),
        });

        const data = await res.json();
        replyContent = data.content || data.raw || "Konnichiwa! I am listening!";
        if (data.emotion) {
          newEmotion = data.emotion as EmotionType;
        }
      }

      const emotionMatch = replyContent.match(/^\[(happy|blush|sad|surprised|thinking|excited)\]/i);
      if (emotionMatch) {
        newEmotion = emotionMatch[1].toLowerCase() as EmotionType;
      }

      if (newEmotion === "excited") {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      }

      setCurrentEmotion(newEmotion);

      const waifuMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "waifu",
        text: replyContent,
        emotion: newEmotion,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, waifuMsg]);
      speakText(replyContent);
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
    <div className="space-y-4">
      
      {/* Top Waifu Quick Selector & Persona Manager Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5 mr-1">
            <Heart className="w-3.5 h-3.5 text-violet-400 fill-violet-400/20" />
            <span>Active Persona:</span>
          </span>

          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            return (
              <button
                key={p.id}
                onClick={() => handleSwitchWaifu(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap border ${
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

        <button
          onClick={() => setIsEditorOpen(true)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition shadow"
        >
          <Settings2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Edit Persona & Models</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Live2D Avatar Area (5 cols) */}
        <div className="lg:col-span-5">
          <Live2DAvatar
            key={activeProfile.id + activeProfile.live2dModelUrl}
            onDebugLog={onDebugLog}
            emotion={currentEmotion}
            isSpeaking={isSpeaking}
            characterName={activeProfile.name}
            modelUrl={activeProfile.live2dModelUrl}
            onModelUrlChange={(newUrl) => {
              handleSaveProfile({
                ...activeProfile,
                live2dModelUrl: newUrl,
              });
            }}
            onEmotionChange={(emo) => setCurrentEmotion(emo)}
            audioVolume={audioVolume}
          />
        </div>

        {/* Chat Console Area (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-[520px]">
          
          {/* Console Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="font-bold text-sm text-slate-100 font-serif italic">
                {activeProfile.name}'s Conversation Thread
              </h3>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              {/* TTS Toggle Button */}
              <button
                type="button"
                onClick={toggleTTS}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition ${
                  isTTSEnabled
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30"
                    : "bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300 hover:bg-slate-800"
                }`}
                title={
                  isTTSEnabled
                    ? "Text-to-Speech (TTS) voice synthesis is ON. Click to turn OFF."
                    : "Text-to-Speech (TTS) voice synthesis is OFF. Click to turn ON."
                }
              >
                {isTTSEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-violet-400" />
                    <span>TTS: ON</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                    <span>TTS: OFF</span>
                  </>
                )}
              </button>

              <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-mono text-[11px]">
                Model: {openWebUIConfig.model || "OpenWebUI / Gemini"}
              </span>
              <button
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-800/60 transition flex items-center gap-1 text-[11px]"
                title={`Clear chat history for ${activeProfile.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            </div>
          </div>

          {/* Messages History */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 text-xs font-sans">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    msg.sender === "user"
                      ? "bg-slate-800 text-slate-300 border border-slate-700"
                      : msg.sender === "waifu"
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                      : "bg-amber-600 text-white"
                  }`}
                >
                  {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`p-3.5 rounded-2xl leading-relaxed text-sm ${
                    msg.sender === "user"
                      ? "bg-violet-600/10 border border-violet-500/30 text-violet-100 rounded-br-none"
                      : msg.sender === "waifu"
                      ? "bg-slate-900 border border-slate-800 text-slate-300 rounded-bl-none"
                      : "bg-amber-950/40 border border-amber-800/40 text-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-bold text-xs opacity-90">
                      {msg.sender === "user" ? "You" : msg.sender === "waifu" ? activeProfile.name : "System"}
                    </span>
                    {msg.emotion && (
                      <span className="text-[10px] bg-violet-500/20 px-2 py-0.5 rounded text-violet-300 font-mono uppercase tracking-wider">
                        [{msg.emotion}]
                      </span>
                    )}
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
            className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleListening}
              disabled={isTranscribing}
              className={`p-3 rounded-full transition border ${
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
              className="flex-1 bg-slate-900 border border-slate-800 rounded-full py-3 px-5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-5 py-3 rounded-full text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-violet-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
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
