// Budgeter on Vercel + Supabase: the storage adapter and sign-in check shared by the functions in api/.
// Talks to Supabase's REST API with fetch (no dependencies). The secret key stays on the server.
import { handleApi, deliverPending, json } from "../../../../server/api.js";

const env = process.env;
const q = encodeURIComponent;

// Supabase's new secret keys (sb_secret_…) go in the apikey header only; a legacy service_role key is
// a JWT and also goes in Authorization.
function serverHeaders(extra = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  const h = { apikey: key, "content-type": "application/json", ...extra };
  if (key && key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

// PostgREST call as the server, e.g. rest("docs?id=eq.current&select=body").
async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: serverHeaders(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${method} ${path.split("?")[0]}: ${res.status}`);
  return method === "GET" ? res.json() : null;
}

// Storage adapter (the interface is described at the top of api.js).
export const store = {
  async budget() { const rows = await rest("docs?id=eq.current&select=body"); return rows.length ? rows[0].body : null; },
  saveDevice: (d) => rest("push_subs?on_conflict=endpoint", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: d }),
  async device(endpoint) { const rows = await rest(`push_subs?select=endpoint,p256dh,auth&endpoint=eq.${q(endpoint)}`); return rows[0] || null; },
  removeDevice: (endpoint) => rest(`push_subs?endpoint=eq.${q(endpoint)}`, { method: "DELETE" }),
  devices: () => rest("push_subs?select=endpoint,p256dh,auth"),
  deviceOk: (endpoint) => rest(`push_subs?endpoint=eq.${q(endpoint)}`, { method: "PATCH", body: { last_ok: new Date().toISOString() } }),
  async queued() {
    const rows = await rest(`notifications?select=id,title,body,url,created_at&sent_at=is.null&created_at=lte.${q(new Date().toISOString())}&order=id&limit=10`);
    return rows.map((n) => ({ ...n, created_at: Date.parse(n.created_at) }));
  },
  markSent: (id, result) => rest(`notifications?id=eq.${q(id)}`, { method: "PATCH", body: { sent_at: new Date().toISOString(), result } }),
};

// The signed-in user, or null. The browser sends its Supabase access token as a bearer token; Supabase
// Auth checks it, and only addresses in ALLOWED_EMAILS get in (none listed = nobody).
async function signedIn(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const allowed = (env.ALLOWED_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!allowed.length) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth } });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email && allowed.includes(user.email.toLowerCase()) ? user : null;
}

// Handler for every /api/* function except config and cron: sign-in check, then the shared API.
export async function route(request) {
  let user = null;
  try { user = await signedIn(request); } catch { user = null; }
  if (!user) return json({ error: "not signed in" }, 401);
  return (await handleApi(request, store, env)) || json({ error: "not found" }, 404);
}

export { deliverPending, json };
