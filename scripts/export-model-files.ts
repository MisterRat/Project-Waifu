// Exports Project-Waifu's motions and emotion faces as standard Live2D files, so
// other apps (the Waifu Pet desktop app) play exactly the same motions and faces.
//
//   npx tsx scripts/export-model-files.ts <model folder> [--register] [--overwrite]
//
// - Motions/<Name>.motion3.json for every gesture in src/lib/motionCurves.ts
// - <Emotion>.exp3.json for every emotion the model has no face file for, built
//   from src/lib/emotionFaces.ts
// Only parameters the model actually has (from its .cdi3.json) are written.
// Existing files are never replaced unless --overwrite is given.
// --register also lists the files in the model's .model3.json (Project-Waifu's
// server-side models need that; the Waifu Pet discovers loose files by itself).

import fs from "fs";
import path from "path";
import { motionPose, MOTION_DURATION, MOTION_FILE_NAMES, MotionPose } from "../src/lib/motionCurves";
import { emotionFace, EmotionFace } from "../src/lib/emotionFaces";
import { EMOTION_TYPES, EmotionType, MotionType } from "../src/types";

const args = process.argv.slice(2);
const modelDir = args.find((a) => !a.startsWith("--"));
const register = args.includes("--register");
const facesOnly = args.includes("--faces-only");
const overwrite = args.includes("--overwrite");
if (!modelDir) {
  console.error("usage: npx tsx scripts/export-model-files.ts <model folder> [--register] [--overwrite]");
  process.exit(1);
}

const model3Name = fs.readdirSync(modelDir).find((f) => f.endsWith(".model3.json"));
if (!model3Name) throw new Error(`No .model3.json in ${modelDir}`);
const model3Path = path.join(modelDir, model3Name);
const model3 = JSON.parse(fs.readFileSync(model3Path, "utf-8"));
const cdiFile = model3.FileReferences?.DisplayInfo;
if (!cdiFile) throw new Error("The model has no .cdi3.json (DisplayInfo); can't tell which parameters it has.");
const cdi = JSON.parse(fs.readFileSync(path.join(modelDir, cdiFile), "utf-8"));
const paramNames = new Map<string, string>(cdi.Parameters.map((p: any) => [p.Id, String(p.Name || "")]));
const has = (id: string) => paramNames.has(id);

const written: string[] = [];
const skipped: string[] = [];
const writeJson = (rel: string, data: unknown) => {
  const full = path.join(modelDir, rel);
  if (fs.existsSync(full) && !overwrite) {
    skipped.push(rel);
    return;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, "\t") + "\n");
  written.push(rel);
};

// ---------------------------------------------------------------------------
// Motions
// ---------------------------------------------------------------------------
const FPS = 30;
const MOTION_PARAMS: [keyof MotionPose, string][] = [
  ["angleX", "ParamAngleX"],
  ["angleY", "ParamAngleY"],
  ["angleZ", "ParamAngleZ"],
  ["bodyX", "ParamBodyAngleX"],
  ["bodyY", "ParamBodyAngleY"],
  ["bodyZ", "ParamBodyAngleZ"],
  ["mouthOpen", "ParamMouthOpenY"],
  ["mouthForm", "ParamMouthForm"],
  ["cheek", "ParamCheek"],
  ["eyeLOpen", "ParamEyeLOpen"],
  ["eyeBallX", "ParamEyeBallX"],
  ["eyeBallY", "ParamEyeBallY"],
];
const round = (v: number) => Math.round(v * 1000) / 1000;

// Gestures whose file has its own length (the jiggle dance runs 4 s).
const FILE_DURATION: Partial<Record<MotionType, number>> = { jiggle_dance: 4 };
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",") : null;

