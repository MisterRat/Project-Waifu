// Motion curves: the single source for the avatar's gestures. Project-Waifu plays
// them live (for any model), and scripts/export-model-files.ts samples the same
// functions into .motion3.json files so the Waifu Pet desktop app gets identical
// motions. Change a gesture here, then re-export.

import { MotionType } from "../types";
import { jiggleDancePose } from "./danceMotions";

export const MOTION_DURATION = 5.0;

/** One frame of a gesture. Angles in degrees; null = leave that parameter alone. */
export interface MotionPose {
  angleX: number;
  angleY: number;
  angleZ: number;
  bodyX: number;
  bodyY: number;
  bodyZ: number;
  mouthOpen: number;
  /** Only written to motion files (the live face comes from emotions). */
  mouthForm: number | null;
  cheek: number | null;
  eyeLOpen: number | null;
  eyeBallX: number | null;
  eyeBallY: number | null;
}

const rest = (): MotionPose => ({
  angleX: 0, angleY: 0, angleZ: 0, bodyX: 0, bodyY: 0, bodyZ: 0, mouthOpen: 0,
  mouthForm: null, cheek: null, eyeLOpen: null, eyeBallX: null, eyeBallY: null,
});

/** The pose of `motion` at `t` seconds into a gesture lasting `duration` seconds. */
export function motionPose(motion: MotionType, t: number, duration = MOTION_DURATION): MotionPose {
  const p = rest();
  const progress = Math.min(1, Math.max(0, t / duration));
  const pRad = progress * Math.PI;
  switch (motion) {
    case "nod":
      p.angleY = Math.sin(progress * Math.PI * 2) * 18;
      break;
    case "shake":
      p.angleX = Math.sin(progress * Math.PI * 3) * 22;
      break;
    case "wave":
      p.angleZ = Math.sin(progress * Math.PI * 2) * 16;
      p.bodyZ = Math.sin(progress * Math.PI * 2) * 8;
      break;
    case "bow":
      p.angleY = -Math.sin(pRad) * 25;
      break;
    case "laugh":
      p.angleY = Math.abs(Math.sin(progress * Math.PI * 6)) * 12;
      p.mouthOpen = 0.4;
      break;
    case "wink":
      p.eyeLOpen = progress < 0.75 ? 0 : 1;
      break;
    case "check_nails":
      p.angleX = Math.sin(pRad) * 20;
      p.angleY = -Math.sin(pRad) * 16;
      p.angleZ = -Math.sin(pRad) * 12;
      p.eyeBallX = Math.sin(pRad) * 0.8;
      p.eyeBallY = -Math.sin(pRad) * 0.8;
      break;
    case "jiggle_dance": {
      const d = jiggleDancePose(t, duration);
      p.bodyX = d.bodyX;
      p.bodyY = d.bodyY;
      p.bodyZ = d.bodyZ;
      p.angleX = d.angleX;
      p.angleY = d.angleY;
      p.angleZ = d.angleZ;
      p.mouthForm = d.mouthForm;
      p.cheek = d.cheek;
      break;
    }
    case "sigh_tilt":
      p.angleZ = Math.sin(pRad) * 18;
      p.angleY = Math.sin(pRad) * 14;
      p.mouthOpen = Math.sin(pRad) * 0.25;
      break;
    case "curious_glance":
      p.angleX = Math.sin(progress * Math.PI * 2) * 22;
      p.angleZ = Math.sin(progress * Math.PI) * 12;
      p.eyeBallX = Math.sin(progress * Math.PI * 2) * 0.85;
      break;
    case "stretch_wave":
      p.angleY = Math.sin(pRad) * 18;
      p.bodyZ = Math.sin(pRad) * 10;
      break;
    case "tilt":
      p.angleZ = Math.sin(pRad) * 14;
      p.angleY = Math.sin(pRad) * 4;
      break;
    case "tail_wag":
      // The wag itself comes from the tail engine (or the model's Tail_Wag file).
      p.angleZ = Math.sin(progress * Math.PI * 4) * 4;
      break;
  }
  return p;
}

/** File names for exported motions (the Waifu Pet derives the tag from the name). */
export const MOTION_FILE_NAMES: Record<Exclude<MotionType, "none">, string> = {
  nod: "Nod",
  wave: "Wave",
  shake: "Shake",
  bow: "Bow",
  laugh: "Laugh",
  wink: "Wink",
  check_nails: "Check_Nails",
  jiggle_dance: "Jiggle_Dance",
  sigh_tilt: "Sigh_Tilt",
  curious_glance: "Curious_Glance",
  stretch_wave: "Stretch",
  tilt: "Tilt",
  tail_wag: "Tail_Wag",
};
