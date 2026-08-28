import React, { useState } from "react";
import { OpenWebUIConfig } from "../types";
import { Server, Key, Bot, Play, CheckCircle2, AlertCircle, RefreshCw, Radio, Save, Power, ShieldCheck } from "lucide-react";

interface OpenWebUITesterProps {
  config: OpenWebUIConfig;
  onChange: (config: OpenWebUIConfig) => void;
}

export const OpenWebUITester: React.FC<OpenWebUITesterProps> = ({ config, onChange }) => {
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [testPrompt, setTestPrompt] = useState("Konnichiwa! Introduce yourself in 2 sentences.");
  const [testResponse, setTestResponse] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isConfigValid = config.enabled !== false && Boolean(config.baseUrl?.trim()) && Boolean(config.model?.trim());

  const handleManualSave = () => {
    onChange({ ...config });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus("idle");
    setStatusMessage("Connecting to OpenWebUI API endpoint...");

    try {
      const res = await fetch("/api/openwebui/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          endpoint: "/models",
          method: "GET",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reach OpenWebUI");
      }

      setConnectionStatus("success");
      setStatusMessage("Successfully connected to OpenWebUI!");

      if (data.data && Array.isArray(data.data)) {
        const modelsList = data.data.map((m: any) => m.id || m.name);
        setFetchedModels(modelsList);
        if (modelsList.length > 0 && !config.model) {
          onChange({ ...config, model: modelsList[0] });
        }
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setStatusMessage(err.message || "Connection failed. Check server URL.");
    } finally {
      setTesting(false);
    }
  };

  const handleSendPrompt = async () => {
    setTesting(true);
    setTestResponse("Generating response from OpenWebUI model...");

    try {
      const res = await fetch("/api/openwebui/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          endpoint: "/chat/completions",
          method: "POST",
          body: {
            model: config.model || "llama3",
            messages: [
              { role: "system", content: config.systemPrompt },
              { role: "user", content: testPrompt },
            ],
            temperature: 0.8,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "OpenWebUI model returned an error");
      }

      const reply = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      setTestResponse(reply);
    } catch (err: any) {
      setTestResponse(`[Error] ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-6 w-full max-w-full overflow-hidden">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-400 animate-pulse" />
            <h3 className="font-bold text-base text-slate-100 font-serif italic">OpenAI API (OpenWebUI / Ollama) Configuration & Persistence</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure any local or remote OpenAI-compatible API endpoint (OpenWebUI, Ollama, LM Studio, or OpenAI). Settings are saved automatically to browser storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Mode Badge */}
          {isConfigValid ? (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              OpenAI / OpenWebUI Active (Gemini Bypass)
            </span>
          ) : (
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 font-mono">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Gemini Fallback (OpenAI / OpenWebUI Unconfigured)
            </span>
          )}

          {/* Toggle Button */}
          <button
            type="button"
            onClick={() => onChange({ ...config, enabled: !config.enabled })}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
              config.enabled !== false
                ? "bg-violet-600/30 text-violet-200 border-violet-500/50 hover:bg-violet-600/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Power className={`w-3.5 h-3.5 ${config.enabled !== false ? "text-violet-400" : "text-slate-500"}`} />
            <span>{config.enabled !== false ? "Enabled" : "Disabled"}</span>
          </button>
        </div>
      </div>

      {/* Settings Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-violet-400" />
            Base OpenAI / OpenWebUI Server URL
          </label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
            placeholder="http://localhost:3000/api"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50 font-mono"
          />
          <span className="text-[10px] text-slate-500 mt-1 block font-mono">Default: http://localhost:3000/api or http://localhost:8080</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-violet-400" />
            API Key (Optional)
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            placeholder="Bearer sk-..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            Target Model Name
          </label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            placeholder="llama3, mistral, or waifu-v1"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50 font-mono"
          />
        </div>

      </div>

      {/* Action Buttons & Persistence Control */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-violet-400 ${testing ? "animate-spin" : ""}`} />
            <span>Test Endpoint Connection</span>
          </button>

          <button
            onClick={handleManualSave}
            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-violet-500/20"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>

          {saveSuccess && (
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved to storage!
            </span>
          )}

          {fetchedModels.length > 0 && (
            <select
              value={config.model}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
              className="bg-slate-900 text-slate-200 text-xs border border-slate-700 rounded-xl px-3 py-2 font-mono"
            >
              {fetchedModels.map((m) => (
                <option key={m} value={m}>
                  Model: {m}
                </option>
              ))}
            </select>
          )}
        </div>

        {statusMessage && (
          <div
            className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
              connectionStatus === "success"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                : connectionStatus === "error"
                ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}
          >
            {connectionStatus === "error" ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Policy Notice Box */}
      <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-violet-400" />
          <span>Strict OpenAI-Compatible API Priority Enforcement</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          When valid OpenAI / OpenWebUI settings are present (Base URL & Model defined) and enabled, Project Waifu exclusively routes all live companion prompts through your OpenAI-compatible endpoint (OpenWebUI, Ollama, OpenAI) and strictly avoids invoking Gemini directly.
        </p>
      </div>

      {/* Live Test Bench */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-widest font-mono">Test Prompt Execution</h4>

        <div className="flex gap-2">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500/50"
          />
          <button
            onClick={handleSendPrompt}
            disabled={testing}
            className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-lg shadow-violet-500/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Send Test</span>
          </button>
        </div>

        {testResponse && (
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs font-mono text-violet-200 overflow-x-auto whitespace-pre-wrap">
            {testResponse}
          </div>
        )}
      </div>

    </div>
  );
};
