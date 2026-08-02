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
export function parseEmotionAndMotionTags(rawText: string, fallbackEmotion: EmotionType = "happy"): ParsedTags {
  if (!rawText) {
    return {
      cleanText: "",
      emotions: [],
      motions: [],
      primaryEmotion: fallbackEmotion,
      primaryMotion: "none",
    };
  }

  const emotionRegex = /\[(happy|blush|sad|surprised|thinking|excited|angry|neutral|wink)\]/gi;
  const motionRegex = /\[(nod|wave|shake|bow|laugh|wink)\]/gi;

  const emotions: EmotionType[] = [];
  const motions: MotionType[] = [];

  let match: RegExpExecArray | null;

  const emReg = new RegExp(emotionRegex.source, "gi");
  while ((match = emReg.exec(rawText)) !== null) {
    const e = match[1].toLowerCase() as EmotionType;
    if (!emotions.includes(e)) emotions.push(e);
  }

  const moReg = new RegExp(motionRegex.source, "gi");
  while ((match = moReg.exec(rawText)) !== null) {
    const m = match[1].toLowerCase() as MotionType;
    if (!motions.includes(m)) motions.push(m);
  }

  const cleanText = rawText
    .replace(/\[(happy|blush|sad|surprised|thinking|excited|angry|neutral|wink|nod|wave|shake|bow|laugh)\]\s*/gi, "")
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
