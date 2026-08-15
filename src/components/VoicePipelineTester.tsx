import React, { useState, useEffect, useRef } from "react";
import { TTSConfig, STTConfig } from "../types";
import { Mic, MicOff, Volume2, Play, Radio, Loader2, Save, Check } from "lucide-react";
import { fetchOpenAITTSAudioBlob } from "../lib/openaiTts";

interface VoicePipelineTesterProps {
  ttsConfig: TTSConfig;
  sttConfig: STTConfig;
  onTTSChange: (config: TTSConfig) => void;
  onSTTChange: (config: STTConfig) => void;
  onStartSpeech: (text: string) => void;
  onAudioVolumeChange?: (volume: number) => void;
}

export const VoicePipelineTester: React.FC<VoicePipelineTesterProps> = ({
  ttsConfig,
  sttConfig,
  onTTSChange,
  onSTTChange,
  onStartSpeech,
  onAudioVolumeChange,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testSpeechText, setTestSpeechText] = useState("Konnichiwa! I am your AI companion.");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const handleSaveSettings = () => {
    onTTSChange(ttsConfig);
    onSTTChange(sttConfig);
    try {
      const sanitizedTTS = { ...ttsConfig, openaiApiKey: "" };
      localStorage.setItem("project_waifu_tts_config", JSON.stringify(sanitizedTTS));
      localStorage.setItem("project_waifu_stt_config", JSON.stringify(sttConfig));
    } catch (err) {
      console.error("Failed to save STT/TTS config:", err);
    }
    setShowSaveSuccess(true);
    setTimeout(() => {
      setShowSaveSuccess(false);
    }, 3000);
  };

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !ttsConfig.voice) {
          const defaultVoice = voices.find((v) => v.lang.includes("ja") || v.lang.includes("en")) || voices[0];
          onTTSChange({ ...ttsConfig, voice: defaultVoice.name });
        }
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

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
                  // continue
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
                }),
              });

              const data = await response.json();
              if (data.text) {
                setTranscript(data.text);
                if (sttConfig.autoSend && data.text.trim()) {
                  onStartSpeech(data.text);
                }
              } else if (data.error) {
                alert("Audio STT: " + data.error);
              }
            } catch (err: any) {
              console.error("STT request error:", err);
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
      console.error("MediaRecorder error:", err);
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
      } else {
        alert("Microphone access error: " + (err.message || err));
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
      await startMediaRecorder();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = sttConfig.language || "en-US";

      recognition.onresult = (event: any) => {
        let currentText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscript(currentText);
        if (sttConfig.autoSend && currentText.trim()) {
          onStartSpeech(currentText);
        }
      };

      recognition.onerror = async (event: any) => {
        console.warn("Speech recognition error, trying MediaRecorder:", event.error);
        setIsListening(false);
        if (event.error !== "aborted") {
          await startMediaRecorder();
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err: any) {
      console.warn("SpeechRecognition start error, trying MediaRecorder:", err);
      await startMediaRecorder();
    }
  };

  const speakTestText = async () => {
    if (isSynthesizing) return;

    if (ttsConfig.provider === "openai") {
      setIsSynthesizing(true);
      if (onAudioVolumeChange) onAudioVolumeChange(0.2);

      const cleanText = testSpeechText.replace(/^\[(happy|blush|sad|surprised|thinking|excited)\]\s*/i, "");

      try {
        const blob = await fetchOpenAITTSAudioBlob({
          text: cleanText,
          baseUrl: ttsConfig.openaiBaseUrl || "http://localhost:8000/v1",
          apiKey: ttsConfig.openaiApiKey || "",
          model: ttsConfig.openaiModel || "kokoro",
          voice: ttsConfig.openaiVoice || "af_bella(.1)+zf_xiaoni(.9)",
          speed: ttsConfig.rate || 1.0,
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
          if (onAudioVolumeChange) onAudioVolumeChange(0);
          URL.revokeObjectURL(audioUrl);
          setIsSynthesizing(false);
        };

        audio.onplay = () => {
          onStartSpeech(testSpeechText);
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
                if (onAudioVolumeChange) onAudioVolumeChange(Math.min(1, avg / 100));
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
              if (onAudioVolumeChange) onAudioVolumeChange(Math.random() * 0.7 + 0.3);
            }, 90);
          }
        };

        audio.onended = cleanup;
        audio.onerror = (e) => {
          console.error("Audio element playback error:", e);
          cleanup();
          alert("Error playing generated TTS audio. Verify server URL and Kokoro/OpenAI parameters.");
        };

        await audio.play();
      } catch (err: any) {
        console.error("OpenAI TTS error:", err);
        setIsSynthesizing(false);
        if (onAudioVolumeChange) onAudioVolumeChange(0);
        alert(`Failed to generate TTS audio: ${err.message || err}`);
      }
      return;
    }

    // Default Web Speech API fallback
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    setIsSynthesizing(true);

    const utterance = new SpeechSynthesisUtterance(testSpeechText);
    utterance.pitch = ttsConfig.pitch;
    utterance.rate = ttsConfig.rate;
    utterance.volume = ttsConfig.volume;

    if (ttsConfig.voice) {
      const voiceObj = availableVoices.find((v) => v.name === ttsConfig.voice);
      if (voiceObj) utterance.voice = voiceObj;
    }

    let intervalId: any;
    utterance.onstart = () => {
      onStartSpeech(testSpeechText);
      intervalId = setInterval(() => {
        const fakeVol = Math.random() * 0.8 + 0.2;
        if (onAudioVolumeChange) onAudioVolumeChange(fakeVol);
      }, 100);
    };

    utterance.onend = () => {
      clearInterval(intervalId);
      if (onAudioVolumeChange) onAudioVolumeChange(0);
      setIsSynthesizing(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-400 animate-pulse" />
            <h3 className="font-bold text-base text-slate-100 font-serif italic">STT & TTS Voice Pipeline Studio</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Test Speech-to-Text input and Text-to-Speech audio output with real-time Live2D lip-sync binding.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {showSaveSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-3 py-1.5 rounded-xl animate-fade-in">
              <Check className="w-3.5 h-3.5" />
              Settings Saved!
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveSettings}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* STT (Speech-to-Text) Panel */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono flex items-center gap-2">
              <Mic className="w-4 h-4 text-violet-400" />
              1. Speech-To-Text (STT) Input
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">Web Speech API</span>
          </div>

          <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
            <button
              onClick={toggleListening}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                isListening
                  ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-lg"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20"
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isListening ? "Listening... (Click to Stop)" : "Start Voice Input"}</span>
            </button>

            <select
              value={sttConfig.language}
              onChange={(e) => onSTTChange({ ...sttConfig, language: e.target.value })}
              className="bg-slate-950 text-slate-200 text-xs border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono"
            >
              <option value="en-US">English (en-US)</option>
              <option value="ja-JP">Japanese (ja-JP)</option>
              <option value="es-ES">Spanish (es-ES)</option>
              <option value="zh-CN">Chinese (zh-CN)</option>
            </select>
          </div>

          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 min-h-[90px] text-xs text-slate-300 font-mono flex flex-col justify-between">
            <span className="text-slate-500 text-[10px]">Real-time Transcription Stream:</span>
            <p className="my-2">{transcript || <span className="text-slate-600 italic">Speak into your microphone...</span>}</p>
            {transcript && (
              <button
                onClick={() => onStartSpeech(transcript)}
                className="self-end text-[10px] bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1 rounded transition shadow"
              >
                Send to Waifu →
              </button>
            )}
          </div>
        </div>

        {/* TTS (Text-to-Speech) Panel */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-violet-400" />
              2. Text-To-Speech (TTS) Output
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {ttsConfig.provider === "openai" ? "OpenAI / Kokoro TTS Server" : "Web Speech API"}
            </span>
          </div>

          {/* Provider Tabs */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => onTTSChange({ ...ttsConfig, provider: "openai" })}
              className={`py-1.5 px-2 rounded-lg font-semibold transition ${
                ttsConfig.provider === "openai"
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              OpenAI / Kokoro Server
            </button>
            <button
              type="button"
              onClick={() => onTTSChange({ ...ttsConfig, provider: "web-speech" })}
              className={`py-1.5 px-2 rounded-lg font-semibold transition ${
                ttsConfig.provider === "web-speech"
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Web Speech API
            </button>
          </div>

          <div className="space-y-3">
            {ttsConfig.provider === "openai" ? (
              <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                {/* Server Base URL */}
                <div>
                  <label className="block text-[11px] text-slate-300 font-mono mb-1">
                    TTS Server Base URL
                  </label>
                  <input
                    type="text"
                    value={ttsConfig.openaiBaseUrl || ""}
                    onChange={(e) => onTTSChange({ ...ttsConfig, openaiBaseUrl: e.target.value })}
                    placeholder="e.g. http://localhost:8000/v1 or http://localhost:8080/v1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-500/50"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Connects to Open WebUI, Kokoro TTS fastAPI, or any OpenAI <code className="text-violet-300">/audio/speech</code> compatible endpoint.
                  </span>
                </div>

                {/* API Key & Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-300 font-mono mb-1">
                      API Key (Optional)
                    </label>
                    <input
                      type="password"
                      value={ttsConfig.openaiApiKey || ""}
                      onChange={(e) => onTTSChange({ ...ttsConfig, openaiApiKey: e.target.value })}
                      placeholder="e.g. sk-..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 font-mono mb-1">
                      TTS Model Name
                    </label>
                    <input
                      type="text"
                      value={ttsConfig.openaiModel || ""}
                      onChange={(e) => onTTSChange({ ...ttsConfig, openaiModel: e.target.value })}
                      placeholder="e.g. kokoro or tts-1"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                {/* Voice / Voice Weights string */}
                <div>
                  <label className="block text-[11px] text-slate-300 font-mono mb-1 flex items-center justify-between">
                    <span>Voice Configuration String</span>
                    <span className="text-[10px] text-violet-400 font-normal">Kokoro weight syntax supported</span>
                  </label>
                  <input
                    type="text"
                    value={ttsConfig.openaiVoice || ""}
                    onChange={(e) => onTTSChange({ ...ttsConfig, openaiVoice: e.target.value })}
                    placeholder="e.g. af_bella(.1)+zf_xiaoni(.9)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-violet-200 focus:outline-none focus:border-violet-500/50"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Accepts voice blends like <code className="text-violet-300">af_bella(.1)+zf_xiaoni(.9)</code> or standard voice IDs (<code className="text-violet-300">af_bella</code>, <code className="text-violet-300">alloy</code>).
                  </span>

                  {/* Preset Voice Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {[
                      "af_bella(.1)+zf_xiaoni(.9)",
                      "af_bella",
                      "af_sky",
                      "af_sarah",
                      "am_adam",
                      "am_michael",
                      "zf_xiaoni",
                      "alloy",
                    ].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onTTSChange({ ...ttsConfig, openaiVoice: v })}
                        className="text-[10px] bg-violet-950/60 hover:bg-violet-900/80 border border-violet-800/40 text-violet-300 px-2 py-0.5 rounded-lg font-mono transition"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Select Browser Voice</label>
                <select
                  value={ttsConfig.voice}
                  onChange={(e) => onTTSChange({ ...ttsConfig, voice: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 font-mono"
                >
                  {availableVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              {ttsConfig.provider === "web-speech" && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Pitch: {ttsConfig.pitch.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={ttsConfig.pitch}
                    onChange={(e) => onTTSChange({ ...ttsConfig, pitch: parseFloat(e.target.value) })}
                    className="w-full accent-violet-500"
                  />
                </div>
              )}

              <div className={ttsConfig.provider === "openai" ? "col-span-2" : ""}>
                <label className="block text-[11px] text-slate-400 mb-1">Speed Rate: {ttsConfig.rate.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={ttsConfig.rate}
                  onChange={(e) => onTTSChange({ ...ttsConfig, rate: parseFloat(e.target.value) })}
                  className="w-full accent-violet-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={testSpeechText}
                onChange={(e) => setTestSpeechText(e.target.value)}
                placeholder="Enter text to speak..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={speakTestText}
                disabled={isSynthesizing}
                className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-violet-500/20"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isSynthesizing ? "Synthesizing..." : "Speak"}</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Save Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80 bg-slate-950/60 p-4 rounded-xl">
        <div className="text-xs text-slate-400 font-mono">
          <span>Current Provider: </span>
          <span className="text-violet-300 font-semibold">
            {ttsConfig.provider === "openai" ? "OpenAI / Kokoro TTS Server" : "Web Speech API"}
          </span>
          {ttsConfig.openaiVoice && ttsConfig.provider === "openai" && (
            <span className="ml-2 text-slate-500">({ttsConfig.openaiVoice})</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {showSaveSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/90 border border-emerald-800/80 px-3.5 py-2 rounded-xl animate-bounce">
              <Check className="w-4 h-4 text-emerald-400" />
              Settings saved to database & local storage!
            </span>
          )}

          <button
            type="button"
            onClick={handleSaveSettings}
            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 transition shadow-lg shadow-emerald-600/25 active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save STT & TTS Configuration</span>
          </button>
        </div>
      </div>

    </div>
  );
};
