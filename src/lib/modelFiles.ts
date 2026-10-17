// Loose model files: .exp3.json faces and .motion3.json motions that sit next to a model but are
// not declared in its model3.json. The Waifu Pet discovers these the same way, so both apps use a
// model's own files whenever they are present (the files are the authority).
//
// waifu-faces.json (optional, next to the model3.json) lets the owner tune faces without touching
// the rigger's files:
//   { "skip": ["Crying"], "map": { "crying": "Sad" } }
//   skip: face files (by name, without .exp3.json) that are never used
//   map:  emotion -> face file name to use for it
import { MOTION_FILE_NAMES } from "./motionCurves";

export interface FacesConfig {
  skip: string[];
  map: Record<string, string>;
}

export interface ModelFileList {
  files: string[];
  faces: FacesConfig | null;
}

export const faceFileName = (file: string) =>
  String(file || "").split("/").pop()!.replace(/\.(exp3|exp|motion3)\.json$/i, "");

/** Motion group a loose motion file plays under: "Idle" for Idle_*, else the gesture's name. */
export function motionGroupForFile(file: string, idleGroup: string): string {
  const base = faceFileName(file);
  if (/^idle/i.test(base)) return idleGroup;
  const gesture = Object.entries(MOTION_FILE_NAMES).find(([, name]) => name.toLowerCase() === base.toLowerCase());
  return gesture ? gesture[0] : base.toLowerCase();
}

/** Clean a parsed waifu-faces.json (anything malformed is dropped). */
export function parseFacesConfig(raw: any): FacesConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const ok = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;
  return {
    skip: (Array.isArray(raw.skip) ? raw.skip : []).filter(ok),
    map: Object.fromEntries(
      Object.entries(raw.map && typeof raw.map === "object" ? raw.map : {}).filter(([k, v]) => ok(k) && ok(v))
    ) as Record<string, string>,
  };
}

/** File list for a model stored on this server (/models/<id>/...), or null for any other URL. */
export async function fetchStoredModelFiles(modelUrl: string): Promise<ModelFileList | null> {
  let pathname: string;
  try {
    const u = new URL(modelUrl, window.location.href);
    if (u.origin !== window.location.origin) return null;
    pathname = u.pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/models/")) return null;
  try {
    const res = await fetch(`/api/live2d/model-files?url=${encodeURIComponent(pathname)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { files: Array.isArray(data.files) ? data.files : [], faces: parseFacesConfig(data.faces) };
  } catch {
    return null;
  }
}

/**
 * Register loose files with the model's managers (declared ones are kept as they are) and drop
 * skipped faces, so they can never play. Returns what was added.
 */
export function registerModelFiles(model: any, list: ModelFileList): { faces: number; motions: number; skipped: string[] } {
  const im = model?.internalModel;
  const mm = im?.motionManager;
  const out = { faces: 0, motions: 0, skipped: [] as string[] };
  if (!mm) return out;
  const skip = new Set((list.faces?.skip || []).map((s) => s.toLowerCase()));

  // Faces
  const exprFiles = list.files.filter((f) => /\.exp3\.json$/i.test(f));
  if (exprFiles.length && !mm.expressionManager) {
    // The library only builds an expression manager when model3.json declares expressions.
    const Ctor = (window as any).PIXI?.live2d?.Cubism4ExpressionManager;
    try {
      if (Ctor && im.settings) mm.expressionManager = new Ctor(im.settings, {});
    } catch (e) {}
  }
  const exprMgr = mm.expressionManager;
  if (exprMgr) {
    const defs: any[] = Array.isArray(exprMgr.definitions) ? exprMgr.definitions.slice() : [];
    for (const file of exprFiles) {
      const name = faceFileName(file);
      const known = defs.some(
        (d) => String(d.Name || d.name || "").toLowerCase() === name.toLowerCase() || faceFileName(d.File || d.file) === name
      );
      if (!known) {
        defs.push({ Name: name, name, File: file, file });
        out.faces++;
      }
    }
    const kept = defs.filter((d) => {
      const name = String(d.Name || d.name || faceFileName(d.File || d.file));
      const drop = skip.has(name.toLowerCase()) || skip.has(faceFileName(d.File || d.file).toLowerCase());
      if (drop) out.skipped.push(name);
      return !drop;
    });
    exprMgr.definitions = kept;
    if (Array.isArray(exprMgr.expressions)) exprMgr.expressions = [];
  }

  // Motions
  const idleGroup: string = mm.groups?.idle || "Idle";
  const declared = new Set<string>();
  for (const defs of Object.values(mm.definitions || {}) as any[][]) {
    for (const d of defs || []) declared.add(String(d?.File || d?.file || "").toLowerCase());
  }
  if (!mm.definitions) mm.definitions = {};
  if (!mm.motionGroups) mm.motionGroups = {};
  for (const file of list.files.filter((f) => /\.motion3\.json$/i.test(f)).sort()) {
    if (declared.has(file.toLowerCase())) continue;
    const group = motionGroupForFile(file, idleGroup);
    mm.definitions[group] = [...(mm.definitions[group] || []), { File: file }];
    if (!mm.motionGroups[group]) mm.motionGroups[group] = [];
    out.motions++;
  }
  return out;
}

/** The face file to use for an emotion according to waifu-faces.json, if it names one. */
export function mappedFace(faces: FacesConfig | null | undefined, emotion: string): string | null {
  if (!faces) return null;
  const hit = Object.entries(faces.map).find(([k]) => k.toLowerCase() === emotion.toLowerCase());
  return hit ? hit[1] : null;
}
