// Security regression tests: replays the attacks from the code reviews against a real server
// (the production build in dist/, with a throwaway data folder). Run with `npm test` after
// `npm run build`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const OWNER = { email: "owner@example.test", pin: "4826" };
let server;
let base;
let dataDir;
let log = "";

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "waifu-security-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["dist/server.cjs"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 60000;
  while (!log.includes("Server running")) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("server did not start:\n" + log);
    await new Promise((r) => setTimeout(r, 200));
  }
});

after(() => {
  server?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** JSON request; returns { status, body, cookie } where cookie is the waifu_session value if set. */
async function call(method, url, { body, cookie, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `waifu_session=${cookie}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const set = res.headers.get("set-cookie") || "";
  const m = /waifu_session=([^;]+)/.exec(set);
  return { status: res.status, body: json, cookie: m ? m[1] : null };
}

const setupToken = () => {
  const m = /One-time setup token: ([A-Z0-9-]+)/.exec(log);
  return m ? m[1] : null;
};

let ownerCookie = null;

test("first run: a setup token is printed and the owner email is never public", async () => {
  assert.ok(setupToken(), "setup token in the server log");
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.setupRequired, true);
  assert.equal("ownerEmail" in me.body, false);
});

test("first run: registering does not create an administrator", async () => {
  const r = await call("POST", "/api/auth/register", { body: { email: "first@example.test" } });
  assert.notEqual(r.status, 200);
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.body.userCount, 0);
  assert.equal(me.body.setupRequired, true);
});

test("first run: owner PIN needs the setup token (round 2 takeover)", async () => {
  const none = await call("POST", "/api/auth/owner-pin", { body: { email: "attacker@example.test", pin: "1111" } });
  assert.equal(none.status, 403);
  const wrong = await call("POST", "/api/auth/owner-pin", {
    body: { email: "attacker@example.test", pin: "1111", setupToken: "AAAA-BBBB-CCCC" },
  });
  assert.equal(wrong.status, 403);
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.body.userCount, 0, "no account created by failed attempts");
});

test("first run: the token holder becomes owner; the session is cookie-only", async () => {
  const r = await call("POST", "/api/auth/owner-pin", {
    body: { email: OWNER.email, pin: OWNER.pin, setupToken: setupToken().toLowerCase() },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.cookie, "httpOnly session cookie set");
  assert.equal("sessionId" in r.body, false, "session id never in the JSON");
  ownerCookie = r.cookie;
  const me = await call("GET", "/api/auth/me", { cookie: ownerCookie });
  assert.equal(me.body.user.email, OWNER.email);
  assert.equal(me.body.user.role, "admin");
  assert.equal(me.body.setupRequired, false);
});

test("after setup: the old token and anonymous owner-pin are refused", async () => {
  const r = await call("POST", "/api/auth/owner-pin", {
    body: { email: "attacker@example.test", pin: "1111", setupToken: setupToken() },
  });
  assert.equal(r.status, 403);
  const reset = await call("POST", "/api/auth/owner-pin", { body: { email: OWNER.email, pin: "0000" } });
  assert.equal(reset.status, 403);
});

test("session id is not accepted as a Bearer token", async () => {
  const me = await call("GET", "/api/auth/me", { headers: { Authorization: `Bearer ${ownerCookie}` } });
  assert.equal(me.body.user, null);
});

test("owner PIN login: generic reply for unknown email, never creates or promotes", async () => {
  const unknown = await call("POST", "/api/auth/owner-pin-login", { body: { email: "nobody@example.test", pin: "1234" } });
  assert.equal(unknown.status, 401);
  const wrong = await call("POST", "/api/auth/owner-pin-login", { body: { email: OWNER.email, pin: "9999" } });
  assert.equal(wrong.status, 401);
  const ok = await call("POST", "/api/auth/owner-pin-login", { body: OWNER });
  assert.equal(ok.status, 200);
  assert.equal("sessionId" in ok.body, false);
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.body.userCount, 1);
});

test("signed-out visitors get no settings, and can't read or write system settings", async () => {
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.body.settings, null);
  assert.equal("ownerEmail" in me.body, false);
  assert.equal((await call("GET", "/api/system/settings")).status, 403);
  assert.equal((await call("POST", "/api/system/settings", { body: { waifuProfiles: [] } })).status, 403);
  assert.equal((await call("GET", "/api/system/settings", { cookie: ownerCookie })).status, 200);
});

test("signed-out visitors can't use the proxies, upload or delete models", async () => {
  const proxy = await call("POST", "/api/openwebui/proxy", {
    body: { baseUrl: "http://169.254.169.254", endpoint: "/models", method: "GET" },
  });
  assert.equal(proxy.status, 401);
  assert.equal((await call("POST", "/api/waifu/tts", { body: { text: "hi" } })).status, 401);
  assert.equal((await call("POST", "/api/live2d/upload-zip", { body: { zipBase64: "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==" } })).status, 403);
  assert.equal((await call("DELETE", "/api/live2d/models/tamamo")).status, 403);
});

test("/models serves only model asset types", async () => {
  const res = await fetch(base + "/models/tamamo/evil.html");
  assert.equal(res.status, 404);
});
