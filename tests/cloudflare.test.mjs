// The generated Cloudflare Worker: Access token checks, the API over a fake D1, and push delivery.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, vapidEnv, phoneKeys, pushService, b64u } from "./helpers.mjs";

const app = createApp("cloudflare");
const { default: worker } = await import(app + "/src/worker.js");

// Cloudflare Access: a signing key, its JWKS served from the "team domain", and tokens.
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256" };
const certs = http.createServer((q, r) => { r.writeHead(200, { "content-type": "application/json" }); r.end(JSON.stringify({ keys: [jwk] })); });
await new Promise((r) => certs.listen(0, "127.0.0.1", r));
const TEAM = `http://127.0.0.1:${certs.address().port}`, AUD = "aud-test";
async function token(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
const good = await token({ aud: [AUD], iss: TEAM, exp: now + 600 });

// A fake D1 that records statements.
const push = await pushService();
const keys = await phoneKeys();
const devices = [{ endpoint: push.url + "/live", ...keys }, { endpoint: push.url + "/gone", ...keys }];
const due = new Date(Date.now() - 60e3).toISOString().slice(0, 19).replace("T", " ");
const sql = [];
const DB = { prepare(q) {
  const st = { args: [], bind(...a) { st.args = a; return st; },
    async first() { sql.push(q); return q.includes("FROM docs") ? { body: '{"asOf":"2026-10-09"}' } : devices.find((d) => d.endpoint === st.args[0]) || null; },
    async all() { sql.push(q); return { results: q.includes("FROM notifications")
      ? [{ id: 7, title: "Budget", body: "due", url: "/", created_at: due }, { id: 8, title: "Budget", body: "old", url: "/", created_at: "2020-01-01 00:00:00" }]
      : devices }; },
    async run() { sql.push(q + " | " + JSON.stringify(st.args)); } };
  return st;
} };
let assetHits = 0;
const env = { DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...(await vapidEnv()),
  ASSETS: { fetch: async () => { assetHits++; return new Response("<html></html>", { headers: { "content-type": "text/html" } }); } } };
const call = (path, tok, init = {}) => worker.fetch(new Request("https://budget.example.com" + path,
  { ...init, headers: { ...(tok ? { "Cf-Access-Jwt-Assertion": tok } : {}), ...(init.headers || {}) } }), env);

test.after(() => { certs.close(); push.close(); });

test("refuses requests without a valid Access token", async () => {
  assert.equal((await call("/api/budget")).status, 403);
  assert.equal((await call("/", "not.a.token")).status, 403);
  assert.equal((await call("/api/budget", await token({ aud: ["other"], iss: TEAM, exp: now + 600 }))).status, 403);
  assert.equal((await call("/api/budget", await token({ aud: [AUD], iss: TEAM, exp: now - 5 }))).status, 403);
  assert.equal((await call("/api/budget", await token({ aud: [AUD], iss: "https://evil.example", exp: now + 600 }))).status, 403);
});

test("serves the budget and the app to a signed-in user", async () => {
  const r = await call("/api/budget", good);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).asOf, "2026-10-09");
  assert.equal((await call("/", good)).status, 200);
  assert.equal(assetHits, 1);
  assert.equal((await call("/api/nope", good)).status, 404);
});

test("push subscribe and test", async () => {
  assert.equal((await (await call("/api/push/key", good)).json()).key, env.VAPID_PUBLIC_KEY);
  const bad = await call("/api/push/subscribe", good, { method: "POST", body: JSON.stringify({ endpoint: "http://insecure", keys }) });
  assert.equal(bad.status, 400);
  const ok = await call("/api/push/subscribe", good, { method: "POST", body: JSON.stringify({ endpoint: "https://push.example/a", keys }) });
  assert.equal(ok.status, 200);
  assert.ok(sql.some((s) => s.startsWith("INSERT INTO push_subs") && s.includes("https://push.example/a")));
  const t = await call("/api/push/test", good, { method: "POST", body: JSON.stringify({ endpoint: push.url + "/live" }) });
  assert.equal(t.status, 200);
  assert.equal(push.received.at(-1).encoding, "aes128gcm");
  assert.match(push.received.at(-1).auth, /^vapid t=.+, k=/);
});

test("cron delivers due notifications, drops dead devices, skips stale ones", async () => {
  push.received.length = 0;
  let p;
  await worker.scheduled({}, env, { waitUntil: (x) => (p = x) });
  await p;
  assert.equal(push.received.length, 2);
  assert.ok(sql.some((s) => s.startsWith("DELETE FROM push_subs") && s.includes("/gone")));
  assert.ok(sql.some((s) => s.startsWith("UPDATE notifications") && s.includes('["201,410",7]')));
  assert.ok(sql.some((s) => s.startsWith("UPDATE notifications") && s.includes('["stale",8]')));
});
