// Hands-free conversation mode: listens through the microphone, uses the Silero
// voice-activity detector (running in the browser) to tell speech from noise and
// to decide when the user has finished a sentence, then hands the captured audio
// (16 kHz mono Float32) to the caller for transcription.
//
// The browser's own noise suppression, echo cancellation and automatic gain are
// switched on for the microphone. The caller pauses listening while she speaks
// (half-duplex), so she never hears and answers herself.

export type ListenerState = "starting" | "listening" | "hearing" | "paused" | "error";

export interface ConversationListener {
  resume: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => void;
}

export interface ConversationListenerOptions {
  onUtterance: (audio: Float32Array) => void;
  onState: (state: ListenerState) => void;
}

// Runtime files are served by this app from /vad/ (copied there at build time
// by scripts/copy-vad-assets.mjs), never from a CDN.
const ASSET_PATH = "/vad/";

export async function createConversationListener(opts: ConversationListenerOptions): Promise<ConversationListener> {
  opts.onState("starting");
  // Loaded only when conversation mode is first switched on (about 16 MB once, then cached).
  const { MicVAD } = await import("@ricky0123/vad-web");
  const vad = await MicVAD.new({
    model: "v5",
    baseAssetPath: ASSET_PATH,
    onnxWASMBasePath: ASSET_PATH,
    startOnLoad: false,
    // Speech probability thresholds recommended for Silero v5.
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    // How long a pause ends the turn, and the shortest sound that counts as speech.
    redemptionMs: 900,
    minSpeechMs: 400,
    preSpeechPadMs: 300,
    submitUserSpeechOnPause: false,
    ortConfig: (ort: any) => {
      ort.env.logLevel = "error";
      ort.env.wasm.numThreads = 1;
    },
    onSpeechRealStart: () => opts.onState("hearing"),
    onVADMisfire: () => opts.onState("listening"),
    onSpeechEnd: (audio: Float32Array) => {
      opts.onState("listening");
      opts.onUtterance(audio);
    },
  });

  let destroyed = false;
  return {
    resume: async () => {
      if (destroyed) return;
      await vad.start();
      opts.onState("listening");
    },
    pause: async () => {
      if (destroyed) return;
      await vad.pause();
      opts.onState("paused");
    },
    destroy: () => {
      destroyed = true;
      try {
        vad.destroy();
      } catch (e) {
        // already torn down
      }
    },
  };
}

/** Encode 16 kHz Float32 PCM as base64 for the STT endpoint (much smaller than a JSON number array). */
export function float32ToBase64(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// Phrases Whisper is known to invent for silence or noise. They are only treated
// as phantoms on short clips, so a real "thank you" in a longer sentence survives.
const PHANTOM_PHRASES = new Set([
  "you",
  "thank you",
  "thanks",
  "thank you very much",
  "thanks for watching",
  "thank you for watching",
  "thank you for watching please subscribe",
  "please subscribe",
  "bye",
  "bye bye",
  "so",
  "okay",
  "uh",
  "um",
  "hmm",
  "the end",
]);

/** Normalised transcript, or "" if it is empty, a bracketed noise tag, or a likely phantom. */
export function cleanTranscript(raw: string, durationSec: number): string {
  const text = String(raw || "")
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalised = text.toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  if (!normalised) return "";
  if (durationSec < 1.5 && PHANTOM_PHRASES.has(normalised)) return "";
  return text;
}
