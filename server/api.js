// The Budgeter API, independent of the host. A platform adapter (platforms/<name>/) does three things:
//   1. checks the request is from a signed-in, allowed user (before calling handleApi),
//   2. passes a `store` object backed by its database,
//   3. calls deliverPending(store, env) every minute (see push.js).
//
// store (every method async):
//   budget()                 → the budget document (JSON text or object), or null if none yet
//   saveDevice({endpoint, p256dh, auth})   insert or update a push subscription
//   device(endpoint)         → {endpoint, p256dh, auth} or null
//   removeDevice(endpoint)
//   devices()                → [{endpoint, p256dh, auth}]
//   deviceOk(endpoint)       record a successful push (last_ok = now)
//   queued()                 → up to 10 unsent notifications that are due, oldest first:
//                              [{id, title, body, url, created_at (ms since epoch)}]
//   markSent(id, result)     sent_at = now, result = text
// env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK (JSON text), VAPID_SUBJECT.
import { sendPush } from "./push.js";
export { deliverPending } from "./push.js";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

// Answers /api/* requests. Returns null for any other path, so the platform can serve the app.
export async function handleApi(request, store, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  const body = () => request.json().catch(() => null);

  if (pathname === "/api/budget" && method === "GET") {
    const doc = await store.budget();
    if (doc == null) return json({ error: "No budget yet" }, 404);
    return new Response(typeof doc === "string" ? doc : JSON.stringify(doc), { headers });
  }
  // Push notifications: the phone subscribes here; queued notifications go out via deliverPending.
  if (pathname === "/api/push/key" && method === "GET") return json({ key: env.VAPID_PUBLIC_KEY });
  if (pathname === "/api/push/subscribe" && method === "POST") {
    const sub = await body();
    const endpoint = sub && sub.endpoint, keys = (sub && sub.keys) || {};
    if (!endpoint || !/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) return json({ error: "bad subscription" }, 400);
    await store.saveDevice({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return json({ ok: true });
  }
  if (pathname === "/api/push/unsubscribe" && method === "POST") {
    const sub = await body();
    if (sub && sub.endpoint) await store.removeDevice(sub.endpoint);
    return json({ ok: true });
  }
  if (pathname === "/api/push/test" && method === "POST") {
    const sub = await body();
    const device = sub && sub.endpoint ? await store.device(sub.endpoint) : null;
    if (!device) return json({ error: "not subscribed" }, 404);
    const status = await sendPush(device, { title: "Budget", body: "Notifications are on. Your daily brief will land here.", url: "/" }, env);
    return json({ status }, status >= 200 && status < 300 ? 200 : 502);
  }
  if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
  return null;
}
