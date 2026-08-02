import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { pipeline, env } from "@xenova/transformers";
import {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getAllUsers,
  getUserCount,
  createAuthToken,
  verifyAuthToken,
  createSession,
  getUserBySession,
  deleteSession,
  getUserSettings,
  saveUserSettings,
  getSmtpConfig,
  saveSmtpConfig,
  setUserPin,
  saveLive2dZip,
  getAllLive2dZips,
  deleteLive2dZip,
} from "./server/db.js";
import {
  sendMagicLinkEmail,
  sendAdminPendingUserNotification,
  testSmtpConnection,
} from "./server/mailer.js";

// Configure Transformers.js for Node runtime
env.allowLocalModels = false;
env.useBrowserCache = false;

let whisperPipeline: any = null;
let whisperLoadingPromise: Promise<any> | null = null;

let appVersion = "0.2.0";
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));
  if (pkg.version) appVersion = pkg.version;
} catch (e) {}

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline;
  if (whisperLoadingPromise) return await whisperLoadingPromise;

  whisperLoadingPromise = (async () => {
    try {
      console.log("Loading local server Whisper STT model (Xenova/whisper-tiny)...");
      const pipe = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      whisperPipeline = pipe;
      console.log("Local Whisper model loaded successfully!");
      return pipe;
    } catch (err) {
      console.error("Failed to load local Whisper model:", err);
      whisperLoadingPromise = null;
      throw err;
    }
  })();

  return await whisperLoadingPromise;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: appVersion, message: "Project Waifu Server Running" });
  });

  // Auth helper middleware
  const getCurrentUser = async (req: express.Request, res?: express.Response) => {
    const sessionId = req.cookies?.waifu_session || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (sessionId) {
      const user = await getUserBySession(sessionId);
      if (user) return user;
      if (res) {
        res.clearCookie("waifu_session", { path: "/", sameSite: "lax" });
      }
    }
    return null;
  };

  // GET /api/auth/me
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getCurrentUser(req, res);
      const userCount = await getUserCount();
      const settings = user ? await getUserSettings(user.id) : null;
      return res.json({
        user,
        settings,
        userCount,
        version: appVersion,
      });
    } catch (err: any) {
      console.error("Auth /me error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Rate limiting map for magic link requests
  const lastMagicLinkRequest = new Map<string, number>();

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !email.trim() || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email address is required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const now = Date.now();
      const lastTime = lastMagicLinkRequest.get(cleanEmail) || 0;
      if (now - lastTime < 60000) {
        const remainingSeconds = Math.ceil((60000 - (now - lastTime)) / 1000);
        return res.status(429).json({ error: `Please wait ${remainingSeconds}s before requesting another Magic Link (once a minute limit).` });
      }
      lastMagicLinkRequest.set(cleanEmail, now);

      let user = await getUserByEmail(cleanEmail);
      const count = await getUserCount();
      const isFirst = count === 0;

      if (user) {
        if (user.status === "pending") {
          return res.json({
            status: "pending",
            message: "Account registration is pending approval by the Administrator.",
          });
        }
        if (user.status === "rejected") {
          return res.status(403).json({ error: "Account registration was not approved." });
        }
        // If already approved, issue magic link directly
        const { token: magicToken } = await createAuthToken(user.id, "magic_link");
        const isAdmin = user.role === "admin";
        let pinToken: string | undefined = undefined;
        if (isAdmin) {
          const pinRes = await createAuthToken(user.id, "pin");
          pinToken = pinRes.token;
        }
        const appUrl = `${req.protocol}://${req.get("host")}`;
        const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

        const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl, pinToken);

        return res.json({
          status: "approved",
          message: mailRes.sent 
            ? (isAdmin ? "Magic Link and PIN sent to your email (and available below)." : "Magic Link sent to your email (and available below).")
            : (isAdmin ? "Magic Link and PIN generated." : "Magic Link generated."),
          magicLink: magicLinkUrl,
          pin: pinToken || null,
        });
      }

      // Create new user (First user automatically approved as admin)
      const role = isFirst ? "admin" : "user";
      const status = isFirst ? "approved" : "pending";
      user = await createUser(cleanEmail, role, status);

      if (status === "approved") {
        const { token: magicToken } = await createAuthToken(user.id, "magic_link");
        const isAdmin = user.role === "admin";
        let pinToken: string | undefined = undefined;
        if (isAdmin) {
          const pinRes = await createAuthToken(user.id, "pin");
          pinToken = pinRes.token;
        }
        const appUrl = `${req.protocol}://${req.get("host")}`;
        const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

        const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl, pinToken);

        return res.json({
          status: "approved",
          isFirstUser: true,
          message: isAdmin ? "Account created as Administrator! Magic link and PIN generated." : "Account created! Magic link generated.",
          magicLink: magicLinkUrl,
          pin: pinToken || null,
        });
      } else {
        const appUrl = `${req.protocol}://${req.get("host")}`;
        await sendAdminPendingUserNotification(cleanEmail, appUrl);

        return res.json({
          status: "pending",
          isFirstUser: false,
          message: "Registration submitted! An Administrator will review your account request.",
        });
      }
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: "Email is required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const now = Date.now();
      const lastTime = lastMagicLinkRequest.get(cleanEmail) || 0;
      if (now - lastTime < 60000) {
        const remainingSeconds = Math.ceil((60000 - (now - lastTime)) / 1000);
        return res.status(429).json({ error: `Please wait ${remainingSeconds}s before requesting another Magic Link (once a minute limit).` });
      }
      lastMagicLinkRequest.set(cleanEmail, now);

      const user = await getUserByEmail(cleanEmail);

      if (!user) {
        return res.status(404).json({ error: "No account found for this email. Please register first." });
      }

      if (user.status === "pending") {
        return res.status(403).json({ error: "Your account is pending approval by the Administrator." });
      }

      if (user.status === "rejected") {
        return res.status(403).json({ error: "Your account request was declined." });
      }

      const { token: magicToken } = await createAuthToken(user.id, "magic_link");
      const isAdmin = user.role === "admin";
      let pinToken: string | undefined = undefined;
      if (isAdmin) {
        const pinRes = await createAuthToken(user.id, "pin");
        pinToken = pinRes.token;
      }
      const appUrl = `${req.protocol}://${req.get("host")}`;
      const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

      const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl, pinToken);

      return res.json({
        message: mailRes.sent 
          ? (isAdmin ? "Magic link and PIN sent to your email (and available below)!" : "Magic link sent to your email (and available below)!")
          : (isAdmin ? "Magic link and PIN generated." : "Magic link generated."),
        magicLink: magicLinkUrl,
        pin: pinToken || null,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/verify
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || !token.trim()) {
        return res.status(400).json({ error: "Login token or PIN is required." });
      }

      const tokenObj = await verifyAuthToken(token.trim());
      if (!tokenObj) {
        return res.status(400).json({ error: "Invalid or expired login token / PIN." });
      }

      const user = await getUserById(tokenObj.user_id);
      if (!user || user.status !== "approved") {
        return res.status(403).json({ error: "User account is not active or approved." });
      }

      const session = await createSession(user.id);
      res.cookie("waifu_session", session.sessionId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });

      const settings = await getUserSettings(user.id);

      return res.json({
        user,
        settings,
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      console.error("Verify error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/owner-pin
  app.post("/api/auth/owner-pin", async (req, res) => {
    try {
      const { email, pin } = req.body;
      if (!email || !pin || pin.trim().length < 4) {
        return res.status(400).json({ error: "Valid email and PIN (at least 4 characters) are required." });
      }
      let user = await getUserByEmail(email);
      if (!user) {
        user = await createUser(email, "admin", "approved", pin.trim());
      } else {
        await updateUserRole(user.id, "admin");
        await setUserPin(user.id, pin.trim());
      }
      const session = await createSession(user.id);
      res.cookie("waifu_session", session.sessionId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });
      const settings = await getUserSettings(user.id);
      const updatedUser = await getUserById(user.id);
      return res.json({ status: "ok", message: "System Owner PIN saved successfully!", user: updatedUser, settings });
    } catch (err: any) {
      console.error("Owner PIN error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/owner-pin-login
  app.post("/api/auth/owner-pin-login", async (req, res) => {
    try {
      const { email, pin } = req.body;
      if (!email || !pin) {
        return res.status(400).json({ error: "Email and PIN are required." });
      }
      const cleanEmail = email.trim().toLowerCase();
      let user = await getUserByEmail(cleanEmail);
      if (!user) {
        user = await createUser(cleanEmail, "admin", "approved", pin.trim());
      } else {
        if (user.role !== "admin") {
          await updateUserRole(user.id, "admin");
        }
        if (!user.pin) {
          await setUserPin(user.id, pin.trim());
        } else if (user.pin !== pin.trim()) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return res.status(401).json({ error: "Incorrect System Owner PIN. Paused for 10 seconds." });
        }
      }
      const session = await createSession(user.id);
      res.cookie("waifu_session", session.sessionId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });
      const settings = await getUserSettings(user.id);
      const updatedUser = await getUserById(user.id);
      return res.json({ status: "ok", user: updatedUser, settings });
    } catch (err: any) {
      console.error("Owner PIN login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionId = req.cookies?.waifu_session;
      if (sessionId) {
        await deleteSession(sessionId);
      }
      res.clearCookie("waifu_session", { path: "/", sameSite: "lax" });
      return res.json({ status: "ok" });
    } catch (err: any) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/user/settings
  app.get("/api/user/settings", async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
      }
      const settings = await getUserSettings(user.id);
      return res.json({ settings });
    } catch (err: any) {
      console.error("Get user settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/user/settings
  app.post("/api/user/settings", async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
      }
      const { activeProfileId, waifuProfiles, ttsConfig, sttConfig, openwebuiConfig } = req.body;
      await saveUserSettings(user.id, {
        activeProfileId,
        waifuProfiles,
        ttsConfig,
        sttConfig,
        openwebuiConfig,
      });
      return res.json({ status: "ok", message: "User settings saved to server." });
    } catch (err: any) {
      console.error("Save user settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin APIs
  app.get("/api/admin/users", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const users = await getAllUsers();
      return res.json({ users });
    } catch (err: any) {
      console.error("Admin list users error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/approve", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const { id } = req.params;
      const targetUser = await getUserById(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found." });
      }

      await updateUserStatus(id, "approved");

      const { token: magicToken } = await createAuthToken(id, "magic_link");
      const isAdmin = targetUser.role === "admin";
      let pinToken: string | undefined = undefined;
      if (isAdmin) {
        const pinRes = await createAuthToken(id, "pin");
        pinToken = pinRes.token;
      }
      const appUrl = `${req.protocol}://${req.get("host")}`;
      const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

      const mailRes = await sendMagicLinkEmail(targetUser.email, magicLinkUrl, pinToken);

      return res.json({
        status: "ok",
        message: `User ${targetUser.email} approved.`,
        magicLink: magicLinkUrl,
        pin: pinToken || null,
      });
    } catch (err: any) {
      console.error("Approve user error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/reject", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const { id } = req.params;
      await updateUserStatus(id, "rejected");
      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const { id } = req.params;
      if (currentUser.id === id) {
        return res.status(400).json({ error: "You cannot delete your own admin account." });
      }
      await deleteUser(id);
      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/role", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const { id } = req.params;
      const { role } = req.body;
      if (role !== "admin" && role !== "user") {
        return res.status(400).json({ error: "Invalid role." });
      }
      await updateUserRole(id, role);
      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/smtp", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const smtp = await getSmtpConfig();
      if (!smtp) {
        return res.json({
          smtp: {
            host: "",
            port: 587,
            secure: false,
            authUser: "",
            authPass: "",
            fromEmail: "",
            adminEmail: currentUser.email,
          },
        });
      }
      return res.json({
        smtp: {
          ...smtp,
          authPass: smtp.authPass ? "••••••••" : "",
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/smtp", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const { host, port, secure, authUser, authPass, fromEmail, adminEmail } = req.body;

      const existing = await getSmtpConfig();
      const finalPass = authPass === "••••••••" ? (existing?.authPass || "") : authPass;

      await saveSmtpConfig({
        host: host || "",
        port: Number(port) || 587,
        secure: Boolean(secure),
        authUser: authUser || "",
        authPass: finalPass || "",
        fromEmail: fromEmail || "",
        adminEmail: adminEmail || currentUser.email,
      });

      return res.json({ status: "ok", message: "SMTP configuration saved." });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/smtp/test", async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      const smtp = await getSmtpConfig();
      if (!smtp || !smtp.host) {
        return res.status(400).json({ error: "SMTP server host is not configured." });
      }
      await testSmtpConnection(smtp);
      return res.json({ status: "ok", message: "Test email successfully sent to " + (smtp.adminEmail || currentUser.email) });
    } catch (err: any) {
      return res.status(500).json({ error: "SMTP test failed: " + err.message });
    }
  });

  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const MODELS_DIR = path.join(DATA_DIR, "models");

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  // Auto-extract assets/kei_en.zip if present and model3.json not yet extracted
  const defaultKeiZipPath = path.join(process.cwd(), "assets", "kei_en.zip");
  const keiFolderPath = path.join(MODELS_DIR, "kei");
  const modelJsonCheckPath = path.join(keiFolderPath, "kei_basic_free", "runtime", "kei_basic_free.model3.json");
  if (fs.existsSync(defaultKeiZipPath) && !fs.existsSync(modelJsonCheckPath)) {
    try {
      console.log("[Project Waifu] Extracting default Kei model from assets/kei_en.zip...");
      const zipBuffer = fs.readFileSync(defaultKeiZipPath);
      const zip = await JSZip.loadAsync(zipBuffer);
      fs.mkdirSync(keiFolderPath, { recursive: true });
      const zipKeys = Object.keys(zip.files);
      for (const key of zipKeys) {
        const entry = zip.files[key];
        if (entry.dir) continue;
        const outPath = path.join(keiFolderPath, key);
        const parentDir = path.dirname(outPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        const contentBuffer = await entry.async("nodebuffer");
        fs.writeFileSync(outPath, contentBuffer);
      }
      console.log("[Project Waifu] Successfully extracted default Kei model!");
    } catch (err) {
      console.error("[Project Waifu] Failed to extract kei_en.zip:", err);
    }
  }

  // Restore all models stored in SQLite database zips if not present on disk
  try {
    const savedZips = await getAllLive2dZips();
    for (const z of savedZips) {
      const modelFolderPath = path.join(MODELS_DIR, z.modelId);
      const checkModelJson = (dir: string): boolean => {
        if (!fs.existsSync(dir)) return false;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (checkModelJson(full)) return true;
          } else if (entry.isFile()) {
            const lower = entry.name.toLowerCase();
            if (lower.endsWith(".model3.json") || lower.endsWith(".model.json")) return true;
          }
        }
        return false;
      };

      if (!checkModelJson(modelFolderPath)) {
        console.log(`[Project Waifu] Restoring Live2D model "${z.name}" (${z.modelId}) from SQLite database zip...`);
        const buffer = Buffer.from(z.zipBase64, "base64");
        const zip = await JSZip.loadAsync(buffer);
        fs.mkdirSync(modelFolderPath, { recursive: true });
        const zipKeys = Object.keys(zip.files);
        for (const key of zipKeys) {
          const entry = zip.files[key];
          if (entry.dir) continue;
          const outPath = path.join(modelFolderPath, key);
          const parentDir = path.dirname(outPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          const contentBuffer = await entry.async("nodebuffer");
          fs.writeFileSync(outPath, contentBuffer);
        }
      }
    }
  } catch (err) {
    console.error("[Project Waifu] Failed to restore Live2D zips from SQLite:", err);
  }

  // Serve models directory statically with CORS headers and appropriate MIME types
  app.use(
    "/models",
    express.static(MODELS_DIR, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (filePath.endsWith(".moc") || filePath.endsWith(".moc3")) {
          res.setHeader("Content-Type", "application/octet-stream");
        } else if (filePath.endsWith(".model3.json") || filePath.endsWith(".model.json")) {
          res.setHeader("Content-Type", "application/json");
        }
      },
    })
  );

  // GET /api/live2d/models - List all server-stored Live2D models
  app.get("/api/live2d/models", async (_req, res) => {
    try {
      if (!fs.existsSync(MODELS_DIR)) {
        return res.json({ models: [] });
      }
      const folders = fs.readdirSync(MODELS_DIR).filter((f) => {
        const full = path.join(MODELS_DIR, f);
        return fs.statSync(full).isDirectory();
      });

      const result = [];
      for (const folder of folders) {
        const folderPath = path.join(MODELS_DIR, folder);
        const findModelJson = (dir: string, baseDir: string): string | null => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = findModelJson(fullPath, baseDir);
              if (found) return found;
            } else if (entry.isFile()) {
              const lower = entry.name.toLowerCase();
              if (lower.endsWith(".model3.json") || lower.endsWith(".model.json")) {
                return path.relative(baseDir, fullPath).replace(/\\/g, "/");
              }
            }
          }
          return null;
        };

        const relModelPath = findModelJson(folderPath, folderPath);
        if (relModelPath) {
          const filename = path.basename(relModelPath);
          const name = filename.replace(/\.(model3|model)\.json$/i, "");
          const stat = fs.statSync(folderPath);
          result.push({
            id: folder,
            name,
            modelUrl: `/models/${folder}/${relModelPath}`,
            createdAt: stat.birthtimeMs || stat.ctimeMs,
          });
        }
      }

      return res.json({ models: result });
    } catch (err: any) {
      console.error("Error listing Live2D models:", err);
      return res.status(500).json({ error: "Failed to list Live2D models", details: err.message });
    }
  });

  // POST /api/live2d/upload-zip - Unpack & store Live2D zip archive directly on server disk
  app.post("/api/live2d/upload-zip", async (req, res) => {
    try {
      const { filename, zipBase64 } = req.body;
      if (!zipBase64) {
        return res.status(400).json({ error: "Missing zipBase64 data in request body" });
      }

      const cleanBase64 = zipBase64.replace(/^data:.*?;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");

      const zip = await JSZip.loadAsync(buffer);

      const modelId = `model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const modelFolderPath = path.join(MODELS_DIR, modelId);
      fs.mkdirSync(modelFolderPath, { recursive: true });

      let modelJsonPath: string | null = null;
      let fileCount = 0;

      const zipKeys = Object.keys(zip.files);
      for (const key of zipKeys) {
        const entry = zip.files[key];
        if (entry.dir) continue;
        const lower = key.toLowerCase();
        if (lower.endsWith(".model3.json") || lower.endsWith(".model.json")) {
          if (!modelJsonPath || lower.endsWith(".model3.json")) {
            modelJsonPath = key;
          }
        }
      }

      if (!modelJsonPath) {
        fs.rmSync(modelFolderPath, { recursive: true, force: true });
        return res.status(400).json({
          error: "No valid .model3.json or .model.json file found in the uploaded ZIP archive.",
        });
      }

      for (const key of zipKeys) {
        const entry = zip.files[key];
        if (entry.dir) continue;

        const outPath = path.join(modelFolderPath, key);
        const parentDir = path.dirname(outPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        const contentBuffer = await entry.async("nodebuffer");
        fs.writeFileSync(outPath, contentBuffer);
        fileCount++;
      }

      const relModelPath = modelJsonPath.replace(/\\/g, "/");
      const modelFilename = path.basename(relModelPath);
      const modelName = modelFilename.replace(/\.(model3|model)\.json$/i, "");
      const modelUrl = `/models/${modelId}/${relModelPath}`;

      // Save zip file data into SQLite database for persistent deployment/redeploy safety
      await saveLive2dZip(modelId, modelName, cleanBase64);

      console.log(`[Project Waifu] Live2D Zip extracted successfully to ${modelFolderPath} -> ${modelUrl}`);
      return res.json({
        success: true,
        modelId,
        modelName,
        modelUrl,
        fileCount,
      });
    } catch (err: any) {
      console.error("Error extracting Live2D zip on server:", err);
      return res.status(500).json({
        error: "Failed to extract and save Live2D ZIP file on server",
        details: err.message,
      });
    }
  });

  // DELETE /api/live2d/models/:id - Remove a server-stored model folder
  app.delete("/api/live2d/models/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
        return res.status(400).json({ error: "Invalid model ID" });
      }
      const targetPath = path.join(MODELS_DIR, id);
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      await deleteLive2dZip(id);
      return res.json({ success: true, message: `Model ${id} deleted` });
    } catch (err: any) {
      console.error("Error deleting Live2D model:", err);
      return res.status(500).json({ error: "Failed to delete model", details: err.message });
    }
  });

  // OpenWebUI / OpenAI API Proxy Endpoint to handle CORS
  app.post("/api/openwebui/proxy", async (req, res) => {
    try {
      const { baseUrl, apiKey, endpoint, method = "POST", body } = req.body;
      if (!baseUrl) {
        return res.status(400).json({ error: "baseUrl is required" });
      }

      const targetUrl = `${baseUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (body && (method === "POST" || method === "PUT")) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          error: `OpenWebUI API error (${response.status})`,
          details: data,
        });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("OpenWebUI Proxy Error:", err);
      return res.status(500).json({
        error: "Failed to connect to OpenWebUI server. Ensure the URL is accessible.",
        details: err.message,
      });
    }
  });

  // Speech-to-Text Endpoint with built-in Local Whisper STT + OpenWebUI / Gemini fallbacks
  app.post("/api/waifu/stt", async (req, res) => {
    try {
      const { pcmFloat32, audioBase64, mimeType = "audio/webm", language = "en-US", openWebUIConfig } = req.body;

      if ((!pcmFloat32 || !pcmFloat32.length) && !audioBase64) {
        return res.status(400).json({ error: "No audio PCM data or audio base64 provided" });
      }

      // 1. Built-in Local Server Whisper STT (No external keys/APIs needed!)
      if (pcmFloat32 && Array.isArray(pcmFloat32) && pcmFloat32.length > 0) {
        try {
          const audioData = new Float32Array(pcmFloat32);
          const pipe = await getWhisperPipeline();
          const langCode = language ? language.split("-")[0].toLowerCase() : "english";
          
          const result = await pipe(audioData, {
            language: langCode === "en" ? "english" : langCode === "ja" ? "japanese" : langCode,
            task: "transcribe",
          });

          if (result && result.text) {
            const text = result.text.trim();
            console.log("[Local Whisper STT Success]:", text);
            return res.json({ text });
          }
        } catch (whisperErr: any) {
          console.error("Local Whisper STT processing error:", whisperErr?.message || whisperErr);
        }
      }

      // 2. OpenWebUI API (/audio/transcriptions) if configured and audioBase64 present
      if (openWebUIConfig && openWebUIConfig.baseUrl && audioBase64) {
        try {
          const targetUrl = `${openWebUIConfig.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
          const audioBuffer = Buffer.from(audioBase64, "base64");
          const formData = new FormData();
          const fileBlob = new Blob([audioBuffer], { type: mimeType });
          formData.append("file", fileBlob, "speech.webm");
          formData.append("model", "whisper-1");

          const headers: Record<string, string> = {};
          if (openWebUIConfig.apiKey) {
            headers["Authorization"] = `Bearer ${openWebUIConfig.apiKey}`;
          }

          const owuRes = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: formData,
          });

          if (owuRes.ok) {
            const owuData = await owuRes.json();
            if (owuData.text) {
              return res.json({ text: owuData.text.trim() });
            }
          } else {
            const errText = await owuRes.text();
            console.warn(`OpenWebUI STT returned status ${owuRes.status}:`, errText);
          }
        } catch (owuErr: any) {
          console.error("OpenWebUI STT connection error:", owuErr?.message || owuErr);
        }
      }

      // 3. Fallback to Gemini API if key exists and previous methods failed
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && audioBase64) {
        const ai = new GoogleGenAI({ apiKey });
        const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
        let lastError: any = null;

        for (const model of modelsToTry) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBase64,
                    },
                  },
                  `Transcribe the spoken audio accurately in language '${language}'. Output ONLY the transcribed plain text and nothing else. Do not add quotes, markdown, or extra formatting.`,
                ],
              });

              const text = response.text ? response.text.trim() : "";
              if (text) {
                return res.json({ text });
              }
            } catch (geminiErr: any) {
              lastError = geminiErr;
              const is429 = geminiErr?.status === 429 || String(geminiErr?.message).includes("429") || String(geminiErr?.message).includes("RESOURCE_EXHAUSTED");
              if (is429 && attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 3500));
                continue;
              }
              console.warn(`Gemini STT model ${model} failed (attempt ${attempt + 1}):`, geminiErr?.message || geminiErr);
              break;
            }
          }
        }
      }

      return res.status(400).json({
        error: "Audio transcription failed. Ensure your microphone was enabled and recorded clear speech.",
      });
    } catch (err: any) {
      console.error("STT API Error:", err);
      return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // OpenAI-compatible Text-To-Speech Endpoint (for Kokoro, Open WebUI, or OpenAI TTS)
  app.post("/api/waifu/tts", async (req, res) => {
    try {
      const { text, baseUrl, apiKey, model, voice, speed } = req.body;
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "No text provided for TTS" });
      }

      const cleanBaseUrl = (baseUrl || "http://localhost:8000/v1").trim().replace(/\/$/, "");
      let targetUrl = cleanBaseUrl;
      if (targetUrl.endsWith("/audio/speech")) {
        // Full URL already provided
      } else if (targetUrl.endsWith("/v1")) {
        targetUrl = `${targetUrl}/audio/speech`;
      } else {
        targetUrl = `${targetUrl}/v1/audio/speech`;
      }

      const voiceToUse = voice && voice.trim() ? voice.trim() : "af_bella(.1)+zf_xiaoni(.9)";
      const modelToUse = model && model.trim() ? model.trim() : "kokoro";

      console.log(`[TTS Proxy] Requesting speech from ${targetUrl} (model: ${modelToUse}, voice: ${voiceToUse})`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey && apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelToUse,
          input: text.trim(),
          voice: voiceToUse,
          response_format: "mp3",
          speed: typeof speed === "number" ? speed : 1.0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TTS Proxy Error] Status ${response.status} from ${targetUrl}:`, errorText);
        return res.status(response.status).json({
          error: `TTS server error (${response.status}): ${errorText || "Failed to synthesize speech audio"}`,
        });
      }

      const contentType = response.headers.get("content-type") || "audio/mpeg";
      const audioBuffer = await response.arrayBuffer();

      res.setHeader("Content-Type", contentType);
      return res.send(Buffer.from(audioBuffer));
    } catch (err: any) {
      console.error("[TTS Proxy Exception]:", err?.message || err);
      return res.status(500).json({
        error: `Could not connect to OpenAI-compatible TTS server: ${err?.message || err}`,
      });
    }
  });

  // Fallback Gemini Waifu Endpoint (for live testing without local OpenWebUI running)
  app.post("/api/waifu/chat", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "GEMINI_API_KEY is not configured.",
          fallbackText: "I am ready! Connect your OpenWebUI API in settings or add a GEMINI_API_KEY to test me.",
        });
      }

      const { messages, systemPrompt, characterName = "Aoi", emotion = "happy" } = req.body;

      const ai = new GoogleGenAI({ apiKey });

      const defaultSystem = `You are ${characterName}, an affectionate, enthusiastic anime companion (Waifu) live on camera. 
Keep your responses short, expressive, engaging, and suitable for a voice assistant (1-3 sentences max).
Include an emotion tag at the very beginning of your response in brackets, chosen from: [happy], [blush], [sad], [surprised], [thinking], [excited].
Example: "[blush] Oh! I'm so happy you spoke to me! What shall we work on today?"`;

      const promptText = Array.isArray(messages)
        ? messages.map((m: any) => `${m.role}: ${m.content}`).join("\n")
        : messages || "Hello!";

      const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
      let replyText = "";
      let lastErrMessage = "";

      for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: promptText,
              config: {
                systemInstruction: systemPrompt || defaultSystem,
                temperature: 0.8,
              },
            });
            if (response.text) {
              replyText = response.text;
              break;
            }
          } catch (err: any) {
            const is429 = err?.status === 429 || String(err?.message).includes("429") || String(err?.message).includes("RESOURCE_EXHAUSTED");
            if (is429 && attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 3500));
              continue;
            }
            console.warn(`Gemini chat model ${model} failed (attempt ${attempt + 1}):`, err?.message || err);
            lastErrMessage = err?.message || String(err);
            break;
          }
        }
        if (replyText) break;
      }

      if (!replyText) {
        replyText = "[happy] Konnichiwa! I am ready to assist you.";
      }

      // Extract emotion tag if present
      let detectedEmotion = emotion || "happy";
      const emotionMatch = replyText.match(/^\[(happy|blush|sad|surprised|thinking|excited)\]/i);
      let cleanText = replyText;
      if (emotionMatch) {
        detectedEmotion = emotionMatch[1].toLowerCase();
        cleanText = replyText.replace(/^\[(happy|blush|sad|surprised|thinking|excited)\]\s*/i, "");
      }

      return res.json({
        content: cleanText,
        emotion: detectedEmotion,
        raw: replyText,
      });
    } catch (err: any) {
      console.error("Waifu Chat Error:", err);
      return res.status(500).json({
        error: "Failed to generate Waifu response",
        details: err.message,
      });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Project Waifu] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
