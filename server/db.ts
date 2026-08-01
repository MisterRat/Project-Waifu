import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
try {
  const parentData = path.resolve(process.cwd(), "../data");
  const parentBase = path.resolve(process.cwd(), "..");
  if (fs.existsSync(parentBase)) {
    DATA_DIR = parentData;
  }
} catch (e) {}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "app.db");

let dbInstance: Database | null = null;

function persistDb() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

export async function getDb(): Promise<{ db: Database; save: () => void }> {
  if (!dbInstance) {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_FILE)) {
      const fileBuffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(fileBuffer);
    } else {
      dbInstance = new SQL.Database();
    }

    // Initialize Schema
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'pending',
        pin TEXT,
        created_at INTEGER NOT NULL,
        last_login INTEGER
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        active_profile_id TEXT,
        waifu_profiles TEXT,
        tts_config TEXT,
        stt_config TEXT,
        openwebui_config TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS smtp_config (
        id TEXT PRIMARY KEY,
        host TEXT NOT NULL DEFAULT '',
        port INTEGER NOT NULL DEFAULT 587,
        secure INTEGER NOT NULL DEFAULT 0,
        auth_user TEXT NOT NULL DEFAULT '',
        auth_pass TEXT NOT NULL DEFAULT '',
        from_email TEXT NOT NULL DEFAULT '',
        admin_email TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
    `);

    try {
      dbInstance.run("ALTER TABLE users ADD COLUMN pin TEXT");
    } catch (e) {
      // Column may already exist
    }

    persistDb();
  }

  return { db: dbInstance, save: persistDb };
}

// Helper Query Functions
export async function getUserByEmail(email: string) {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
  stmt.bind([email.trim()]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as {
      id: string;
      email: string;
      role: 'admin' | 'user';
      status: 'pending' | 'approved' | 'rejected';
      pin: string | null;
      created_at: number;
      last_login: number | null;
    };
  }
  stmt.free();
  return null;
}

export async function getUserById(id: string) {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as {
      id: string;
      email: string;
      role: 'admin' | 'user';
      status: 'pending' | 'approved' | 'rejected';
      pin: string | null;
      created_at: number;
      last_login: number | null;
    };
  }
  stmt.free();
  return null;
}

export async function createUser(email: string, role: 'admin' | 'user' = 'user', status: 'pending' | 'approved' | 'rejected' = 'pending', pin?: string) {
  const { db, save } = await getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    "INSERT INTO users (id, email, role, status, pin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, email.trim().toLowerCase(), role, status, pin || null, now]
  );
  save();
  return { id, email: email.trim().toLowerCase(), role, status, pin: pin || null, created_at: now, last_login: null };
}

export async function setUserPin(userId: string, pin: string) {
  const { db, save } = await getDb();
  db.run("UPDATE users SET pin = ? WHERE id = ?", [pin.trim(), userId]);
  save();
}

export async function updateUserStatus(id: string, status: 'approved' | 'rejected') {
  const { db, save } = await getDb();
  db.run("UPDATE users SET status = ? WHERE id = ?", [status, id]);
  save();
}

export async function updateUserRole(id: string, role: 'admin' | 'user') {
  const { db, save } = await getDb();
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  save();
}

export async function deleteUser(id: string) {
  const { db, save } = await getDb();
  db.run("DELETE FROM users WHERE id = ?", [id]);
  db.run("DELETE FROM user_settings WHERE user_id = ?", [id]);
  db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
  save();
}

export async function getAllUsers() {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT id, email, role, status, created_at, last_login FROM users ORDER BY created_at DESC");
  const users = [];
  while (stmt.step()) {
    users.push(stmt.getAsObject());
  }
  stmt.free();
  return users;
}

export async function getUserCount() {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT COUNT(*) as count FROM users");
  let count = 0;
  if (stmt.step()) {
    count = (stmt.getAsObject().count as number) || 0;
  }
  stmt.free();
  return count;
}

// Token & Session Management
export async function createAuthToken(userId: string, type: 'magic_link' | 'pin' = 'magic_link') {
  const { db, save } = await getDb();
  const token = type === 'pin' ? Math.floor(100000 + Math.random() * 900000).toString() : crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  db.run(
    "INSERT INTO auth_tokens (token, user_id, type, expires_at, used) VALUES (?, ?, ?, ?, 0)",
    [token, userId, type, expiresAt]
  );
  save();
  return { token, expiresAt };
}

export async function verifyAuthToken(tokenStr: string) {
  const { db, save } = await getDb();
  const stmt = db.prepare("SELECT * FROM auth_tokens WHERE token = ? AND used = 0 AND expires_at > ?");
  stmt.bind([tokenStr.trim(), Date.now()]);
  if (stmt.step()) {
    const tokenObj = stmt.getAsObject() as { token: string; user_id: string; type: string; expires_at: number; used: number };
    stmt.free();
    // Mark as used
    db.run("UPDATE auth_tokens SET used = 1 WHERE token = ?", [tokenStr.trim()]);
    save();
    return tokenObj;
  }
  stmt.free();
  return null;
}

export async function createSession(userId: string) {
  const { db, save } = await getDb();
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
  db.run(
    "INSERT INTO sessions (session_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [sessionId, userId, expiresAt, now]
  );
  db.run("UPDATE users SET last_login = ? WHERE id = ?", [now, userId]);
  save();
  return { sessionId, expiresAt };
}

export async function getUserBySession(sessionId: string) {
  const { db, save } = await getDb();
  const stmt = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_id = ? AND s.expires_at > ?
  `);
  stmt.bind([sessionId, Date.now()]);
  if (stmt.step()) {
    const user = stmt.getAsObject() as any;
    stmt.free();
    if (user.role !== 'admin') {
      db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
      save();
      user.role = 'admin';
    }
    return user as {
      id: string;
      email: string;
      role: 'admin' | 'user';
      status: 'pending' | 'approved' | 'rejected';
      created_at: number;
      last_login: number | null;
    };
  }
  stmt.free();
  return null;
}

