import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
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
  incrementFailedPinAttempts,
  resetFailedPinAttempts,
  lockUser,
  unlockUser,
  saveLive2dZip,
  getAllLive2dZips,
  deleteLive2dZip,
  getPrimaryAdminUser,
  getSystemSettings,
  saveSystemSettings,
  getAdminSettings,
  anyAdminHasPin,
  verifyUserPin,
  pinMatches,
  toPublicUser,
  type PublicUser,
} from "./server/db.js";
import {
  sendMagicLinkEmail,
  sendAdminPendingUserNotification,
  sendAccountUnlockEmail,
  testSmtpConnection,
} from "./server/mailer.js";
import { DEFAULT_TTS_BASE_URL, DEFAULT_TTS_MODEL, DEFAULT_TTS_VOICE } from "./src/lib/voiceDefaults.js";

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
      // WHISPER_MODEL picks the size: Xenova/whisper-tiny (default, fastest),
      // Xenova/whisper-base or Xenova/whisper-small (more accurate, slower).
      const modelName = process.env.WHISPER_MODEL || "Xenova/whisper-tiny";
      console.log(`Loading local server Whisper STT model (${modelName})...`);
      const pipe = await pipeline("automatic-speech-recognition", modelName);
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

  // Behind a reverse proxy (Nginx, Traefik, Cloudflare Tunnel...) set TRUST_PROXY so that
  // req.ip (rate limiting) and req.secure (cookie flag) reflect the real client.
  // Accepts "true", a hop count ("1"), or an Express trust-proxy string ("loopback").
  if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY;
    app.set("trust proxy", tp === "true" ? true : /^\d+$/.test(tp) ? Number(tp) : tp);
  }

  // Body size limits: small by default. The two routes that legitimately carry large
  // payloads parse their own bodies *after* authentication (see LARGE_BODY_ROUTES below),
  // so anonymous callers can't make the server buffer hundreds of megabytes.
  const LARGE_BODY_ROUTES = new Set(["/api/live2d/upload-zip", "/api/waifu/stt"]);
  const defaultJson = express.json({ limit: "10mb" });
  const defaultForm = express.urlencoded({ limit: "1mb", extended: true });
  app.use((req, res, next) => (LARGE_BODY_ROUTES.has(req.path) ? next() : defaultJson(req, res, next)));
  app.use((req, res, next) => (LARGE_BODY_ROUTES.has(req.path) ? next() : defaultForm(req, res, next)));
  app.use(cookieParser());

  // Brute-force protection for sign-in routes (per client IP).
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
  });
  app.use(
    ["/api/auth/register", "/api/auth/login", "/api/auth/verify", "/api/auth/owner-pin", "/api/auth/owner-pin-login", "/api/auth/change-pin"],
    authLimiter
  );

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: appVersion, message: "Project Waifu Server Running" });
  });

  // ---------------------------------------------------------------------------
  // Auth helpers
  // ---------------------------------------------------------------------------
  type AuthedRequest = express.Request & { user: PublicUser };

  const getCurrentUser = async (req: express.Request, res?: express.Response): Promise<PublicUser | null> => {
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

  /** Rejects requests without a valid session for an approved (or temporarily locked) account. */
  const requireUser: express.RequestHandler = async (req, res, next) => {
    try {
      const user = await getCurrentUser(req, res);
      if (!user || user.status === "pending" || user.status === "rejected") {
        res.status(401).json({ error: "Unauthorized. Please log in." });
        return;
      }
      (req as AuthedRequest).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };

  /** Rejects requests that are not from a signed-in administrator. */
  const requireAdmin: express.RequestHandler = async (req, res, next) => {
    try {
      const user = await getCurrentUser(req, res);
      if (!user || user.role !== "admin" || user.status === "pending" || user.status === "rejected") {
        res.status(403).json({ error: "Forbidden. System Owner (admin) access required." });
        return;
      }
      (req as AuthedRequest).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };

  const setSessionCookie = (req: express.Request, res: express.Response, sessionId: string) => {
    res.cookie("waifu_session", sessionId, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      // Secure when the request arrived over HTTPS (needs TRUST_PROXY behind a proxy), or force with COOKIE_SECURE=true
      secure: req.secure || process.env.COOKIE_SECURE === "true",
    });
  };

  // ---------------------------------------------------------------------------
  // Settings visibility
  // Admins see and edit everything. Regular users get the owner-managed endpoints
  // with API keys blanked out; the server re-attaches the saved key when it proxies.
  // ---------------------------------------------------------------------------
  const redactSecrets = (settings: any) => {
    if (!settings) return settings;
    const copy = JSON.parse(JSON.stringify(settings));
    if (copy.openwebuiConfig && typeof copy.openwebuiConfig === "object") copy.openwebuiConfig.apiKey = "";
    if (copy.ttsConfig && typeof copy.ttsConfig === "object") copy.ttsConfig.openaiApiKey = "";
    return copy;
  };

  const settingsForUser = async (user: PublicUser) => {
    const system = await getSystemSettings();
    const own = await getUserSettings(user.id);
    const base = own || system;
    if (user.role === "admin") return base;
    return redactSecrets({
      ...base,
      openwebuiConfig: system.openwebuiConfig ?? base?.openwebuiConfig ?? null,
      ttsConfig: system.ttsConfig ?? base?.ttsConfig ?? null,
      sttConfig: system.sttConfig ?? base?.sttConfig ?? null,
    });
  };

  // ---------------------------------------------------------------------------
  // Outbound proxy allow-list
  // Regular users may only reach endpoints the owner saved. Admins may also reach
  // unsaved URLs so the "Test connection" tools keep working while configuring.
  // ---------------------------------------------------------------------------
  type SavedEndpoint = { base: string; key: string; apiKey: string };
  const DEFAULT_TTS_BASE = DEFAULT_TTS_BASE_URL;

  const normalizeBase = (raw: unknown): string | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      const url = new URL(raw.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    } catch {
      return null;
    }
  };

  const savedEndpoints = async (user: PublicUser, kind: "chat" | "tts"): Promise<SavedEndpoint[]> => {
    const sources: any[] = [await getSystemSettings(), await getAdminSettings()];
    if (user.role === "admin") sources.push(await getUserSettings(user.id));
    const out: SavedEndpoint[] = [];
    for (const s of sources) {
      if (!s) continue;
      const rawBase = kind === "chat" ? s.openwebuiConfig?.baseUrl : s.ttsConfig?.openaiBaseUrl || DEFAULT_TTS_BASE;
      const apiKey = (kind === "chat" ? s.openwebuiConfig?.apiKey : s.ttsConfig?.openaiApiKey) || "";
      const base = normalizeBase(rawBase);
      if (base) out.push({ base: rawBase.trim().replace(/\/+$/, ""), key: base.toLowerCase(), apiKey });
    }
    if (kind === "tts" && out.length === 0) {
      out.push({ base: DEFAULT_TTS_BASE, key: DEFAULT_TTS_BASE.toLowerCase(), apiKey: "" });
    }
    return out;
  };

  /**
   * Decide which upstream a proxy call may reach. Returns null if the caller
   * isn't allowed to use that URL. A blank API key is filled from the saved one.
   */
  const resolveUpstream = async (user: PublicUser, kind: "chat" | "tts", requestedBase: unknown, requestedKey: unknown) => {
    const normalized = normalizeBase(requestedBase);
    if (!normalized) return null;
    const key = typeof requestedKey === "string" ? requestedKey.trim() : "";
    const match = (await savedEndpoints(user, kind)).find((e) => e.key === normalized.toLowerCase());
    if (match) return { base: match.base, apiKey: key || match.apiKey };
    if (user.role === "admin") return { base: (requestedBase as string).trim().replace(/\/+$/, ""), apiKey: key };
    return null;
  };

  /**
   * Read an AI server's reply. Returns parsed JSON; for a streamed (server-sent events)
   * chat reply, joins the chunks into one standard chat completion; null if it's neither.
   */
  const parseUpstreamReply = (raw: string): any | null => {
    const text = raw.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      // fall through to streamed format
    }
    const events = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((payload) => payload && payload !== "[DONE]");
    if (events.length === 0) return null;
    let content = "";
    let model: string | undefined;
    for (const payload of events) {
      try {
        const chunk = JSON.parse(payload);
        model = model || chunk.model;
        const choice = chunk.choices?.[0];
        content += choice?.delta?.content ?? choice?.message?.content ?? "";
      } catch {
        // ignore malformed chunk
      }
    }
    return { object: "chat.completion", model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] };
  };

  const FORBIDDEN_UPSTREAM = { error: "That server address is not one of the endpoints configured by the System Owner." };

  // GET /api/auth/me
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getCurrentUser(req, res);
      const userCount = await getUserCount();
      const adminUser = await getPrimaryAdminUser();
      // Signed-out visitors get no settings at all (they used to receive every stored API key).
      const settings = user ? await settingsForUser(user) : null;

      return res.json({
        user: toPublicUser(user),
        settings,
        userCount,
        hasOwner: Boolean(adminUser),
        ownerEmail: adminUser?.email || null,
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
        // Admins with a PIN must use it. An admin without one (e.g. promoted from the Admin panel)
        // may sign in by magic link and then set a PIN in the Admin panel.
        if (user.role === "admin" && user.pin) {
          return res.status(400).json({ error: "Administrator accounts cannot request magic links. Please sign in using your System Owner PIN." });
        }
        if (user.status === "pending") {
          return res.json({
            status: "pending",
            message: "Account registration is pending approval by the Administrator.",
          });
        }
        if (user.status === "rejected") {
          return res.status(403).json({ error: "Account registration was not approved." });
        }

        // Existing approved user requesting magic link
        const smtp = await getSmtpConfig();
        if (!smtp || !smtp.host) {
          return res.status(400).json({ error: "SMTP email service is not configured by the Administrator. Magic links cannot be sent." });
        }

        const { token: magicToken } = await createAuthToken(user.id, "magic_link");
        const appUrl = `${req.protocol}://${req.get("host")}`;
        const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

        const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl);
        if (!mailRes.sent) {
          return res.status(500).json({ error: `Failed to send Magic Link email via SMTP: ${mailRes.error || mailRes.reason || "Delivery failed"}. Please contact your administrator.` });
        }

        return res.json({
          status: "approved",
          message: "Magic Link sent to your email address! Please check your inbox.",
        });
      }

      // Create new user (First user automatically approved as admin)
      const role = isFirst ? "admin" : "user";
      const status = isFirst ? "approved" : "pending";
      const newUser = await createUser(cleanEmail, role, status);

      if (role === "admin") {
        return res.json({
          status: "approved",
          isFirstUser: true,
          message: "System Owner account initialized! Please set your Owner PIN.",
        });
      }

      if (status === "approved") {
        const smtp = await getSmtpConfig();
        if (!smtp || !smtp.host) {
          return res.status(400).json({ error: "SMTP email service is not configured by the Administrator. Magic links cannot be sent." });
        }

        const { token: magicToken } = await createAuthToken(newUser.id, "magic_link");
        const appUrl = `${req.protocol}://${req.get("host")}`;
        const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

        const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl);
        if (!mailRes.sent) {
          return res.status(500).json({ error: `Failed to send Magic Link email via SMTP: ${mailRes.error || mailRes.reason || "Delivery failed"}. Please contact your administrator.` });
        }

        return res.json({
          status: "approved",
          isFirstUser: false,
          message: "Account created! Magic link sent to your email address.",
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

      const smtp = await getSmtpConfig();
      if (!smtp || !smtp.host) {
        return res.status(400).json({ error: "SMTP email service is not configured by the Administrator. Magic links cannot be sent." });
      }

      // Same answer whether or not the email has a usable account, so this route
      // can't be used to discover which addresses are registered.
      const genericReply = { message: "If that email has an active account, a magic link is on its way. Please check your inbox." };

      const user = await getUserByEmail(cleanEmail);
      if (!user || (user.role === "admin" && user.pin) || user.status === "pending" || user.status === "rejected") {
        return res.json(genericReply);
      }

      const { token: magicToken } = await createAuthToken(user.id, "magic_link");
      const appUrl = `${req.protocol}://${req.get("host")}`;
      const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

      const mailRes = await sendMagicLinkEmail(cleanEmail, magicLinkUrl);
      if (!mailRes.sent) {
        console.error("Login magic link delivery failed:", mailRes.error || mailRes.reason);
      }

      return res.json(genericReply);
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
      if (!user) {
        return res.status(403).json({ error: "User account not found." });
      }

      if (user.status === "locked") {
        if (tokenObj.type === "unlock" || tokenObj.type === "magic_link") {
          await unlockUser(user.id);
          user.status = "approved";
        } else {
          return res.status(403).json({ error: "Your account is locked due to 10 failed PIN attempts. Please check your email for the unlock link." });
        }
      } else if (user.status !== "approved") {
        return res.status(403).json({ error: "User account is not active or approved." });
      }

      await resetFailedPinAttempts(user.id);

      const session = await createSession(user.id);
      setSessionCookie(req, res, session.sessionId);

      const publicUser = toPublicUser(user)!;
      const settings = await settingsForUser(publicUser);

      return res.json({
        user: publicUser,
        settings,
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      console.error("Verify error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/owner-pin
  // Sets a System Owner PIN. Without an admin session this is only allowed during first-run
  // setup: no administrator has a PIN yet, and the target is the original owner account (or
  // there are no accounts at all). After that, only a signed-in admin can call it.
  app.post("/api/auth/owner-pin", async (req, res) => {
    try {
      const { email, pin } = req.body || {};
      if (typeof email !== "string" || !email.includes("@") || typeof pin !== "string" || pin.trim().length < 4) {
        return res.status(400).json({ error: "Valid email and PIN (at least 4 characters) are required." });
      }
      const cleanEmail = email.trim().toLowerCase();

      const caller = await getCurrentUser(req);
      const callerIsAdmin = Boolean(caller && caller.role === "admin" && caller.status !== "pending" && caller.status !== "rejected");
      let user = await getUserByEmail(cleanEmail);

      if (!callerIsAdmin) {
        const setupClosed = await anyAdminHasPin();
        const primary = await getPrimaryAdminUser();
        const isFirstAccount = !user && (await getUserCount()) === 0;
        const isPrimaryOwner = Boolean(user && primary && primary.id === user.id);
        if (setupClosed || !(isFirstAccount || isPrimaryOwner)) {
          return res.status(403).json({ error: "A System Owner PIN has already been set up. Sign in as the owner to change PINs." });
        }
        if (user && user.status === "locked") {
          return res.status(403).json({ error: "Account is locked due to 10 failed PIN attempts. Please check your email for the unlock link." });
        }
      }

      if (!user) {
        await createUser(cleanEmail, "admin", "approved", pin.trim());
        user = await getUserByEmail(cleanEmail);
      } else {
        await updateUserRole(user.id, "admin");
        await setUserPin(user.id, pin.trim());
        await resetFailedPinAttempts(user.id);
      }
      if (!user) {
        return res.status(500).json({ error: "Failed to save the owner account." });
      }

      const updatedUser = toPublicUser(await getUserById(user.id))!;

      // An admin setting a PIN for a different account stays signed in as themselves.
      if (callerIsAdmin && caller!.id !== user.id) {
        return res.json({ status: "ok", message: `PIN saved for ${updatedUser.email}.`, user: updatedUser });
      }

      const session = await createSession(user.id);
      setSessionCookie(req, res, session.sessionId);
      const settings = await settingsForUser(updatedUser);
      return res.json({
        status: "ok",
        message: "System Owner PIN saved successfully!",
        user: updatedUser,
        settings,
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      console.error("Owner PIN error:", err);
      return res.status(500).json({ error: "Failed to save the System Owner PIN." });
    }
  });

  // POST /api/auth/owner-pin-login
  // Only checks a PIN. It never creates accounts and never promotes anyone to admin.
  app.post("/api/auth/owner-pin-login", async (req, res) => {
    try {
      const { email, pin } = req.body || {};
      if (typeof email !== "string" || typeof pin !== "string" || !email.trim() || !pin.trim()) {
        return res.status(400).json({ error: "Email and PIN are required." });
      }
      const cleanEmail = email.trim().toLowerCase();
      const user = await getUserByEmail(cleanEmail);
      const badCredentials = () => res.status(401).json({ error: "Incorrect email or System Owner PIN." });

      if (!user || user.role !== "admin") {
        return badCredentials();
      }

      if (user.status === "locked") {
        return res.status(403).json({
          error: "Account is locked due to 10 failed PIN attempts. Please check your email for the unlock link."
        });
      }

      if (!user.pin) {
        // The original owner closed the browser after registering but before choosing a PIN.
        // Let them finish setup here, but only while no admin anywhere has a PIN yet.
        const primary = await getPrimaryAdminUser();
        if (primary && primary.id === user.id && pin.trim().length >= 4 && !(await anyAdminHasPin())) {
          await setUserPin(user.id, pin.trim());
        } else {
          return res.status(401).json({
            error: "No System Owner PIN is set for this account yet. Sign in with a magic link, then set a PIN in the Admin panel.",
          });
        }
      } else if (!(await verifyUserPin(user.id, pin))) {
        const attempts = await incrementFailedPinAttempts(user.id);
        if (attempts >= 10) {
          await lockUser(user.id);
          const { token: unlockToken } = await createAuthToken(user.id, "unlock");
          const appUrl = `${req.protocol}://${req.get("host")}`;
          const unlockUrl = `${appUrl}/?token=${unlockToken}`;
          const mailRes = await sendAccountUnlockEmail(cleanEmail, unlockUrl);

          return res.status(403).json({
            error: mailRes.sent
              ? "Incorrect PIN entered 10 times. Your account has been locked. An unlock link has been sent to your email address."
              : `Incorrect PIN entered 10 times. Account is locked. (Failed to send email via SMTP: ${mailRes.error || mailRes.reason || "SMTP error"}).`
          });
        }
        const remaining = 10 - attempts;
        return res.status(401).json({
          error: `Incorrect System Owner PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before account lockout.`
        });
      }

      await resetFailedPinAttempts(user.id);

      const session = await createSession(user.id);
      setSessionCookie(req, res, session.sessionId);
      const updatedUser = toPublicUser(await getUserById(user.id))!;
      const settings = await settingsForUser(updatedUser);
      return res.json({
        status: "ok",
        user: updatedUser,
        settings,
        sessionId: session.sessionId,
      });
    } catch (err: any) {
      console.error("Owner PIN login error:", err);
      return res.status(500).json({ error: "Owner sign-in failed." });
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

  // POST /api/auth/change-pin
  app.post("/api/auth/change-pin", requireAdmin, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const dbUser = await getUserById(user.id);

      const { currentPin, newPin } = req.body || {};
      if (!newPin || typeof newPin !== "string" || newPin.trim().length < 4) {
        return res.status(400).json({ error: "New PIN must be at least 4 characters." });
      }

      if (dbUser && dbUser.pin && !pinMatches(dbUser.pin, currentPin)) {
        return res.status(401).json({ error: "Incorrect current PIN." });
      }

      await setUserPin(user.id, newPin.trim());
      await resetFailedPinAttempts(user.id);

      return res.json({ status: "ok", message: "System Owner PIN updated successfully!" });
    } catch (err: any) {
      console.error("Change PIN error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/settings - System-wide default configurations & personas (admin only)
  app.get("/api/system/settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await getSystemSettings();
      return res.json({ settings });
    } catch (err: any) {
      console.error("Get system settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/settings - Update system-wide configuration (admin only)
  app.post("/api/system/settings", requireAdmin, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const { activeProfileId, waifuProfiles, ttsConfig, sttConfig, openwebuiConfig, trackingEngineEnabled } = req.body || {};
      await saveSystemSettings({
        activeProfileId,
        waifuProfiles,
        ttsConfig,
        sttConfig,
        openwebuiConfig,
        trackingEngineEnabled,
      });
      await saveUserSettings(user.id, {
        activeProfileId,
        waifuProfiles,
        ttsConfig,
        sttConfig,
        openwebuiConfig,
        trackingEngineEnabled,
      });
      return res.json({ status: "ok", message: "System settings successfully persisted to SQLite database." });
    } catch (err: any) {
      console.error("Save system settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/user/settings
  app.get("/api/user/settings", requireUser, async (req, res) => {
    try {
      const settings = await settingsForUser((req as AuthedRequest).user);
      return res.json({ settings });
    } catch (err: any) {
      console.error("Get user settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/user/settings
  // Saves only this user's own settings. It no longer overwrites the system-wide defaults,
  // so one user's personas and endpoints can't replace everyone else's.
  app.post("/api/user/settings", requireUser, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const { activeProfileId, waifuProfiles, ttsConfig, sttConfig, openwebuiConfig, trackingEngineEnabled } = req.body || {};
      await saveUserSettings(user.id, {
        activeProfileId,
        waifuProfiles,
        ttsConfig,
        sttConfig,
        openwebuiConfig,
        // The tracking-engine switch is system-wide, so only the owner may change it.
        trackingEngineEnabled: user.role === "admin" ? trackingEngineEnabled : undefined,
      });
      return res.json({ status: "ok", message: "User settings saved." });
    } catch (err: any) {
      console.error("Save user settings error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin APIs
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
      const users = await getAllUsers();
      return res.json({ users });
    } catch (err: any) {
      console.error("Admin list users error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
      const { id } = req.params;
      const targetUser = await getUserById(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found." });
      }

      await updateUserStatus(id, "approved");

      if (targetUser.role === "admin") {
        return res.json({
          status: "ok",
          message: `User ${targetUser.email} approved as Administrator.`,
        });
      }

      const smtp = await getSmtpConfig();
      if (!smtp || !smtp.host) {
        return res.json({
          status: "ok",
          message: `User ${targetUser.email} approved. Note: SMTP is not configured, so no magic link email was sent.`,
        });
      }

      const { token: magicToken } = await createAuthToken(id, "magic_link");
      const appUrl = `${req.protocol}://${req.get("host")}`;
      const magicLinkUrl = `${appUrl}/?token=${magicToken}`;

      const mailRes = await sendMagicLinkEmail(targetUser.email, magicLinkUrl);

      return res.json({
        status: "ok",
        message: mailRes.sent
          ? `User ${targetUser.email} approved and magic link emailed.`
          : `User ${targetUser.email} approved, but failed to send magic link email: ${mailRes.error || mailRes.reason}`,
      });
    } catch (err: any) {
      console.error("Approve user error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/reject", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
      const { id } = req.params;
      await updateUserStatus(id, "rejected");
      return res.json({ status: "ok" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
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

  app.post("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
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

  app.get("/api/admin/smtp", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
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

  app.post("/api/admin/smtp", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
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

  app.post("/api/admin/smtp/test", requireAdmin, async (req, res) => {
    try {
      const currentUser = (req as AuthedRequest).user;
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

  // Auto-extract assets/Tamamo.zip if present and model3.json not yet extracted
  const defaultTamamoZipPath = path.join(process.cwd(), "assets", "Tamamo.zip");
  const tamamoFolderPath = path.join(MODELS_DIR, "tamamo");

  // Model ids are generated server-side ("tamamo" or model_<timestamp>_<rand>); anything else is rejected.
  const MODEL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  // File types a Live2D model actually uses. Anything else in an uploaded zip is skipped,
  // so a zip can't smuggle in an .html/.js/.svg page that would run on this app's origin.
  const MODEL_ASSET_EXTENSIONS = new Set([
    ".json", ".moc", ".moc3", ".png", ".jpg", ".jpeg", ".webp", ".mtn", ".txt", ".wav", ".mp3", ".ogg", ".m4a",
  ]);
  const isModelAsset = (name: string) => MODEL_ASSET_EXTENSIONS.has(path.extname(name).toLowerCase());

  /** Resolve a zip entry inside baseDir, or null if it would escape it (zip-slip). */
  const safeEntryPath = (baseDir: string, entryName: string): string | null => {
    const root = path.resolve(baseDir);
    const out = path.resolve(root, entryName);
    return out.startsWith(root + path.sep) ? out : null;
  };

  const ensureModelExtracted = async (modelId: string): Promise<boolean> => {
    if (!MODEL_ID_RE.test(modelId)) return false;
    const modelFolderPath = path.join(MODELS_DIR, modelId);
    const checkModelJson = (dir: string): boolean => {
      if (!fs.existsSync(dir)) return false;
      let hasModelJson = false;
      let hasMoc = false;
      const scanDir = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else if (entry.isFile()) {
            const lower = entry.name.toLowerCase();
            if (lower.endsWith(".model3.json") || lower.endsWith(".model.json")) hasModelJson = true;
            if (lower.endsWith(".moc3") || lower.endsWith(".moc")) hasMoc = true;
          }
        }
      };
      scanDir(dir);
      return hasModelJson && hasMoc;
    };

    if (checkModelJson(modelFolderPath)) {
      return true;
    }

    if ((modelId === "tamamo" || modelId === "Tamamo") && fs.existsSync(defaultTamamoZipPath)) {
      try {
        console.log("[Project Waifu] Extracting default Tamamo model from assets/Tamamo.zip...");
        const zipBuffer = fs.readFileSync(defaultTamamoZipPath);
        const zip = await JSZip.loadAsync(zipBuffer);
        fs.mkdirSync(tamamoFolderPath, { recursive: true });
        const zipKeys = Object.keys(zip.files);
        for (const key of zipKeys) {
          const entry = zip.files[key];
          if (entry.dir || !isModelAsset(key)) continue;
          const outPath = safeEntryPath(tamamoFolderPath, key);
          if (!outPath) continue;
          const parentDir = path.dirname(outPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          const contentBuffer = await entry.async("nodebuffer");
          fs.writeFileSync(outPath, contentBuffer);
        }
        return true;
      } catch (err) {
        console.error("[Project Waifu] Failed to extract Tamamo.zip:", err);
      }
    }

    try {
      const savedZips = await getAllLive2dZips();
      const zipRecord = savedZips.find((z) => z.modelId === modelId);
      if (zipRecord && zipRecord.zipBase64) {
        console.log(`[Project Waifu] Restoring Live2D model "${zipRecord.name}" (${zipRecord.modelId}) from SQLite database zip...`);
        const buffer = Buffer.from(zipRecord.zipBase64, "base64");
        const zip = await JSZip.loadAsync(buffer);
        fs.mkdirSync(modelFolderPath, { recursive: true });
        const zipKeys = Object.keys(zip.files);
        for (const key of zipKeys) {
          const entry = zip.files[key];
          if (entry.dir || !isModelAsset(key)) continue;
          const outPath = safeEntryPath(modelFolderPath, key);
          if (!outPath) continue;
          const parentDir = path.dirname(outPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          const contentBuffer = await entry.async("nodebuffer");
          fs.writeFileSync(outPath, contentBuffer);
        }
        return true;
      }
    } catch (err) {
      console.error(`[Project Waifu] Failed to restore model ${modelId} from DB zip:`, err);
    }

    return false;
  };

  // Restore all models stored in SQLite database on startup
  try {
    if (fs.existsSync(defaultTamamoZipPath)) {
      await ensureModelExtracted("tamamo");
    }
    const savedZips = await getAllLive2dZips();
    for (const z of savedZips) {
      await ensureModelExtracted(z.modelId);
    }
  } catch (err) {
    console.error("[Project Waifu] Startup Live2D model restore error:", err);
  }

  // Middleware to auto-extract missing model if requested via /models/:modelId
  app.use("/models/:modelId", async (req, _res, next) => {
    const modelId = req.params.modelId;
    if (modelId) {
      try {
        await ensureModelExtracted(modelId);
      } catch (e) {
        console.warn(`Could not ensure model ${modelId} extracted:`, e);
      }
    }
    next();
  });

  // Only model asset types are ever served from /models. This also covers folders extracted
  // before uploads were filtered, which might still contain .html/.js/.svg files.
  app.use("/models", (req, res, next) => {
    if (!isModelAsset(req.path)) {
      res.status(404).end();
      return;
    }
    next();
  });

  // Serve models directory statically with CORS headers and appropriate MIME types
  app.use(
    "/models",
    express.static(MODELS_DIR, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-Content-Type-Options", "nosniff");
        // Belt and braces: even if a document were served from here, it couldn't run scripts.
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        if (filePath.endsWith(".moc") || filePath.endsWith(".moc3")) {
          res.setHeader("Content-Type", "application/octet-stream");
        } else if (filePath.endsWith(".model3.json") || filePath.endsWith(".model.json")) {
          res.setHeader("Content-Type", "application/json");
        }
      },
    })
  );

  // GET /api/live2d/models - List all server-stored Live2D models
  app.get("/api/live2d/models", requireUser, async (_req, res) => {
    try {
      if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
      }

      // Ensure default model and all DB-stored models are extracted
      await ensureModelExtracted("tamamo");
      const dbZips = await getAllLive2dZips();
      for (const z of dbZips) {
        await ensureModelExtracted(z.modelId);
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
  app.post("/api/live2d/upload-zip", requireAdmin, express.json({ limit: "200mb" }), async (req, res) => {
    try {
      const { zipBase64 } = req.body || {};
      if (typeof zipBase64 !== "string" || !zipBase64) {
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
      const skippedFiles: string[] = [];

      const zipKeys = Object.keys(zip.files);
      for (const key of zipKeys) {
        const entry = zip.files[key];
        if (entry.dir) continue;
        const lower = key.toLowerCase();
        if ((lower.endsWith(".model3.json") || lower.endsWith(".model.json")) && safeEntryPath(modelFolderPath, key)) {
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
        if (!isModelAsset(key)) {
          skippedFiles.push(key);
          continue;
        }

        const outPath = safeEntryPath(modelFolderPath, key);
        if (!outPath) {
          skippedFiles.push(key);
          continue;
        }
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
        skippedFiles,
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
  app.delete("/api/live2d/models/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || !MODEL_ID_RE.test(id)) {
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
  app.post("/api/openwebui/proxy", requireUser, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const { baseUrl, apiKey, endpoint = "/chat/completions", method = "POST", body } = req.body || {};
      if (!baseUrl) {
        return res.status(400).json({ error: "baseUrl is required" });
      }
      if (typeof endpoint !== "string" || (method !== "GET" && method !== "POST")) {
        return res.status(400).json({ error: "Unsupported endpoint or method." });
      }
      // Regular users can only chat or list models; the owner's test tools may hit other paths.
      const cleanEndpoint = `/${endpoint.replace(/^\/+/, "")}`;
      if (user.role !== "admin" && cleanEndpoint !== "/chat/completions" && cleanEndpoint !== "/models") {
        return res.status(403).json({ error: "That API endpoint is not available." });
      }

      const upstream = await resolveUpstream(user, "chat", baseUrl, apiKey);
      if (!upstream) {
        return res.status(403).json(FORBIDDEN_UPSTREAM);
      }

      // Build the URL and make sure the endpoint can't switch to a different host.
      const targetUrl = `${upstream.base}${cleanEndpoint}`;
      if (new URL(targetUrl).origin !== new URL(upstream.base).origin) {
        return res.status(400).json({ error: "Invalid endpoint." });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (upstream.apiKey) {
        headers["Authorization"] = `Bearer ${upstream.apiKey}`;
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (body && (method === "POST" || method === "PUT")) {
        // The app reads one complete JSON reply. Some servers (e.g. Open WebUI) stream by
        // default unless told otherwise, so ask for a non-streamed reply explicitly.
        const outBody =
          cleanEndpoint === "/chat/completions" && typeof body === "object" && body.stream === undefined
            ? { ...body, stream: false }
            : body;
        fetchOptions.body = JSON.stringify(outBody);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const raw = await response.text();
      const data = parseUpstreamReply(raw);

      if (!response.ok) {
        return res.status(response.status).json({
          error: `OpenWebUI API error (${response.status})`,
          details: data ?? raw.slice(0, 500),
        });
      }

      if (data === null) {
        console.warn(`[OpenWebUI Proxy] Non-JSON reply from ${targetUrl}:`, raw.slice(0, 300));
        return res.status(502).json({
          error: "The AI server's reply wasn't JSON. Check that the Base URL points at its OpenAI-compatible API (often ending in /v1 or /api).",
          details: raw.slice(0, 300),
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

  // Speech-to-Text Endpoint with built-in Local Whisper STT + OpenAI-compatible STT proxy
  app.post("/api/waifu/stt", requireUser, express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const { pcmFloat32, pcmBase64, audioBase64, mimeType = "audio/webm", language = "en-US", openWebUIConfig } = req.body || {};

      // 16 kHz mono PCM: either a JSON number array (push-to-talk) or base64
      // Float32 (conversation mode, ~5x smaller).
      let pcm: Float32Array | null = null;
      if (typeof pcmBase64 === "string" && pcmBase64) {
        const buf = Buffer.from(pcmBase64, "base64");
        pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - (buf.byteLength % 4)));
      } else if (Array.isArray(pcmFloat32) && pcmFloat32.length > 0) {
        pcm = new Float32Array(pcmFloat32);
      }

      if (!pcm && !audioBase64) {
        return res.status(400).json({ error: "No audio PCM data or audio base64 provided" });
      }

      // Near-silent clips are where Whisper invents words ("you", "thank you"), so skip them.
      if (pcm && pcm.length > 0) {
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        const rms = Math.sqrt(sum / pcm.length);
        if (rms < 0.003) {
          return res.json({ text: "", skipped: "silence" });
        }
      }

      // 1. Built-in Local Server Whisper STT (No external keys/APIs needed!)
      if (pcm && pcm.length > 0) {
        try {
          const audioData = pcm;
          const pipe = await getWhisperPipeline();
          const langCode = language ? language.split("-")[0].toLowerCase() : "english";
          
          const result = await pipe(audioData, {
            language: langCode === "en" ? "english" : langCode === "ja" ? "japanese" : langCode,
            task: "transcribe",
          });

          if (result && typeof result.text === "string") {
            // Drop Whisper's non-speech markers such as [BLANK_AUDIO] or (music).
            const text = result.text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
            console.log("[Local Whisper STT Success]:", text || "(no speech)");
            return res.json({ text });
          }
        } catch (whisperErr: any) {
          console.error("Local Whisper STT processing error:", whisperErr?.message || whisperErr);
        }
      }

      // 2. OpenWebUI API (/audio/transcriptions) if configured and audioBase64 present
      const sttUpstream =
        openWebUIConfig && openWebUIConfig.baseUrl && audioBase64
          ? await resolveUpstream(user, "chat", openWebUIConfig.baseUrl, openWebUIConfig.apiKey)
          : null;
      if (sttUpstream) {
        try {
          const targetUrl = `${sttUpstream.base}/audio/transcriptions`;
          const audioBuffer = Buffer.from(audioBase64, "base64");
          const formData = new FormData();
          const fileBlob = new Blob([audioBuffer], { type: mimeType });
          formData.append("file", fileBlob, "speech.webm");
          formData.append("model", "whisper-1");

          const headers: Record<string, string> = {};
          if (sttUpstream.apiKey) {
            headers["Authorization"] = `Bearer ${sttUpstream.apiKey}`;
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

      return res.status(400).json({
        error: "Audio transcription failed. Ensure your microphone is working and your OpenAI-compatible STT endpoint is configured.",
      });
    } catch (err: any) {
      console.error("STT API Error:", err);
      return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
  });

  // OpenAI-compatible Text-To-Speech Endpoint (for Kokoro, Open WebUI, or OpenAI TTS)
  app.post("/api/waifu/tts", requireUser, async (req, res) => {
    try {
      const user = (req as AuthedRequest).user;
      const { text, baseUrl, apiKey, model, voice, speed } = req.body || {};
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "No text provided for TTS" });
      }

      const upstream = await resolveUpstream(user, "tts", baseUrl || DEFAULT_TTS_BASE, apiKey);
      if (!upstream) {
        return res.status(403).json(FORBIDDEN_UPSTREAM);
      }

      const cleanBaseUrl = upstream.base;
      let targetUrl = cleanBaseUrl;
      if (targetUrl.endsWith("/audio/speech")) {
        // Full URL already provided
      } else if (targetUrl.endsWith("/v1")) {
        targetUrl = `${targetUrl}/audio/speech`;
      } else {
        targetUrl = `${targetUrl}/v1/audio/speech`;
      }

      const voiceToUse = voice && voice.trim() ? voice.trim() : DEFAULT_TTS_VOICE;
      const modelToUse = model && model.trim() ? model.trim() : DEFAULT_TTS_MODEL;

      console.log(`[TTS Proxy] Requesting speech from ${targetUrl} (model: ${modelToUse}, voice: ${voiceToUse})`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (upstream.apiKey) {
        headers["Authorization"] = `Bearer ${upstream.apiKey}`;
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

  // Companion Chat endpoint without external fallback
  app.post("/api/waifu/chat", async (req, res) => {
    return res.status(400).json({
      error: "No OpenAI-compatible server configured. Please configure your endpoint in Settings (⚙️).",
    });
  });

  // PWA Service Worker & Manifest headers
  app.get("/sw.js", (_req, res) => {
    const swPath = process.env.NODE_ENV !== "production"
      ? path.join(process.cwd(), "public", "sw.js")
      : path.join(process.cwd(), "dist", "sw.js");
    
    if (fs.existsSync(swPath)) {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Service-Worker-Allowed", "/");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.sendFile(swPath);
    }
    return res.status(404).send("Service worker not found");
  });

  app.get(["/manifest.json", "/manifest.webmanifest"], (_req, res) => {
    const manifestPath = process.env.NODE_ENV !== "production"
      ? path.join(process.cwd(), "public", "manifest.json")
      : path.join(process.cwd(), "dist", "manifest.json");

    if (fs.existsSync(manifestPath)) {
      res.setHeader("Content-Type", "application/manifest+json");
      return res.sendFile(manifestPath);
    }
    return res.status(404).send("Manifest not found");
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
