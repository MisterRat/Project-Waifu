// Copies the voice-activity-detection runtime files into public/vad/ so the app
// serves them itself (no CDN). Runs before `npm run dev` and `npm run build`.
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const vadDir = path.dirname(require.resolve("@ricky0123/vad-web/package.json"));
// The onnxruntime-web that vad-web itself resolves (nested or hoisted, depending
// on how npm laid things out): the nearest node_modules copy that has the files.
function findOrtDir() {
  let dir = vadDir;
  while (true) {
    const candidate = path.join(dir, "node_modules", "onnxruntime-web");
    if (fs.existsSync(path.join(candidate, "dist", "ort-wasm-simd-threaded.wasm"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("[vad] onnxruntime-web runtime files not found; run npm install");
}
const ortDir = findOrtDir();

const out = path.join(process.cwd(), "public", "vad");
fs.mkdirSync(out, { recursive: true });

const files = [
  [path.join(vadDir, "dist", "vad.worklet.bundle.min.js"), "vad.worklet.bundle.min.js"],
  [path.join(vadDir, "dist", "silero_vad_v5.onnx"), "silero_vad_v5.onnx"],
  [path.join(ortDir, "dist", "ort-wasm-simd-threaded.wasm"), "ort-wasm-simd-threaded.wasm"],
  [path.join(ortDir, "dist", "ort-wasm-simd-threaded.mjs"), "ort-wasm-simd-threaded.mjs"],
];
for (const [from, name] of files) {
  fs.copyFileSync(from, path.join(out, name));
}
console.log(`[vad] copied ${files.length} files to public/vad/`);
