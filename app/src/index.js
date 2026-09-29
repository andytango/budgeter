// Budgeter: serves the PWA and its data, only to requests that Cloudflare Access has signed in.
//
// Access sits in front of the whole hostname and adds a signed JWT to every request it lets through.
// This Worker checks that JWT too, so the data stays private even if Access is ever misconfigured or
// the workers.dev address is reached directly.

import { deliverPending, sendPush } from "./push.js";

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

// D1 behind the push delivery loop in push.js.
const d1Store = (db) => ({
  async queued() {
    const { results } = await db.prepare(
      "SELECT id, title, body, url, created_at FROM notifications WHERE sent_at IS NULL AND created_at <= datetime('now') ORDER BY id LIMIT 10").all();
    return results.map((n) => ({ ...n, created_at: Date.parse(n.created_at.replace(" ", "T") + "Z") }));
  },
  async devices() { return (await db.prepare("SELECT endpoint, p256dh, auth FROM push_subs").all()).results; },
  dropDevice: (endpoint) => db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run(),
  deviceOk: (endpoint) => db.prepare("UPDATE push_subs SET last_ok = datetime('now') WHERE endpoint = ?").bind(endpoint).run(),
  markSent: (id, result) => db.prepare("UPDATE notifications SET sent_at = datetime('now'), result = ? WHERE id = ?").bind(result, id).run(),
});

const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };

export default {
  async fetch(request, env) {
    let allowed = false;
    try { allowed = await verifyAccess(request, env); } catch { allowed = false; }
    if (!allowed) return new Response("Not signed in", { status: 403, headers: noStore });

    const url = new URL(request.url);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...noStore } });

    // Push notifications: the phone subscribes here; the daily routine queues messages in D1
    // (`notifications`) and the cron below delivers them.
    if (url.pathname === "/api/push/key") return json({ key: env.VAPID_PUBLIC_KEY });
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      const sub = await request.json().catch(() => null);
      const endpoint = sub && sub.endpoint, keys = (sub && sub.keys) || {};
      if (!endpoint || !/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) return json({ error: "bad subscription" }, 400);
      await env.DB.prepare("INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth")
        .bind(endpoint, keys.p256dh, keys.auth).run();
      return json({ ok: true });
    }
    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
      const sub = await request.json().catch(() => null);
      if (sub && sub.endpoint) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(sub.endpoint).run();
      return json({ ok: true });
    }
    if (url.pathname === "/api/push/test" && request.method === "POST") {
      const sub = await request.json().catch(() => null);
      const row = sub && sub.endpoint && await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = ?").bind(sub.endpoint).first();
      if (!row) return json({ error: "not subscribed" }, 404);
      const status = await sendPush(row, { title: "Budget", body: "Notifications are on. Your daily brief will land here.", url: "/" }, env);
      return json({ status }, status >= 200 && status < 300 ? 200 : 502);
    }

    if (url.pathname === "/api/budget") {
      const row = await env.DB.prepare("SELECT body FROM docs WHERE id = 'current'").first();
      if (!row) return new Response("No budget yet", { status: 404, headers: noStore });
      return new Response(row.body, { headers: { "content-type": "application/json; charset=utf-8", ...noStore } });
    }
    return env.ASSETS.fetch(request);
  },

  // Every minute: send anything the daily routine has queued.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverPending(d1Store(env.DB), env));
  },
};