const motionFiles: Record<string, string> = {};
for (const [motion, fileBase] of Object.entries(MOTION_FILE_NAMES) as [Exclude<MotionType, "none">, string][]) {
  if (facesOnly) break;
  if (only && !only.includes(motion)) continue;
  const duration = FILE_DURATION[motion] ?? MOTION_DURATION;
  const frames = Math.round(duration * FPS);
  const samples: MotionPose[] = [];
  for (let i = 0; i <= frames; i++) samples.push(motionPose(motion, i / FPS, duration));

  const curves: { Target: string; Id: string; Segments: number[] }[] = [];
  let segmentCount = 0;
  let pointCount = 0;
  for (const [key, id] of MOTION_PARAMS) {
    if (!has(id)) continue;
    const values = samples.map((s) => s[key] as number | null);
    if (values.every((v) => v === null)) continue;
    if (values.every((v) => v === 0)) continue;
    const segs: number[] = [];
    values.forEach((v, i) => {
      const t = round(i / FPS);
      const val = round(v ?? (key === "eyeLOpen" ? 1 : 0));
      if (i === 0) segs.push(t, val);
      else segs.push(0, t, val); // 0 = linear segment
    });
    curves.push({ Target: "Parameter", Id: id, Segments: segs });
    segmentCount += values.length - 1;
    pointCount += values.length;
  }
  if (curves.length === 0) continue;

  const rel = `Motions/${fileBase}.motion3.json`;
  motionFiles[motion] = rel;
  writeJson(rel, {
    Version: 3,
    Meta: {
      Duration: duration,
      Fps: FPS,
      FadeInTime: 0.3,
      FadeOutTime: 0.5,
      Loop: false,
      AreBeziersRestricted: true,
      CurveCount: curves.length,
      TotalSegmentCount: segmentCount,
      TotalPointCount: pointCount,
      UserDataCount: 0,
      TotalUserDataSize: 0,
    },
    Curves: curves,
  });
}

// ---------------------------------------------------------------------------
// Expressions (only for emotions the model has no face file for)
// ---------------------------------------------------------------------------
type FaceKey = keyof EmotionFace;
interface FaceParam {
  key: FaceKey;
  ids: string[];
  /** Model-specific parameters are only used when the model names them like this (cdi3 Name). */
  name?: RegExp;
  /** Eyes "open" are added relative to fully open, so blinking still works. */
  relativeToOne?: boolean;
  add?: boolean;
}
const FACE_PARAMS: FaceParam[] = [
  { key: "mouthForm", ids: ["ParamMouthForm"] },
  { key: "cheekBlush", ids: ["ParamCheek"] },
  { key: "cheekPuff", ids: ["CheekPuff"] },
  { key: "eyeLOpen", ids: ["ParamEyeLOpen"], relativeToOne: true },
  { key: "eyeROpen", ids: ["ParamEyeROpen"], relativeToOne: true },
  { key: "eyeLSmile", ids: ["ParamEyeLSmile"] },
  { key: "eyeRSmile", ids: ["ParamEyeRSmile"] },
  { key: "eyeBallForm", ids: ["ParamEyeBallForm"] },
  { key: "eyeBallX", ids: ["ParamEyeBallX"], add: true },
  { key: "eyeBallY", ids: ["ParamEyeBallY"], add: true },
  { key: "browLY", ids: ["ParamBrowLY"] },
  { key: "browRY", ids: ["ParamBrowRY"] },
  { key: "browLX", ids: ["ParamBrowLX"] },
  { key: "browRX", ids: ["ParamBrowRX"] },
  { key: "browLAngle", ids: ["ParamBrowLAngle"] },
  { key: "browRAngle", ids: ["ParamBrowRAngle"] },
  { key: "browLForm", ids: ["ParamBrowLForm"] },
  { key: "browRForm", ids: ["ParamBrowRForm"] },
  { key: "emotionMouthShrug", ids: ["MouthShrug"] },
  { key: "emotionMouthFunnel", ids: ["MouthFunnel"] },
  { key: "emotionMouthPucker", ids: ["MouthPucker"] },
  { key: "emotionMouthX", ids: ["MouthX"] },
  { key: "emotionTear", ids: ["ParamTear"] },
  { key: "emotionQuestionMark", ids: ["ParamQuestionMark", "ParamQuestion", "ParamHatena"] },
  { key: "emotionSweat", ids: ["ParamSweat", "ParamAse"] },
  { key: "emotionAnger", ids: ["ParamAnger", "ParamAngry", "ParamIkari", "ParamVein"] },
  { key: "emotionHeartEyes", ids: ["ParamHeartEyes", "ParamHeartEye", "ParamHeart"] },
  { key: "emotionStarEyes", ids: ["ParamStarEyes", "ParamStarEye", "ParamKira"] },
  { key: "emotionExclamation", ids: ["ParamExclamation", "ParamBikkuri", "ParamShock"] },
  { key: "emotionDarkFace", ids: ["ParamDarkFace", "ParamShadow"] },
  // Tamamo-style marks and ears: generic ids, so only when the model names them so.
  { key: "emotionParam2", ids: ["Param2"], name: /^sad$/i },
  { key: "emotionParam3", ids: ["Param3"], name: /^angry$/i },
  { key: "emotionParam4", ids: ["Param4"], name: /^happy$/i },
  { key: "emotionEarRotation", ids: ["Param34"], name: /ear rotation/i },
  { key: "emotionEarInOut", ids: ["Param35"], name: /ear in out/i },
  { key: "emotionEar1", ids: ["Param36"], name: /^ear 1$/i },
  { key: "emotionEar2", ids: ["Param37"], name: /^ear 2$/i },
  { key: "emotionEar3", ids: ["Param38"], name: /^ear 3$/i },
];

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const existingExpr = fs.readdirSync(modelDir).filter((f) => f.endsWith(".exp3.json"));
const existingNames = existingExpr.map((f) => letters(f.replace(/\.exp3\.json$/, "")));
// Tolerate small spelling differences (e.g. a file named "Embarrased").
const hasFaceFor = (emotion: string) => existingNames.some((n) => n === emotion || editDistance(n, emotion) <= 2);