export async function deleteSession(sessionId: string) {
  const { db, save } = await getDb();
  db.run("DELETE FROM sessions WHERE session_id = ?", [sessionId]);
  save();
}

// User Settings
export async function getUserSettings(userId: string) {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM user_settings WHERE user_id = ?");
  stmt.bind([userId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      activeProfileId: row.active_profile_id as string || null,
      waifuProfiles: row.waifu_profiles ? JSON.parse(row.waifu_profiles as string) : null,
      ttsConfig: row.tts_config ? JSON.parse(row.tts_config as string) : null,
      sttConfig: row.stt_config ? JSON.parse(row.stt_config as string) : null,
      openwebuiConfig: row.openwebui_config ? JSON.parse(row.openwebui_config as string) : null,
    };
  }
  stmt.free();
  return null;
}

export async function saveUserSettings(userId: string, data: {
  activeProfileId?: string;
  waifuProfiles?: any;
  ttsConfig?: any;
  sttConfig?: any;
  openwebuiConfig?: any;
}) {
  const { db, save } = await getDb();
  const existing = await getUserSettings(userId);
  const now = Date.now();

  const activeProfileId = data.activeProfileId !== undefined ? data.activeProfileId : (existing?.activeProfileId || null);
  const waifuProfiles = data.waifuProfiles !== undefined ? JSON.stringify(data.waifuProfiles) : (existing?.waifuProfiles ? JSON.stringify(existing.waifuProfiles) : null);
  const ttsConfig = data.ttsConfig !== undefined ? JSON.stringify(data.ttsConfig) : (existing?.ttsConfig ? JSON.stringify(existing.ttsConfig) : null);
  const sttConfig = data.sttConfig !== undefined ? JSON.stringify(data.sttConfig) : (existing?.sttConfig ? JSON.stringify(existing.sttConfig) : null);
  const openwebuiConfig = data.openwebuiConfig !== undefined ? JSON.stringify(data.openwebuiConfig) : (existing?.openwebuiConfig ? JSON.stringify(existing.openwebuiConfig) : null);

  db.run(`
    INSERT INTO user_settings (user_id, active_profile_id, waifu_profiles, tts_config, stt_config, openwebui_config, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      active_profile_id = excluded.active_profile_id,
      waifu_profiles = excluded.waifu_profiles,
      tts_config = excluded.tts_config,
      stt_config = excluded.stt_config,
      openwebui_config = excluded.openwebui_config,
      updated_at = excluded.updated_at
  `, [userId, activeProfileId, waifuProfiles, ttsConfig, sttConfig, openwebuiConfig, now]);

  save();
}

// SMTP Config
export async function getSmtpConfig() {
  const { db } = await getDb();
  const stmt = db.prepare("SELECT * FROM smtp_config WHERE id = 'default'");
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      host: row.host as string,
      port: Number(row.port) || 587,
      secure: Boolean(row.secure),
      authUser: row.auth_user as string,
      authPass: row.auth_pass as string,
      fromEmail: row.from_email as string,
      adminEmail: row.admin_email as string,
    };
  }
  stmt.free();
  return null;
}

export async function saveSmtpConfig(config: {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromEmail: string;
  adminEmail: string;
}) {
  const { db, save } = await getDb();
  const now = Date.now();
  db.run(`
    INSERT OR REPLACE INTO smtp_config (id, host, port, secure, auth_user, auth_pass, from_email, admin_email, updated_at)
    VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
  `, [config.host, config.port, config.secure ? 1 : 0, config.authUser, config.authPass, config.fromEmail, config.adminEmail, now]);
  save();
}
