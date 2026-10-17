// Emotion face recipes: the single source for how each emotion looks. Project-Waifu
// applies them live (for any model); scripts/export-model-files.ts turns the same
// values into .exp3.json files for models that lack a face for an emotion, so the
// Waifu Pet desktop app shows the same faces. Moved here unchanged from Live2DAvatar.

import { EmotionType } from "../types";

export function emotionFace(emotion: EmotionType) {
  let mouthForm = 0;
  let cheekBlush = 0;
  let cheekPuff = 0;
  let browLY = 0;
  let browRY = 0;
  let browLX = 0;
  let browRX = 0;
  let browLAngle = 0;
  let browRAngle = 0;
  let browLForm = 0;
  let browRForm = 0;
  let eyeLOpen = 1.0;
  let eyeROpen = 1.0;
  let eyeLSmile = 0;
  let eyeRSmile = 0;
  let eyeBallForm = 0;
  let eyeBallX = 0;
  let eyeBallY = 0;
  let emotionTear = 0;
  let emotionQuestionMark = 0;
  let emotionExclamation = 0;
  let emotionSweat = 0;
  let emotionAnger = 0;
  let emotionHeartEyes = 0;
  let emotionStarEyes = 0;
  let emotionDarkFace = 0;
  let emotionParam2 = 0; // Model-specific Sad mark
  let emotionParam3 = 0; // Model-specific Angry mark
  let emotionParam4 = 0; // Model-specific Happy mark
  let emotionEarRotation = 0;
  let emotionEarInOut = 0;
  let emotionEar1 = 0;
  let emotionEar2 = 0;
  let emotionEar3 = 0;
  let emotionTailWag = 1.0;
  let emotionMouthShrug = 0;
  let emotionMouthFunnel = 0;
  let emotionMouthPucker = 0;
  let emotionMouthX = 0;

  switch (emotion) {
    case "happy":
      mouthForm = 1.0;
      cheekBlush = 0.5;
      browLY = 0.4;
      browRY = 0.4;
      browLAngle = 0.15;
      browRAngle = 0.15;
      browLForm = 0.4;
      browRForm = 0.4;
      eyeLOpen = 0.0; // Eyes smiling closed, works with non-blend-shape
      eyeROpen = 0.0;
      eyeLSmile = 1.0;
      eyeRSmile = 1.0;
      eyeBallForm = 0.4;
      emotionParam4 = 1.0; // Tamamo Happy mark
      emotionEarRotation = -0.3;
      emotionEar1 = 0.4;
      emotionTailWag = 2.0;
      break;
    case "excited":
      mouthForm = 1.0;
      cheekBlush = 0.85;
      eyeLOpen = 1.3;
      eyeROpen = 1.3;
      eyeLSmile = 0.85;
      eyeRSmile = 0.85;
      eyeBallForm = 0.5;
      browLY = 0.7;
      browRY = 0.7;
      browLAngle = 0.2;
      browRAngle = 0.2;
      browLForm = 0.5;
      browRForm = 0.5;
      emotionStarEyes = 0.9;
      emotionParam4 = 1.0;
      emotionEarRotation = -0.5;
      emotionEar1 = 0.6;
      emotionTailWag = 2.5;
      break;
    case "flirty":
      mouthForm = 0.85;
      cheekBlush = 0.75;
      eyeLOpen = 0.0; // Winking eye
      eyeROpen = 1.0;
      eyeLSmile = 1.0;
      eyeRSmile = 0.85;
      eyeBallForm = 0.4;
      browLY = 0.35;
      browRY = 0.15;
      browLAngle = 0.25;
      browRAngle = 0.1;
      browLForm = 0.3;
      browRForm = 0.3;
      emotionHeartEyes = 1.0;
      emotionParam4 = 0.7;
      emotionEarRotation = 0.2;
      emotionTailWag = 1.5;
      break;
    case "smirk":
      mouthForm = 0.8;
      emotionMouthX = 0.3;
      cheekBlush = 0.2;
      eyeLOpen = 0.8;
      eyeROpen = 0.65;
      eyeLSmile = 0.6;
      eyeRSmile = 0.3;
      eyeBallForm = -0.2;
      browLY = 0.5;
      browRY = -0.3;
      browLAngle = 0.35;
      browRAngle = -0.2;
      browLForm = 0.2;
      browRForm = -0.2;
      emotionEarRotation = 0.3;
      emotionEarInOut = -0.2;
      emotionTailWag = 1.2;
      break;
    case "surprised":
      mouthForm = 0.0;
      emotionMouthFunnel = 0.6;
      cheekBlush = 0.1;
      eyeLOpen = 1.45;
      eyeROpen = 1.45;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.4;
      browLY = 0.9;
      browRY = 0.9;
      browLAngle = 0.0;
      browRAngle = 0.0;
      emotionExclamation = 1.0;
      emotionEarRotation = -0.6;
      emotionEar1 = 0.7;
      emotionTailWag = 0.5;
      break;
    case "thinking":
      mouthForm = 0.1;
      emotionMouthPucker = 0.3;
      cheekBlush = 0.1;
      eyeLOpen = 0.85;
      eyeROpen = 0.85;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = 0.0;
      eyeBallX = 0.4;
      eyeBallY = 0.45;
      browLY = 0.65;
      browRY = -0.35;
      browLAngle = 0.3;
      browRAngle = -0.2;
      browLForm = 0.1;
      browRForm = -0.2;
      emotionQuestionMark = 0.7;
      emotionEarRotation = 0.4;
      emotionEarInOut = -0.3;
      emotionTailWag = 0.8;
      break;
    case "confused":
      mouthForm = -0.25;
      emotionMouthShrug = 0.6;
      cheekBlush = 0.15;
      eyeLOpen = 1.15;
      eyeROpen = 0.75;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.2;
      browLY = 0.6;
      browRY = -0.5;
      browLAngle = -0.3;
      browRAngle = 0.4;
      browLForm = -0.2;
      browRForm = 0.2;
      emotionQuestionMark = 1.0; // Confused Question Mark Emote!
      emotionSweat = 0.35;
      emotionEarRotation = 0.45;
      emotionEarInOut = -0.4;
      emotionTailWag = 0.7;
      break;
    case "embarrassed":
      mouthForm = -0.3;
      cheekBlush = 1.0;
      cheekPuff = 0.5;
      eyeLOpen = 0.65;
      eyeROpen = 0.65;
      eyeLSmile = 0.6;
      eyeRSmile = 0.6;
      eyeBallForm = 0.2;
      eyeBallY = -0.35;
      browLY = -0.4;
      browRY = -0.4;
      browLAngle = -0.5;
      browRAngle = -0.5;
      browLForm = -0.4;
      browRForm = -0.4;
      emotionSweat = 0.6;
      emotionParam4 = 0.5;
      emotionEarRotation = 0.5;
      emotionEarInOut = 0.3;
      emotionTailWag = 1.6;
      break;
    case "tipsy":
      mouthForm = 0.6;
      cheekBlush = 0.95;
      cheekPuff = 0.3;
      eyeLOpen = 0.6;
      eyeROpen = 0.65;
      eyeLSmile = 0.7;
      eyeRSmile = 0.7;
      eyeBallForm = 0.3;
      browLY = -0.2;
      browRY = 0.1;
      browLAngle = -0.3;
      browRAngle = -0.3;
      browLForm = -0.3;
      browRForm = -0.3;
      emotionParam4 = 0.6;
      emotionEarRotation = 0.3;
      emotionTailWag = 1.4;
      break;
    case "tired":
      mouthForm = -0.4;
      cheekBlush = 0.0;
      eyeLOpen = 0.35;
      eyeROpen = 0.35;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.3;
      browLY = -0.45;
      browRY = -0.45;
      browLAngle = -0.4;
      browRAngle = -0.4;
      browLForm = -0.3;
      browRForm = -0.3;
      emotionSweat = 0.2;
      emotionEarRotation = 0.5;
      emotionEarInOut = 0.4;
      emotionTailWag = 0.3;
      break;
    case "sad":
      mouthForm = -1.0;
      cheekBlush = 0.0;
      eyeLOpen = 0.75;
      eyeROpen = 0.75;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.4;
      browLY = -0.7;
      browRY = -0.7;
      browLAngle = -0.6;
      browRAngle = -0.6;
      browLForm = -0.6;
      browRForm = -0.6;
      emotionTear = 1.0;
      emotionParam2 = 1.0; // Tamamo Sad Tear mark
      emotionEarRotation = 0.55;
      emotionEarInOut = 0.35;
      emotionTailWag = 0.4;
      break;
    case "crying":
      mouthForm = -0.95;
      cheekBlush = 0.6;
      eyeLOpen = 0.35;
      eyeROpen = 0.35;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.6;
      browLY = -0.85;
      browRY = -0.85;
      browLAngle = -0.8;
      browRAngle = -0.8;
      browLForm = -0.7;
      browRForm = -0.7;
      emotionTear = 1.0;
      emotionParam2 = 1.0; // Tamamo Sad Tear mark
      emotionEarRotation = 0.6;
      emotionEarInOut = 0.4;
      emotionTailWag = 0.3;
      break;
    case "scared":
      mouthForm = -0.6;
      cheekBlush = 0.0;
      eyeLOpen = 1.45;
      eyeROpen = 1.45;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.7;
      browLY = 0.85;
      browRY = 0.85;
      browLAngle = -0.65;
      browRAngle = -0.65;
      browLForm = -0.5;
      browRForm = -0.5;
      emotionSweat = 0.85;
      emotionTear = 0.3;
      emotionEarRotation = 0.6;
      emotionEarInOut = 0.5;
      emotionTailWag = 0.2;
      break;
    case "angry":
      mouthForm = -0.85;
      cheekBlush = 0.0;
      eyeLOpen = 0.85;
      eyeROpen = 0.85;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = -0.5;
      browLY = -0.85;
      browRY = -0.85;
      browLAngle = 0.8;
      browRAngle = 0.8;
      browLForm = -0.6;
      browRForm = -0.6;
      emotionAnger = 1.0;
      emotionParam3 = 1.0; // Tamamo Angry mark
      emotionEarRotation = 0.65;
      emotionEarInOut = -0.4;
      emotionTailWag = 1.8;
      break;
    case "evil":
      mouthForm = 0.75;
      cheekBlush = 0.0;
      eyeLOpen = 0.7;
      eyeROpen = 0.7;
      eyeLSmile = 0.3;
      eyeRSmile = 0.3;
      eyeBallForm = -0.4;
      browLY = -0.7;
      browRY = -0.7;
      browLAngle = 0.85;
      browRAngle = 0.85;
      browLForm = -0.5;
      browRForm = -0.5;
      emotionAnger = 0.4;
      emotionDarkFace = 0.8;
      emotionParam3 = 0.7;
      emotionEarRotation = 0.5;
      emotionTailWag = 1.3;
      break;
    default:
      mouthForm = 0.0;
      cheekBlush = 0.0;
      eyeLOpen = 1.0;
      eyeROpen = 1.0;
      eyeLSmile = 0.0;
      eyeRSmile = 0.0;
      eyeBallForm = 0.0;
      browLY = 0.0;
      browRY = 0.0;
      browLAngle = 0.0;
      browRAngle = 0.0;
      browLForm = 0.0;
      browRForm = 0.0;
      emotionTear = 0.0;
      emotionTailWag = 1.0;
      break;
  }

  return {
    mouthForm,
    cheekBlush,
    cheekPuff,
    browLY,
    browRY,
    browLX,
    browRX,
    browLAngle,
    browRAngle,
    browLForm,
    browRForm,
    eyeLOpen,
    eyeROpen,
    eyeLSmile,
    eyeRSmile,
    eyeBallForm,
    eyeBallX,
    eyeBallY,
    emotionTear,
    emotionQuestionMark,
    emotionExclamation,
    emotionSweat,
    emotionAnger,
    emotionHeartEyes,
    emotionStarEyes,
    emotionDarkFace,
    emotionParam2,
    emotionParam3,
    emotionParam4,
    emotionEarRotation,
    emotionEarInOut,
    emotionEar1,
    emotionEar2,
    emotionEar3,
    emotionTailWag,
    emotionMouthShrug,
    emotionMouthFunnel,
    emotionMouthPucker,
    emotionMouthX,
  };
}

export type EmotionFace = ReturnType<typeof emotionFace>;
