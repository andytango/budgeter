// Web Push for the Budget Panel: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291),
// written against WebCrypto so it runs in a Worker with no dependencies.

const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const unb64url = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
};

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// Encrypts `payload` for one subscription (keys.p256dh, keys.auth), returning the request body.
export async function encrypt(payload, p256dh, auth, { salt, localKeys } = {}) {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);
  const local = localKeys || (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last (only) record, no padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// VAPID Authorization header for a push service origin.
export async function vapidAuth(endpoint, publicKey, privateJwk, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${publicKey}`;
}

// Sends one message to one subscription. Returns the push service's HTTP status.
export async function sendPush(sub, message, env) {
  const body = await encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint, env.VAPID_PUBLIC_KEY, JSON.parse(env.VAPID_PRIVATE_JWK), env.VAPID_SUBJECT),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

// Delivers every queued notification (the daily routine inserts rows into `notifications`) to every
// subscribed device. A row with a future created_at (UTC) waits until then, so reminders can be
// scheduled. Messages more than a day old are skipped rather than sent late.
export async function deliverPending(env) {
  const { results: queued } = await env.DB.prepare(
    "SELECT id, title, body, url, created_at FROM notifications WHERE sent_at IS NULL AND created_at <= datetime('now') ORDER BY id LIMIT 10").all();
  if (!queued.length) return 0;
  const { results: subs } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subs").all();
  for (const n of queued) {
    const stale = Date.parse(n.created_at.replace(" ", "T") + "Z") < Date.now() - 24 * 3600 * 1000;
    const results = [];
    if (!stale) {
      for (const s of subs) {
        let status = 0;
        try { status = await sendPush(s, { title: n.title, body: n.body, url: n.url || "/" }, env); } catch { status = -1; }
        results.push(status);
        if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(s.endpoint).run();
        else if (status >= 200 && status < 300) await env.DB.prepare("UPDATE push_subs SET last_ok = datetime('now') WHERE endpoint = ?").bind(s.endpoint).run();
      }
    }
    await env.DB.prepare("UPDATE notifications SET sent_at = datetime('now'), result = ? WHERE id = ?")
      .bind(stale ? "stale" : subs.length ? results.join(",") : "no devices", n.id).run();
  }
  return queued.length;
}
