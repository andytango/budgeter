// The generated Vercel + Supabase app against a fake Supabase (Auth + PostgREST subset): sign-in checks,
// the API, push delivery, and (if Playwright is installed) the emailed-code sign-in in a real browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { createApp, vapidEnv, phoneKeys, pushService, repo } from "./helpers.mjs";

const app = createApp("vercel-supabase");

// ── Fake Supabase ────────────────────────────────────────────────────────────────────────────────
const db = { docs: [], push_subs: [], notifications: [] };
const users = { "owner@example.com": "tok-owner", "other@example.com": "tok-other" };
const CODE = "123456", log = [];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey, authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, DELETE" };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const send = (res, status, data) => { res.writeHead(status, { "content-type": "application/json", ...CORS }); res.end(data === undefined ? "" : JSON.stringify(data)); };
function filter(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
    const [op, ...rest] = v.split("."), val = rest.join(".");
    out = out.filter((r) => op === "eq" ? String(r[k]) === val : op === "is" ? r[k] == null : op === "lte" ? Date.parse(r[k]) <= Date.parse(val) : true);
  }
  if (params.get("order") === "id") out = [...out].sort((a, b) => a.id - b.id);
  if (params.get("limit")) out = out.slice(0, +params.get("limit"));
  const sel = params.get("select");
  return sel ? out.map((r) => Object.fromEntries(sel.split(",").map((c) => [c, r[c]]))) : out;
}
const supabase = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), b = await readBody(req);
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  log.push(`${req.method} ${u.pathname} apikey=${req.headers.apikey} auth=${req.headers.authorization || "-"}`);
  if (u.pathname.startsWith("/auth/v1/")) {
    if (req.headers.apikey !== "sb_publishable_test") return send(res, 401, { msg: "bad apikey" });
    const p = u.pathname.slice(9), j = b ? JSON.parse(b) : {};
    if (p === "user") {
      const t = (req.headers.authorization || "").slice(7);
      const email = Object.keys(users).find((e) => users[e] === t || users[e] + "-r" === t);
      return email ? send(res, 200, { email }) : send(res, 401, { msg: "bad jwt" });
    }
    if (p === "otp") return users[j.email] && j.create_user === false ? send(res, 200, {}) : send(res, 422, { msg: "Signups not allowed" });
    if (p === "verify") return j.token === CODE && users[j.email]
      ? send(res, 200, { access_token: users[j.email], refresh_token: "r-" + j.email, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : send(res, 403, { msg: "Token has expired or is invalid" });
    if (p === "token") return send(res, 200, { access_token: users[j.refresh_token.slice(2)] + "-r", refresh_token: j.refresh_token, expires_in: 3600 });
  }
  if (u.pathname.startsWith("/rest/v1/")) {
    if (req.headers.apikey !== "sb_secret_test" || req.headers.authorization) return send(res, 401, { msg: "bad server key" });
    const table = u.pathname.slice(9), rows = db[table];
    if (req.method === "GET") return send(res, 200, filter(rows, u.searchParams));
    if (req.method === "POST") {
      const row = JSON.parse(b), i = rows.findIndex((r) => r.endpoint === row.endpoint);
      if (i >= 0 && (req.headers.prefer || "").includes("merge-duplicates")) Object.assign(rows[i], row); else rows.push(row);
      return send(res, 201);
    }
    const hits = filter(rows, new URLSearchParams([...u.searchParams].filter(([k]) => k !== "select")));
    const same = (a, r) => (a.id !== undefined ? a.id === r.id : a.endpoint === r.endpoint);
    if (req.method === "PATCH") { const patch = JSON.parse(b); for (const r of rows) if (hits.some((h) => same(h, r))) Object.assign(r, patch); return send(res, 204); }
    if (req.method === "DELETE") { db[table] = rows.filter((r) => !hits.some((h) => same(h, r))); return send(res, 204); }
  }
  send(res, 404, { msg: "nope" });
});
await new Promise((r) => supabase.listen(0, "127.0.0.1", r));

Object.assign(process.env, {
  SUPABASE_URL: `http://127.0.0.1:${supabase.address().port}`, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test", ALLOWED_EMAILS: "Owner@example.com", CRON_SECRET: "cron-test", ...(await vapidEnv()),
});

