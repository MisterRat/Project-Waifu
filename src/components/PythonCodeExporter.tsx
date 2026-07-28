import React, { useState } from "react";
import {
  PYTHON_MAIN_PY,
  PYTHON_REQUIREMENTS_TXT,
  PYTHON_STATIC_INDEX_HTML,
  PYTHON_README_MD,
  DOCKERFILE_TEMPLATE,
  DOCKER_COMPOSE_TEMPLATE,
} from "../data/pythonTemplates";
import { FileCode, Copy, Check, Terminal, Container } from "lucide-react";

export const PythonCodeExporter: React.FC = () => {
  type FileType = "main.py" | "requirements.txt" | "Dockerfile" | "docker-compose.yml" | "static/index.html" | "README.md";
  const [activeFile, setActiveFile] = useState<FileType>("main.py");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const getFileContent = () => {
    switch (activeFile) {
      case "main.py": return PYTHON_MAIN_PY;
      case "requirements.txt": return PYTHON_REQUIREMENTS_TXT;
      case "Dockerfile": return DOCKERFILE_TEMPLATE;
      case "docker-compose.yml": return DOCKER_COMPOSE_TEMPLATE;
      case "static/index.html": return PYTHON_STATIC_INDEX_HTML;
      case "README.md": return PYTHON_README_MD;
    }
  };

  const handleCopy = (filename: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Container className="w-5 h-5 text-violet-400" />
            <h3 className="font-bold text-base text-slate-100 font-serif italic">
              Portainer Stack & Python Code Generator
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Production-ready Docker, Portainer stack config, FastAPI codebase with OpenWebUI API bridge & Edge-TTS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy("all", `${DOCKER_COMPOSE_TEMPLATE}\n\n${DOCKERFILE_TEMPLATE}`)}
            className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-violet-500/20"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedFile === "all" ? "Copied Portainer Files!" : "Copy Portainer Stack Files"}</span>
          </button>
        </div>
      </div>

      {/* Portainer deployment banner */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 font-mono text-xs text-violet-300">
          <span className="text-slate-500">$</span>
          <span>git push origin main &amp;&amp; deploy stack in Portainer</span>
        </div>
        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
          ✓ Portainer &amp; Docker Compose Ready
        </span>
      </div>

      {/* Code File Tabs */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between overflow-x-auto gap-2">
          <div className="flex items-center gap-1">
            {(["main.py", "requirements.txt", "Dockerfile", "docker-compose.yml", "static/index.html", "README.md"] as const).map((file) => (
              <button
                key={file}
                onClick={() => setActiveFile(file)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeFile === file
                    ? "bg-violet-600 text-white font-semibold shadow-lg shadow-violet-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => handleCopy(activeFile, getFileContent())}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition flex-shrink-0"
          >
            {copiedFile === activeFile ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedFile === activeFile ? "Copied!" : "Copy File"}</span>
          </button>
        </div>

        <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[450px] leading-relaxed select-all">
          <code>{getFileContent()}</code>
        </pre>
      </div>

    </div>
  );
};
