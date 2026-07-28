import React, { useState } from "react";
import { PROJECT_OVERVIEW, MINIMAL_DEPENDENCIES, ARCHITECTURE_NODES, DEVELOPMENT_PHASES, LIVE2D_PARAM_MAPPING } from "../data/projectScopeData";
import { CheckCircle2, Clock, Cpu, Layers, Server, Sparkles, ShieldCheck, Zap } from "lucide-react";

export const ScopeViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"architecture" | "dependencies" | "roadmap" | "live2d-params">("architecture");
  const [selectedPhase, setSelectedPhase] = useState<string>("phase-1");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Scope Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold font-mono">
              Project Scoping Blueprint
            </span>
            <span className="text-slate-400 text-xs">{PROJECT_OVERVIEW.version}</span>
          </div>
          <h2 className="text-2xl font-bold font-serif italic text-slate-100">{PROJECT_OVERVIEW.title}</h2>
          <p className="text-xs text-slate-400 mt-1">{PROJECT_OVERVIEW.subtitle}</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
              activeTab === "architecture" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Architecture</span>
          </button>
          <button
            onClick={() => setActiveTab("dependencies")}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
              activeTab === "dependencies" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Minimal Dependencies</span>
          </button>
          <button
            onClick={() => setActiveTab("roadmap")}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
              activeTab === "roadmap" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Phased Roadmap</span>
          </button>
          <button
            onClick={() => setActiveTab("live2d-params")}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 ${
              activeTab === "live2d-params" ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Live2D Mapping</span>
          </button>
        </div>
      </div>

      {/* Tab Content: System Architecture */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-400" />
              Data Flow Architecture Diagram
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Browser WebGL Frontend communicates with the lightweight Python FastAPI server, which bridges OpenWebUI LLM responses and streams TTS audio with real-time lip sync.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              {ARCHITECTURE_NODES.map((node) => (
                <div key={node.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-violet-500/50 transition">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded font-mono">
                        {node.type}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-100 mb-1">{node.label}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{node.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-1">
                    {node.technologies.map((tech) => (
                      <span key={tech} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-mono">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Architectural Constraints & Standards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h4 className="font-semibold text-xs text-slate-200 mb-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Minimal Dependency Policy
              </h4>
              <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                <li>Primary goal: Keep Python environment footprint under <strong>50 MB</strong>.</li>
                <li>No heavy PyTorch/CUDA dependencies for basic deployment.</li>
                <li>Rely on Browser native Web Speech API for Speech-to-Text (0 Python dependencies).</li>
                <li>Use Microsoft Edge TTS (<code>edge-tts</code>) for zero-key high quality anime voice output.</li>
              </ul>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <h4 className="font-semibold text-xs text-slate-200 mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                OpenWebUI Protocol Compliance
              </h4>
              <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                <li>Uses standard <code>/api/chat/completions</code> OpenAI format supported by OpenWebUI.</li>
                <li>Asynchronous token streaming prevents UI blocking during model inference.</li>
                <li>Regex system prompt parser extracts emotion tags like <code>[blush]</code> to trigger Live2D motions.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Minimal Dependencies Matrix */}
      {activeTab === "dependencies" && (
        <div className="space-y-4">
          <div className="bg-violet-950/30 border border-violet-800/40 p-4 rounded-xl text-xs text-violet-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm mb-0.5 text-violet-100">Minimalist Guarantee</strong>
              Only 4 lightweight Python modules required for full production operation! Everything else relies on browser native APIs and standard HTTP.
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                  <th className="p-3 font-semibold">Package</th>
                  <th className="p-3 font-semibold">Version</th>
                  <th className="p-3 font-semibold">Purpose</th>
                  <th className="p-3 font-semibold">Why Minimal?</th>
                  <th className="p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                {MINIMAL_DEPENDENCIES.map((dep) => (
                  <tr key={dep.package} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono font-bold text-violet-300">{dep.package}</td>
                    <td className="p-3 font-mono text-slate-400">{dep.version}</td>
                    <td className="p-3 text-slate-200">{dep.purpose}</td>
                    <td className="p-3 text-slate-400">{dep.whyMinimal}</td>
                    <td className="p-3">
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">
                        Essential
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Phased Roadmap */}
      {activeTab === "roadmap" && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {DEVELOPMENT_PHASES.map((phase) => (
              <button
                key={phase.id}
                onClick={() => setSelectedPhase(phase.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                  selectedPhase === phase.id
                    ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
              >
                {phase.title.split(":")[0]}
              </button>
            ))}
          </div>

          {DEVELOPMENT_PHASES.filter((p) => p.id === selectedPhase).map((phase) => (
            <div key={phase.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100">{phase.title}</h3>
                  <p className="text-xs text-slate-400">{phase.subtitle}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-violet-300 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 font-mono">
                    Est. Duration: {phase.duration}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{phase.description}</p>

              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase mb-2">Key Deliverables:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {phase.keyDeliverables.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Live2D Parameter Cheat-Sheet */}
      {activeTab === "live2d-params" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Standard Cubism SDK parameter names bound to Python backend emotion outputs & audio lip-sync volume analyzer:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LIVE2D_PARAM_MAPPING.map((param) => (
              <div key={param.param} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs font-bold text-violet-400">{param.param}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{param.description}</div>
                </div>
                <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded">
                  {param.range}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