// ── A tiny stand-in for Vercel: static files from public/, /api/* to the function modules ──────────
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const vercel = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const file = join(app, u.pathname + ".js");
    if (!existsSync(file)) { res.writeHead(404); return res.end(); }
    const handler = (await import(file))[req.method];
    if (!handler) { res.writeHead(405); return res.end(); }
    const b = await readBody(req);
    const r = await handler(new Request(u.href, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : b }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const f = join(app, "public", u.pathname === "/" ? "index.html" : u.pathname);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => vercel.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${vercel.address().port}`;
const push = await pushService();
const keys = await phoneKeys();
const as = (tok) => ({ Authorization: "Bearer " + tok, "content-type": "application/json" });
const post = (path, body, tok = "tok-owner") => fetch(base + path, { method: "POST", headers: as(tok), body: JSON.stringify(body) });

db.docs.push({ id: "current", body: JSON.parse(readFileSync(join(repo, "examples", "demo-budget.json"), "utf8")) });
test.after(() => { supabase.close(); vercel.close(); push.close(); });

test("budget needs an allowed, signed-in user", async () => {
  assert.equal((await fetch(base + "/api/budget")).status, 401);
  assert.equal((await fetch(base + "/api/budget", { headers: as("tok-other") })).status, 401);
  const r = await fetch(base + "/api/budget", { headers: as("tok-owner") });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).periodStart, "2026-09-24");
});

test("config endpoint is public and carries no secret", async () => {
  const c = await (await fetch(base + "/api/config")).json();
  assert.deepEqual(c, { supabaseUrl: process.env.SUPABASE_URL, publishableKey: "sb_publishable_test" });
});

test("server calls use the secret key in apikey only", () => {
  const restCalls = log.filter((l) => l.includes("/rest/v1/"));
  assert.ok(restCalls.length > 0);
  assert.ok(restCalls.every((l) => l.includes("apikey=sb_secret_test") && l.includes("auth=-")));
});

test("push subscribe, upsert, unsubscribe", async () => {
  assert.equal((await (await fetch(base + "/api/push/key", { headers: as("tok-owner") })).json()).key, process.env.VAPID_PUBLIC_KEY);
  assert.equal((await post("/api/push/subscribe", { endpoint: "http://insecure", keys })).status, 400);
  assert.equal((await post("/api/push/subscribe", { endpoint: "https://push.example/a", keys }, "tok-other")).status, 401);
  assert.equal((await post("/api/push/subscribe", { endpoint: "https://push.example/a", keys })).status, 200);
  await post("/api/push/subscribe", { endpoint: "https://push.example/a", keys: { ...keys, auth: "changed" } });
  assert.equal(db.push_subs.length, 1);
  assert.equal(db.push_subs[0].auth, "changed");
  await post("/api/push/unsubscribe", { endpoint: "https://push.example/a" });
  assert.equal(db.push_subs.length, 0);
});

test("test push and cron delivery", async () => {
  db.push_subs.push({ endpoint: push.url + "/live", ...keys }, { endpoint: push.url + "/gone", ...keys });
  const t = await post("/api/push/test", { endpoint: push.url + "/live" });
  assert.equal(t.status, 200);
  assert.equal(push.received.at(-1).encoding, "aes128gcm");

  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  db.notifications.push(
    { id: 1, title: "Budget", body: "due", url: "/", created_at: iso(-60e3), sent_at: null },
    { id: 2, title: "Budget", body: "later", url: "/", created_at: iso(3600e3), sent_at: null },
    { id: 3, title: "Budget", body: "old", url: "/", created_at: iso(-2 * 86400e3), sent_at: null });
  assert.equal((await fetch(base + "/api/cron/deliver")).status, 403);
  assert.equal((await fetch(base + "/api/cron/deliver", { headers: { Authorization: "Bearer wrong" } })).status, 403);
  push.received.length = 0;
  const r = await fetch(base + "/api/cron/deliver", { method: "POST", headers: { Authorization: "Bearer cron-test" } });
  assert.deepEqual(await r.json(), { sent: 2 });
  const n = Object.fromEntries(db.notifications.map((x) => [x.id, x]));
  assert.equal(n[1].result, "201,410");
  assert.equal(n[2].sent_at, null);
  assert.equal(n[3].result, "stale");
  assert.equal(push.received.length, 2);
  assert.deepEqual(db.push_subs.map((d) => d.endpoint), [push.url + "/live"]);
  assert.ok(db.push_subs[0].last_ok);
});

// ── Browser sign-in (optional: needs Playwright) ─────────────────────────────────────────────────
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch {}
test("emailed-code sign-in in a browser", { skip: !chromium && "Playwright not installed (npm i -D playwright)" }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(base + "/");
    await page.waitForSelector("form.signin");
    await page.fill("#si-in", "stranger@example.com"); await page.click("button[type=submit]");
    await page.waitForSelector(".signin .msg");
    await page.fill("#si-in", "owner@example.com"); await page.click("button[type=submit]");
    await page.waitForSelector("text=We sent a code");
    await page.fill("#si-in", "000000"); await page.click("button[type=submit]");
    await page.waitForSelector(".signin .msg");
    await page.fill("#si-in", CODE); await page.click("button[type=submit]");
    await page.waitForSelector(".summary");
    await page.reload(); await page.waitForSelector(".summary");
    assert.equal(await page.$("form.signin"), null, "stays signed in after reload");
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("budget-session")); s.expires_at = 1; localStorage.setItem("budget-session", JSON.stringify(s)); });
    log.length = 0;
    await page.reload(); await page.waitForSelector(".summary");
    assert.ok(log.some((l) => l.includes("/auth/v1/token")), "expired token is refreshed");
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("budget-session")); s.access_token = "junk"; s.expires_at = 9e9; localStorage.setItem("budget-session", JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector("form.signin");
  } finally { await browser.close(); }
});
