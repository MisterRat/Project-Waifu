import { EmotionType, MotionType } from "../types";

export interface ParsedTags {
  cleanText: string;
  emotions: EmotionType[];
  motions: MotionType[];
  primaryEmotion: EmotionType;
  primaryMotion: MotionType;
}

/**
 * Words a model may use inside [brackets], mapped to the avatar's emotions.
 * Models rarely stick to the exact list in the prompt ("[smiling]", "[Happy!]",
 * "[emotion: shy]"), so common variants are accepted too.
 */
const EMOTION_ALIASES: Record<string, EmotionType> = {
  neutral: "neutral", calm: "neutral", default: "neutral", normal: "neutral", idle: "neutral",
  happy: "happy", smile: "happy", smiles: "happy", smiling: "happy", cheerful: "happy", joy: "happy", joyful: "happy",
  glad: "happy", pleased: "happy", content: "happy", warm: "happy", giggle: "happy", giggles: "happy", giggling: "happy",
  playful: "happy", grin: "happy", grins: "happy", grinning: "happy", sweet: "happy", kind: "happy", gentle: "happy",
  excited: "excited", excitement: "excited", thrilled: "excited", ecstatic: "excited", enthusiastic: "excited", eager: "excited", hyper: "excited",
  flirty: "flirty", flirt: "flirty", flirting: "flirty", flirtatious: "flirty", love: "flirty", loving: "flirty",
  affectionate: "flirty", seductive: "flirty", teasing: "flirty", tease: "flirty", romantic: "flirty", wink: "flirty", winks: "flirty", winking: "flirty",
  smirk: "smirk", smirks: "smirk", smirking: "smirk", smug: "smirk", sly: "smirk", mischievous: "smirk",
  surprised: "surprised", surprise: "surprised", shocked: "surprised", shock: "surprised", astonished: "surprised", amazed: "surprised", gasp: "surprised", gasps: "surprised", wow: "surprised",
  thinking: "thinking", think: "thinking", thinks: "thinking", thoughtful: "thinking", pondering: "thinking", ponder: "thinking", curious: "thinking", hmm: "thinking", wondering: "thinking",
  confused: "confused", confusion: "confused", puzzled: "confused", unsure: "confused", uncertain: "confused", perplexed: "confused",
  embarrassed: "embarrassed", embarrassment: "embarrassed", blush: "embarrassed", blushes: "embarrassed", blushing: "embarrassed",
  shy: "embarrassed", flustered: "embarrassed", nervous: "embarrassed", bashful: "embarrassed", awkward: "embarrassed",
  tipsy: "tipsy", drunk: "tipsy", dizzy: "tipsy", silly: "tipsy",
  tired: "tired", sleepy: "tired", exhausted: "tired", yawn: "tired", yawns: "tired", yawning: "tired", bored: "tired", weary: "tired",
  sad: "sad", sadness: "sad", unhappy: "sad", upset: "sad", disappointed: "sad", lonely: "sad", sorry: "sad", pout: "sad", pouts: "sad", pouting: "sad", sulking: "sad",
  crying: "crying", cry: "crying", cries: "crying", tears: "crying", tearful: "crying", sobbing: "crying", sob: "crying", sobs: "crying", weeping: "crying",
  scared: "scared", afraid: "scared", fear: "scared", fearful: "scared", frightened: "scared", terrified: "scared", worried: "scared", anxious: "scared",
  angry: "angry", anger: "angry", mad: "angry", annoyed: "angry", irritated: "angry", furious: "angry", frustrated: "angry", grumpy: "angry", huff: "angry", huffs: "angry",
  evil: "evil", wicked: "evil", sinister: "evil", devious: "evil", menacing: "evil",
};

/** Words mapped to the avatar's motions. */
const MOTION_ALIASES: Record<string, MotionType> = {
  nod: "nod", nods: "nod", nodding: "nod",
  wave: "wave", waves: "wave", waving: "wave", hello: "wave", hi: "wave", bye: "wave", goodbye: "wave",
  shake: "shake", shakes: "shake", shaking: "shake", headshake: "shake",
  bow: "bow", bows: "bow", bowing: "bow",
  laugh: "laugh", laughs: "laugh", laughing: "laugh", chuckle: "laugh", chuckles: "laugh", haha: "laugh",
  wink: "wink", winks: "wink", winking: "wink",
  check_nails: "check_nails", nails: "check_nails",
  jiggle_dance: "jiggle_dance", dance: "jiggle_dance", dances: "jiggle_dance", dancing: "jiggle_dance", jiggle: "jiggle_dance",
  sigh_tilt: "sigh_tilt", sigh: "sigh_tilt", sighs: "sigh_tilt", sighing: "sigh_tilt", tilt: "sigh_tilt",
  curious_glance: "curious_glance", glance: "curious_glance", glances: "curious_glance", peek: "curious_glance", peeks: "curious_glance",
  stretch_wave: "stretch_wave", stretch: "stretch_wave", stretches: "stretch_wave", stretching: "stretch_wave",
};

/**
 * A bracket group up to 60 characters on one line, e.g. "[happy]", "[happy, wave]",
 * "[Emotion: shy]". A Markdown link "[text](url)" is left alone.
 */
const TAG_GROUP = /\[([^\[\]\n]{1,60})\](?!\()/g;

/** Notices the app writes itself, e.g. "[OpenAI API Error] ...". Never stripped. */
const APP_NOTICE = /^\s*\[(?:[^\]]*\b(?:error|configuration required|warning)\b[^\]]*)\]/i;

/**
 * Parses emotion and motion tags in LLM responses (e.g. [happy], [blush], [nod], [wave]).
 * Tags drive the Live2D expressions and motions; cleanText has every bracketed tag removed
 * and is what gets shown in chat and spoken by TTS.
 */
export function parseEmotionAndMotionTags(rawText: string, fallbackEmotion: EmotionType = "neutral"): ParsedTags {
  if (!rawText) {
    return { cleanText: "", emotions: [], motions: [], primaryEmotion: fallbackEmotion, primaryMotion: "none" };
  }

  if (APP_NOTICE.test(rawText)) {
    return { cleanText: rawText.trim(), emotions: [], motions: [], primaryEmotion: fallbackEmotion, primaryMotion: "none" };
  }

  const emotions: EmotionType[] = [];
  const motions: MotionType[] = [];

  for (const match of rawText.matchAll(TAG_GROUP)) {
    const inner = match[1].toLowerCase();
    // Whole-phrase match first ("check nails" -> check_nails), then word by word.
    const phrase = inner.trim().replace(/[\s-]+/g, "_");
    const words = [phrase, ...inner.split(/[^a-z_]+/).filter(Boolean)];
    for (const word of words) {
      const motion = MOTION_ALIASES[word];
      const emotion = EMOTION_ALIASES[word];
      // "wink" is both: it sets the flirty face and plays the wink motion.
      if (motion && !motions.includes(motion)) motions.push(motion);
      if (emotion && !emotions.includes(emotion)) emotions.push(emotion);
    }
  }

  const cleanText = rawText
    .replace(TAG_GROUP, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return {
    cleanText,
    emotions,
    motions,
    primaryEmotion: emotions.length > 0 ? emotions[0] : fallbackEmotion,
    primaryMotion: motions.length > 0 ? motions[0] : "none",
  };
}
