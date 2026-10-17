// Default voice settings, used whenever nothing is saved in Voice Settings or on
// the persona. Shared by the browser and the server's TTS proxy: change them here only.

/** App-wide default Kokoro voice (also accepts blends like "af_heart(.5)+af_bella(.5)"). */
export const DEFAULT_TTS_VOICE = "af_heart";
/** Built-in Tamamo persona's voice. */
export const TAMAMO_TTS_VOICE = "af_nicole(.1)+jf_alpha(.9)";
/** OpenAI-compatible TTS model name (Kokoro-FastAPI uses "kokoro"). */
export const DEFAULT_TTS_MODEL = "kokoro";
/** Default OpenAI-compatible TTS server. */
export const DEFAULT_TTS_BASE_URL = "http://localhost:8000/v1";