const generatedExpr: string[] = [];
for (const { id: emotion } of EMOTION_TYPES as { id: EmotionType }[]) {
  if (emotion === "neutral" || hasFaceFor(emotion)) continue;
  const face = emotionFace(emotion);
  const parameters: { Id: string; Value: number; Blend: string }[] = [];
  for (const fp of FACE_PARAMS) {
    const raw = face[fp.key] as number;
    const value = fp.relativeToOne ? raw - 1 : raw;
    if (!Number.isFinite(value) || Math.abs(value) < 1e-6) continue;
    for (const id of fp.ids) {
      if (!has(id)) continue;
      if (fp.name && !fp.name.test(paramNames.get(id) || "")) continue;
      parameters.push({ Id: id, Value: round(value), Blend: fp.relativeToOne || fp.add ? "Add" : "Overwrite" });
    }
  }
  if (parameters.length === 0) continue;
  const fileName = `${emotion[0].toUpperCase()}${emotion.slice(1)}.exp3.json`;
  writeJson(fileName, { Type: "Live2D Expression", IsModelCustomizationExpression: false, Parameters: parameters });
  generatedExpr.push(fileName);
}

// ---------------------------------------------------------------------------
// Register the files in .model3.json (for Project-Waifu's server-side models)
// ---------------------------------------------------------------------------
if (register) {
  const refs = (model3.FileReferences = model3.FileReferences || {});
  // Every motion file in Motions/: Idle_* loops form the "Idle" group (played whenever
  // nothing else is), every other file is a gesture named like Project-Waifu's tags.
  const motions: Record<string, { File: string; FadeInTime?: number; FadeOutTime?: number }[]> = {};
  const fileToGroup = new Map(Object.entries(MOTION_FILE_NAMES).map(([g, f]) => [f.toLowerCase(), g]));
  const motionDir = path.join(modelDir, "Motions");
  const motionList = fs.existsSync(motionDir) ? fs.readdirSync(motionDir).filter((f) => f.endsWith(".motion3.json")).sort() : [];
  for (const f of motionList) {
    const base = f.replace(/\.motion3\.json$/, "");
    const rel = `Motions/${f}`;
    if (/^idle_/i.test(base)) {
      (motions.Idle = motions.Idle || []).push({ File: rel });
    } else {
      const group = fileToGroup.get(base.toLowerCase()) || base.toLowerCase();
      motions[group] = [{ File: rel, FadeInTime: 0.3, FadeOutTime: 0.5 }];
    }
  }
  refs.Motions = motions;
  Object.assign(motionFiles, Object.fromEntries(Object.entries(motions).map(([g, d]) => [g, d[0].File])));
  const expressions: { Name: string; File: string }[] = (refs.Expressions = refs.Expressions || []);
  for (const file of fs.readdirSync(modelDir).filter((f) => f.endsWith(".exp3.json"))) {
    if (!expressions.some((e) => e.File === file)) {
      expressions.push({ Name: letters(file.replace(/\.exp3\.json$/, "")), File: file });
    }
  }
  fs.writeFileSync(model3Path, JSON.stringify(model3, null, "\t") + "\n");
  written.push(`${model3Name} (registered ${Object.keys(motionFiles).length} motions, ${expressions.length} expressions)`);
}

console.log(`Model: ${model3Name}`);
console.log(`Written (${written.length}):\n  ${written.join("\n  ") || "-"}`);
if (skipped.length) console.log(`Already present, left as is (${skipped.length}):\n  ${skipped.join("\n  ")}`);
console.log(`Generated faces: ${generatedExpr.join(", ") || "none needed"}`);
