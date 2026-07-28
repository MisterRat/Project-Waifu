export interface OpenAITTSParams {
  text: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  voice?: string;
  speed?: number;
}

export async function fetchOpenAITTSAudioBlob(params: OpenAITTSParams): Promise<Blob> {
  const {
    text,
    baseUrl = "http://localhost:8000/v1",
    apiKey = "",
    model = "kokoro",
    voice = "af_bella(.1)+zf_xiaoni(.9)",
    speed = 1.0,
  } = params;

  const cleanBaseUrl = baseUrl.trim().replace(/\/$/, "");
  let targetUrl = cleanBaseUrl;
  if (targetUrl.endsWith("/audio/speech")) {
    // ok
  } else if (targetUrl.endsWith("/v1")) {
    targetUrl = `${targetUrl}/audio/speech`;
  } else {
    targetUrl = `${targetUrl}/v1/audio/speech`;
  }

  const voiceToUse = voice && voice.trim() ? voice.trim() : "af_bella(.1)+zf_xiaoni(.9)";
  const modelToUse = model && model.trim() ? model.trim() : "kokoro";

  const isLocalhost = cleanBaseUrl.includes("localhost") || cleanBaseUrl.includes("127.0.0.1");

  // 1. If localhost / 127.0.0.1, try direct browser request first (since the user's local Kokoro runs on their machine)
  if (isLocalhost) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey && apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const directRes = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelToUse,
          input: text.trim(),
          voice: voiceToUse,
          response_format: "mp3",
          speed,
        }),
      });

      if (directRes.ok) {
        return await directRes.blob();
      }
    } catch (directErr) {
      console.warn("Direct browser fetch to local TTS failed, falling back to server proxy...", directErr);
    }
  }

  // 2. Try server proxy endpoint (/api/waifu/tts)
  try {
    const proxyRes = await fetch("/api/waifu/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        baseUrl,
        apiKey,
        model,
        voice,
        speed,
      }),
    });

    if (proxyRes.ok) {
      return await proxyRes.blob();
    }

    const errJson = await proxyRes.json().catch(() => ({}));
    throw new Error(errJson.error || `Server returned error (${proxyRes.status})`);
  } catch (proxyErr: any) {
    // 3. Fallback: direct browser fetch for non-localhost if proxy failed
    if (!isLocalhost) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey && apiKey.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        const directRes = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: modelToUse,
            input: text.trim(),
            voice: voiceToUse,
            response_format: "mp3",
            speed,
          }),
        });
        if (directRes.ok) return await directRes.blob();
      } catch (e) {
        // ignore
      }
    }

    throw new Error(
      proxyErr.message ||
        `Could not reach OpenAI TTS server at ${targetUrl}. Check your TTS Base URL and ensure Kokoro / Open WebUI is running.`
    );
  }
}
