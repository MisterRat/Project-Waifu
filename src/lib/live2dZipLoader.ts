import JSZip from "jszip";

export interface LoadedLive2DZip {
  modelUrl: string;
  modelName: string;
  fileCount: number;
}

const DB_NAME = "project_waifu_live2d_db";
const STORE_NAME = "zip_models";

/**
 * Global memory registry mapping root Blob URLs / IDB keys to asset path resolution maps
 */
export const zipModelRegistry = new Map<
  string,
  {
    rootBlobUrl: string;
    pathMap: Record<string, string>;
  }
>();

/**
 * Helper to normalize path strings
 */
export function normalizePath(p: string): string {
  if (!p) return "";
  let s = p.replace(/\\/g, "/");
  s = s.replace(/^\.\//, "").replace(/^\/+/, "");
  try {
    s = decodeURIComponent(s);
  } catch (e) {
    // Keep as is if decode fails
  }
  return s;
}

/**
 * Gets appropriate MIME type for Live2D model assets
 */
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "application/json";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "moc":
    case "moc3":
      return "application/octet-stream";
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

/**
 * IndexedDB helper: Save zip file ArrayBuffer
 */
export async function saveZipToIDB(id: string, fileBuffer: ArrayBuffer, fileName: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ buffer: fileBuffer, name: fileName, timestamp: Date.now() }, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB helper: Retrieve zip file ArrayBuffer
 */
export async function getZipFromIDB(id: string): Promise<{ buffer: ArrayBuffer; name: string } | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

/**
 * Robust asset resolution lookup in pathMap
 */
export function resolveAssetFromMap(targetUrl: string, pathMap: Record<string, string>): string | null {
  if (!targetUrl) return null;

  // 1. Direct match in pathMap
  if (pathMap[targetUrl]) return pathMap[targetUrl];
  if (pathMap[targetUrl.toLowerCase()]) return pathMap[targetUrl.toLowerCase()];

  // 2. If it's already one of our generated Blob URLs, return as is
  if (Object.values(pathMap).includes(targetUrl)) {
    return targetUrl;
  }

  // 3. Extract path from full URL or blob URL
  let clean = targetUrl;
  if (clean.startsWith("blob:")) {
    // Strip origin or blob prefix
    clean = clean.replace(/^blob:[^/]+\/\/[^/]+\//, "");
    clean = clean.replace(/^blob:/, "");
  } else if (clean.startsWith("http://") || clean.startsWith("https://")) {
    try {
      clean = new URL(clean).pathname;
    } catch (e) {
      // keep
    }
  }

  // 4. Normalize clean path
  const norm = normalizePath(clean);
  if (pathMap[norm]) return pathMap[norm];
  if (pathMap[norm.toLowerCase()]) return pathMap[norm.toLowerCase()];

  // 5. Try stripping leading path segments (e.g. "uuid/Hiyori/textures/tex0.png" -> "textures/tex0.png")
  const parts = norm.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const subPath = parts.slice(i).join("/");
    if (pathMap[subPath]) return pathMap[subPath];
    if (pathMap[subPath.toLowerCase()]) return pathMap[subPath.toLowerCase()];
  }

  // 6. Try filename only
  const filenameOnly = parts[parts.length - 1];
  if (filenameOnly) {
    if (pathMap[filenameOnly]) return pathMap[filenameOnly];
    if (pathMap[filenameOnly.toLowerCase()]) return pathMap[filenameOnly.toLowerCase()];
  }

  return null;
}

/**
 * Unpacks an ArrayBuffer or File containing a Live2D zip archive into Blob URLs
 */
export async function unpackZipData(
  zipData: ArrayBuffer | Blob,
  modelId?: string
): Promise<{ rootBlobUrl: string; pathMap: Record<string, string>; modelName: string; fileCount: number }> {
  const zip = await JSZip.loadAsync(zipData);

  let modelJsonPath: string | null = null;

  // Case-insensitive search for .model3.json or .model.json
  zip.forEach((relativePath, fileEntry) => {
    if (!fileEntry.dir) {
      const lower = relativePath.toLowerCase();
      if (lower.endsWith(".model3.json") || lower.endsWith(".model.json")) {
        if (!modelJsonPath || lower.endsWith(".model3.json")) {
          modelJsonPath = relativePath;
        }
      }
    }
  });

  if (!modelJsonPath) {
    throw new Error("No valid .model3.json or .model.json file found in the ZIP archive.");
  }

  const lastSlashIdx = (modelJsonPath as string).lastIndexOf("/");
  const baseFolder = lastSlashIdx !== -1 ? (modelJsonPath as string).substring(0, lastSlashIdx + 1) : "";
  const modelFilename = (modelJsonPath as string).substring(lastSlashIdx + 1);
  const modelName = modelFilename.replace(/\.(model3|model)\.json$/i, "") || "Custom Zip Model";

  const fileEntries = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const pathMap: Record<string, string> = {};

  for (const zipPath of fileEntries) {
    const entry = zip.files[zipPath];
    if (entry.dir) continue;

    let relPath = zipPath;
    if (baseFolder && zipPath.startsWith(baseFolder)) {
      relPath = zipPath.substring(baseFolder.length);
    }

    const norm = normalizePath(relPath);
    const mime = getMimeType(zipPath);
    const arrayBuffer = await entry.async("arraybuffer");
    const blob = new Blob([arrayBuffer], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    // Map under multiple keys for resilient lookup
    pathMap[norm] = blobUrl;
    pathMap[norm.toLowerCase()] = blobUrl;

    const fullZipNorm = normalizePath(zipPath);
    pathMap[fullZipNorm] = blobUrl;
    pathMap[fullZipNorm.toLowerCase()] = blobUrl;

    const filenameOnly = norm.split("/").filter(Boolean).pop();
    if (filenameOnly) {
      if (!pathMap[filenameOnly]) pathMap[filenameOnly] = blobUrl;
      if (!pathMap[filenameOnly.toLowerCase()]) pathMap[filenameOnly.toLowerCase()] = blobUrl;
    }
  }

  // Read root .model3.json
  const modelJsonEntry = zip.files[modelJsonPath];
  const modelJsonText = await modelJsonEntry.async("text");
  const rootModelBlob = new Blob([modelJsonText], { type: "application/json" });
  const rootBlobUrl = URL.createObjectURL(rootModelBlob);

  const entryData = { rootBlobUrl, pathMap };
  zipModelRegistry.set(rootBlobUrl, entryData);

  if (modelId) {
    zipModelRegistry.set(modelId, entryData);
  }

  return { rootBlobUrl, pathMap, modelName, fileCount: fileEntries.length };
}

/**
 * Main entry point to extract a zip File
 */
export async function loadLive2DFromZip(file: File, profileId?: string): Promise<LoadedLive2DZip> {
  const arrayBuffer = await file.arrayBuffer();
  const idbKey = profileId ? `idb_zip_${profileId}` : `idb_zip_custom_${Date.now()}`;

  // Save to IndexedDB for session persistence across refreshes
  try {
    await saveZipToIDB(idbKey, arrayBuffer, file.name);
  } catch (e) {
    console.warn("Could not save Live2D zip to IndexedDB:", e);
  }

  const { rootBlobUrl, modelName, fileCount } = await unpackZipData(arrayBuffer, idbKey);

  return {
    modelUrl: idbKey,
    modelName,
    fileCount,
  };
}

/**
 * Re-hydrates a zip model from IndexedDB or memory registry
 */
export async function resolveLive2DModelUrl(urlOrKey: string): Promise<{
  actualModelUrl: string;
  urlResolver: (url: string) => string;
}> {
  if (!urlOrKey) {
    return { actualModelUrl: "", urlResolver: (u) => u };
  }

  const createResolver = (pathMap: Record<string, string>) => {
    return (targetUrl: string) => {
      const resolved = resolveAssetFromMap(targetUrl, pathMap);
      if (resolved) {
        return resolved;
      }
      return targetUrl;
    };
  };

  // 1. Check in-memory zip registry directly
  if (zipModelRegistry.has(urlOrKey)) {
    const entry = zipModelRegistry.get(urlOrKey)!;
    return { actualModelUrl: entry.rootBlobUrl, urlResolver: createResolver(entry.pathMap) };
  }

  // 2. If it's an IndexedDB key (starts with idb_zip_), load from IDB
  if (urlOrKey.startsWith("idb_zip_")) {
    const idbData = await getZipFromIDB(urlOrKey);
    if (idbData && idbData.buffer) {
      const unpacked = await unpackZipData(idbData.buffer, urlOrKey);
      return { actualModelUrl: unpacked.rootBlobUrl, urlResolver: createResolver(unpacked.pathMap) };
    }
  }

  // 3. Fallback for standard HTTP / HTTPS URLs or direct blob/data URLs
  return { actualModelUrl: urlOrKey, urlResolver: (targetUrl: string) => targetUrl };
}
