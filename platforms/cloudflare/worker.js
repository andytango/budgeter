// Budgeter on Cloudflare: a Worker that serves the app and its API, only to requests that Cloudflare
// Access has signed in, with the data in D1.
//
// Access sits in front of the whole hostname and adds a signed JWT to every request it lets through.
// This Worker checks that JWT too, so the data stays private even if Access is ever misconfigured or
// the workers.dev address is reached directly.

import { handleApi, deliverPending } from "../../server/api.js";

let jwksCache = { keys: null, fetchedAt: 0 };

const b64urlToBytes = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function accessKeys(teamDomain) {
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("certs");
  const { keys } = await res.json();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyAccess(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return false;
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") return false;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return false;
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  return auds.includes(env.ACCESS_AUD) && payload.exp > now && payload.iss === env.ACCESS_TEAM_DOMAIN;
}

// D1 storage adapter (the interface is described at the top of api.js).
const d1Store = (db) => ({
  async budget() { const row = await db.prepare("SELECT body FROM docs WHERE id = 'current'").first(); return row ? row.body : null; },
  saveDevice: ({ endpoint, p256dh, auth }) => db.prepare(
    "INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth")
    .bind(endpoint, p256dh, auth).run(),
  device: (endpoint) => db.prepare("SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = ?").bind(endpoint).first(),
  removeDevice: (endpoint) => db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run(),
  async devices() { return (await db.prepare("SELECT endpoint, p256dh, auth FROM push_subs").all()).results; },
  deviceOk: (endpoint) => db.prepare("UPDATE push_subs SET last_ok = datetime('now') WHERE endpoint = ?").bind(endpoint).run(),
  async queued() {
    const { results } = await db.prepare(
      "SELECT id, title, body, url, created_at FROM notifications WHERE sent_at IS NULL AND created_at <= datetime('now') ORDER BY id LIMIT 10").all();
    return results.map((n) => ({ ...n, created_at: Date.parse(n.created_at.replace(" ", "T") + "Z") }));
  },
  markSent: (id, result) => db.prepare("UPDATE notifications SET sent_at = datetime('now'), result = ? WHERE id = ?").bind(result, id).run(),
});

export default {
  async fetch(request, env) {
    let allowed = false;
    try { allowed = await verifyAccess(request, env); } catch { allowed = false; }
    if (!allowed) return new Response("Not signed in", { status: 403, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
    return (await handleApi(request, d1Store(env.DB), env)) || env.ASSETS.fetch(request);
  },

  // Every minute (wrangler.jsonc triggers): send anything queued in `notifications`.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverPending(d1Store(env.DB), env));
  },
};
