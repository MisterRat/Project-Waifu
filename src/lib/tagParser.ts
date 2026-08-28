import { EmotionType, MotionType } from "../types";

export interface ParsedTags {
  cleanText: string;
  emotions: EmotionType[];
  motions: MotionType[];
  primaryEmotion: EmotionType;
  primaryMotion: MotionType;
}

/**
  * Parses emotion and motion tags in LLM responses (e.g. [happy], [blush], [surprised], [nod], [wave], [wink], [shake])
  * Extracts tags to drive Live2D parameters & expressions and returns cleaned text for TTS speech.
  */
export function parseEmotionAndMotionTags(rawText: string, fallbackEmotion: EmotionType = "neutral"): ParsedTags {
  if (!rawText) {
    return {
      cleanText: "",
      emotions: [],
      motions: [],
      primaryEmotion: fallbackEmotion,
      primaryMotion: "none",
    };
  }

  const emotionRegex =
    /\[(angry|confused|crying|embarrassed|evil|excited|flirty|happy|sad|scared|smirk|surprised|thinking|tipsy|tired|blush|neutral|wink)\]/gi;
  const motionRegex =
    /\[(nod|wave|shake|bow|laugh|wink|check_nails|jiggle_dance|sigh_tilt|curious_glance|stretch_wave)\]/gi;

  const emotions: EmotionType[] = [];
  const motions: MotionType[] = [];

  let match: RegExpExecArray | null;

  const normalizeEmotion = (raw: string): EmotionType => {
    const lower = raw.toLowerCase();
    if (lower === "blush") return "embarrassed";
    if (lower === "wink") return "flirty";
    if (lower === "neutral") return "neutral";
    return lower as EmotionType;
  };

  const emReg = new RegExp(emotionRegex.source, "gi");
  while ((match = emReg.exec(rawText)) !== null) {
    const e = normalizeEmotion(match[1]);
    if (!emotions.includes(e)) emotions.push(e);
  }

  const moReg = new RegExp(motionRegex.source, "gi");
  while ((match = moReg.exec(rawText)) !== null) {
    const m = match[1].toLowerCase() as MotionType;
    if (!motions.includes(m)) motions.push(m);
  }

  const cleanText = rawText
    .replace(
      /\[(angry|confused|crying|embarrassed|evil|excited|flirty|happy|sad|scared|smirk|surprised|thinking|tipsy|tired|blush|neutral|nod|wave|shake|bow|laugh|wink|check_nails|jiggle_dance|sigh_tilt|curious_glance|stretch_wave)\]\s*/gi,
      ""
    )
    .trim();

  const primaryEmotion = emotions.length > 0 ? emotions[0] : fallbackEmotion;
  const primaryMotion = motions.length > 0 ? motions[0] : "none";

  return {
    cleanText,
    emotions,
    motions,
    primaryEmotion,
    primaryMotion,
  };
}
