/**
 * Live2D Diagnostic Logger & Telemetry Probe
 * Provides real-time console tracing and on-screen logging for debugging
 * emotion triggers, motion dispatch, and Live2D model parameter injection.
 */

export interface Live2DLogEntry {
  timestamp: string;
  category: "admin" | "avatar" | "canvas" | "cubism" | "expression";
  message: string;
  data?: any;
}

type LogListener = (entry: Live2DLogEntry) => void;
const listeners: Set<LogListener> = new Set();
const logHistory: Live2DLogEntry[] = [];

export function subscribeLive2DLogs(fn: LogListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLive2DLogHistory(): Live2DLogEntry[] {
  return [...logHistory];
}

export function logLive2DDiagnostic(
  category: Live2DLogEntry["category"],
  message: string,
  data?: any
) {
  const timestamp = new Date().toISOString().substring(11, 23);
  const entry: Live2DLogEntry = { timestamp, category, message, data };
  
  logHistory.push(entry);
  if (logHistory.length > 200) {
    logHistory.shift();
  }

  // Also print directly to browser DevTools console with clean styling
  const styleMap: Record<string, string> = {
    admin: "background: #ec4899; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
    avatar: "background: #8b5cf6; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
    canvas: "background: #06b6d4; color: black; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
    cubism: "background: #10b981; color: black; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
    expression: "background: #f59e0b; color: black; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
  };

  const badgeStyle = styleMap[category] || "background: #64748b; color: white;";
  if (data !== undefined) {
    console.log(`%c[Live2D-${category.toUpperCase()}]%c ${timestamp} ${message}`, badgeStyle, "color: inherit;", data);
  } else {
    console.log(`%c[Live2D-${category.toUpperCase()}]%c ${timestamp} ${message}`, badgeStyle, "color: inherit;");
  }

  listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch (e) {}
  });
}
