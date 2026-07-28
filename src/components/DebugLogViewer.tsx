import React, { useRef, useEffect } from "react";
import { Terminal } from "lucide-react";

interface DebugLogViewerProps {
  logs: string[];
}

export const DebugLogViewer: React.FC<DebugLogViewerProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 h-[600px] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-green-400" />
            <h3 className="font-bold text-base text-slate-100 font-serif italic">
              Live2D WebGL Debug Logs
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Realtime debugging output for PIXI and Live2D model loading sequences.
          </p>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex-1 flex flex-col">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2">
           <span className="text-xs text-slate-400 font-mono">console output</span>
        </div>
        <div 
          ref={scrollRef}
          className="p-4 text-xs font-mono text-green-400 overflow-y-auto overflow-x-auto flex-1 leading-relaxed whitespace-pre-wrap select-all"
        >
          {logs.length === 0 ? (
             <span className="text-slate-600">Waiting for logs...</span>
          ) : (
             logs.map((log, i) => (
               <div key={i} className="mb-1">{log}</div>
             ))
          )}
        </div>
      </div>
    </div>
  );
};
