import React, { useState, useEffect } from "react";
import { WaifuProfile } from "../types";
import { loadLive2DFromZip } from "../lib/live2dZipLoader";
import { Settings2, Plus, Trash2, RotateCcw, Check, Sparkles, UserCheck, Bot, Volume2, Globe, FileArchive, Upload, Loader2 } from "lucide-react";

interface PersonaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: WaifuProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onSaveProfile: (updatedProfile: WaifuProfile) => void;
  onCreateProfile: (newProfile: WaifuProfile) => void;
  onDeleteProfile: (id: string) => void;
  onResetDefaults: () => void;
}

export const PersonaEditorModal: React.FC<PersonaEditorModalProps> = ({
  isOpen,
  onClose,
  profiles,
  activeProfileId,
  onSelectProfile,
  onSaveProfile,
  onCreateProfile,
  onDeleteProfile,
  onResetDefaults,
}) => {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  interface ServerModelItem {
    id: string;
    name: string;
    modelUrl: string;
    createdAt: number;
  }

  const [formData, setFormData] = useState<WaifuProfile>(activeProfile);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipSuccessInfo, setZipSuccessInfo] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [serverModels, setServerModels] = useState<ServerModelItem[]>([]);

  const fetchServerModels = async () => {
    try {
      const res = await fetch("/api/live2d/models");
      if (res.ok) {
        const data = await res.json();
        setServerModels(data.models || []);
      }
    } catch (err) {
      console.warn("Could not fetch server models:", err);
    }
  };

  useEffect(() => {
    if (activeProfile) {
      setFormData(activeProfile);
      setIsCreatingNew(false);
      setZipSuccessInfo(null);
      setZipError(null);
    }
    if (isOpen) {
      fetchServerModels();
    }
  }, [activeProfileId, profiles, isOpen]);

  if (!isOpen) return null;

  const handleDeleteServerModel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/live2d/models/${id}`, { method: "DELETE" });
      await fetchServerModels();
    } catch (err) {
      console.error("Error deleting server model:", err);
    }
  };

  const handleZipFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingZip(true);
    setZipError(null);
    setZipSuccessInfo(null);

    try {
      // 1. Convert file to Base64
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Upload to server for disk storage in uploads/models/
      const res = await fetch("/api/live2d/upload-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, zipBase64: base64Data }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.modelUrl) {
          setFormData((prev) => ({
            ...prev,
            live2dModelUrl: data.modelUrl,
            name: isCreatingNew && prev.name === "Custom Companion" ? data.modelName : prev.name,
          }));
          setZipSuccessInfo(`Saved to server disk storage! (${data.fileCount} model files extracted)`);
          await fetchServerModels();
          return;
        }
      }

      // 3. Fallback to client-side browser IndexedDB if server endpoint was unreachable
      const result = await loadLive2DFromZip(file, formData.id);
      setFormData((prev) => ({
        ...prev,
        live2dModelUrl: result.modelUrl,
        name: isCreatingNew && prev.name === "Custom Companion" ? result.modelName : prev.name,
      }));
      setZipSuccessInfo(`Unpacked into browser storage (${result.fileCount} model assets ready)`);
    } catch (err: any) {
      console.error("ZIP loading error:", err);
      setZipError(err.message || "Failed to unpack model ZIP file.");
    } finally {
      setIsExtractingZip(false);
      e.target.value = "";
    }
  };

  const handleStartNew = () => {
    const newId = `custom_${Date.now()}`;
    const newWaifu: WaifuProfile = {
      id: newId,
      name: "Custom Companion",
      tagline: "Your Personal AI Waifu",
      personalityPrompt:
        "You are a loving anime AI companion. Keep answers short (1-3 sentences) and use emotion tags like [happy], [blush], [excited].",
      greetingMessage: "[happy] Hello master! I'm your custom AI companion. How are you feeling today?",
      live2dModelUrl: "",
      ttsVoice: "en-US-AnaNeural",
      ttsPitch: 1.2,
      ttsRate: 1.0,
      themeColor: "pink",
      isCustom: true,
      avatarIcon: "🌟",
    };
    setFormData(newWaifu);
    setIsCreatingNew(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingNew) {
      onCreateProfile(formData);
      setIsCreatingNew(false);
    } else {
      onSaveProfile(formData);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="bg-slate-950 border-b border-slate-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif italic text-slate-100">
                Waifu Persona Studio & Local Storage Manager
              </h2>
              <p className="text-xs text-slate-400">
                Configure AI personalities, prompts, Live2D avatar models, and voice settings per Waifu.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          
          {/* Left Column: Waifu Selector List */}
          <div className="p-4 bg-slate-950/50 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                Select Persona
              </span>
              <button
                onClick={handleStartNew}
                className="text-[11px] bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 px-2.5 py-1 rounded-xl font-medium flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" />
                <span>New Waifu</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId && !isCreatingNew;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setIsCreatingNew(false);
                      onSelectProfile(p.id);
                    }}
                    className={`w-full text-left p-3 rounded-2xl transition border flex items-center justify-between ${
                      isActive
                        ? "bg-violet-600/15 border-violet-500/50 text-white shadow-lg shadow-violet-500/10"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl">{p.avatarIcon || "👧"}</span>
                      <div className="truncate">
                        <div className="font-bold text-xs truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.isCustom && (
                            <span className="text-[9px] bg-violet-500/20 text-violet-300 px-1.5 py-0.2 rounded font-mono">
                              Custom
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{p.tagline}</div>
                      </div>
                    </div>
                    {isActive && <UserCheck className="w-4 h-4 text-violet-400 flex-shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800/80">
              <button
                onClick={onResetDefaults}
                className="w-full text-left p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-2 transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Reset to Factory Defaults</span>
              </button>
            </div>
          </div>

          {/* Right Column: Persona Form Editor */}
          <form onSubmit={handleFormSubmit} className="md:col-span-2 p-6 space-y-5">
            
            {savedSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs p-3 rounded-xl flex items-center gap-2 font-mono">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Waifu Profile & Settings saved to local storage!</span>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span>{isCreatingNew ? "Create New Waifu" : `Editing Persona: ${formData.name}`}</span>
              </h3>

              {!isCreatingNew && formData.isCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteProfile(formData.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1 rounded-xl flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete Persona</span>
                </button>
              )}
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Waifu Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Aoi"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tagline / Role
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  placeholder="e.g. Tsundere Scientist"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>

            {/* Personality System Prompt */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-violet-400" />
                Personality & System Prompt Instructions
              </label>
              <textarea
                rows={3}
                required
                value={formData.personalityPrompt}
                onChange={(e) => setFormData({ ...formData, personalityPrompt: e.target.value })}
                placeholder="You are Aoi, a cheerful anime AI companion..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50 leading-relaxed font-mono"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Tip: Instruct the model to begin responses with emotion tags like [happy], [blush], [sad], [thinking].
              </span>
            </div>

            {/* Initial Greeting Message */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Initial Greeting Message
              </label>
              <input
                type="text"
                required
                value={formData.greetingMessage}
                onChange={(e) => setFormData({ ...formData, greetingMessage: e.target.value })}
                placeholder="[happy] Konnichiwa! How can I assist you?"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Live2D Model Source & Local ZIP Upload */}
            <div className="space-y-2 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-violet-400" />
                  <span>Live2D Model Source (.model3.json or Local .zip)</span>
                </label>
                <label className="text-[11px] bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 px-2.5 py-1 rounded-xl cursor-pointer flex items-center gap-1.5 transition">
                  {isExtractingZip ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                  ) : (
                    <FileArchive className="w-3.5 h-3.5 text-violet-400" />
                  )}
                  <span>{isExtractingZip ? "Extracting..." : "Upload Model ZIP"}</span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleZipFileUpload}
                    className="hidden"
                    disabled={isExtractingZip}
                  />
                </label>
              </div>

              <input
                type="text"
                required
                value={formData.live2dModelUrl}
                onChange={(e) => setFormData({ ...formData, live2dModelUrl: e.target.value })}
                placeholder="https://cdn.example.com/assets/model.model3.json or blob URL"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50 font-mono"
              />

              {zipSuccessInfo && (
                <div className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 font-mono">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{zipSuccessInfo}</span>
                </div>
              )}

              {zipError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1.5 rounded-xl font-mono">
                  ⚠️ {zipError}
                </div>
              )}

              {/* Server Stored Models List */}
              {serverModels.length > 0 && (
                <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                  <span className="text-[10px] font-semibold text-slate-400 block">
                    Server-Stored Live2D Models ({serverModels.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {serverModels.map((m) => {
                      const isSelected = formData.live2dModelUrl === m.modelUrl;
                      return (
                        <div
                          key={m.id}
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              live2dModelUrl: m.modelUrl,
                              name: isCreatingNew && prev.name === "Custom Companion" ? m.name : prev.name,
                            }))
                          }
                          className={`text-[10px] font-mono px-2.5 py-1 rounded-xl border cursor-pointer flex items-center gap-2 transition ${
                            isSelected
                              ? "bg-violet-600/30 border-violet-400 text-violet-200 font-bold shadow-sm shadow-violet-500/20"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                          }`}
                        >
                          <span className="truncate max-w-[140px]">📁 {m.name}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteServerModel(m.id, e)}
                            className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition"
                            title="Delete model from server disk"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <span className="text-[10px] text-slate-500 block">
                Supports direct web URLs or local <code className="text-violet-300">.zip</code> archives containing Live2D Cubism 3/4 model files (.model3.json, .moc3, textures, motions). Extracted files are stored locally on server disk.
              </span>
            </div>

            {/* TTS Voice Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
              <div className="sm:col-span-3 font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-violet-400" />
                <span>Text-To-Speech Profile</span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Voice ID / Kokoro Blend String</label>
                <input
                  type="text"
                  value={formData.ttsVoice}
                  onChange={(e) => setFormData({ ...formData, ttsVoice: e.target.value })}
                  placeholder="af_bella(.1)+zf_xiaoni(.9)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-violet-200"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Pitch ({formData.ttsPitch})
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.05"
                  value={formData.ttsPitch}
                  onChange={(e) => setFormData({ ...formData, ttsPitch: parseFloat(e.target.value) })}
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Speed ({formData.ttsRate})
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.05"
                  value={formData.ttsRate}
                  onChange={(e) => setFormData({ ...formData, ttsRate: parseFloat(e.target.value) })}
                  className="w-full accent-violet-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-violet-500/20 transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isCreatingNew ? "Create Waifu" : "Save Changes"}</span>
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
};
