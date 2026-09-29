// Shared helpers for the Vercel functions: Supabase's REST API (with the secret key, server side only),
// the signed-in user check, and the push delivery store. No dependencies: plain fetch.

const env = process.env;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Supabase's new secret keys (sb_secret_…) go in the apikey header only; the legacy service_role key
// is a JWT and also goes in Authorization.
function serverHeaders(extra = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  const h = { apikey: key, "content-type": "application/json", ...extra };
  if (key && key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

// PostgREST call as the server. `path` is e.g. "docs?id=eq.current&select=body".
export async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: serverHeaders(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${method} ${path.split("?")[0]}: ${res.status}`);
  return method === "GET" ? res.json() : null;
}

// The signed-in user, or null. The browser sends its Supabase access token as a bearer token; Supabase
// Auth checks it, and only addresses listed in ALLOWED_EMAILS get in (none listed = nobody).
export async function signedIn(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const allowed = (env.ALLOWED_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!allowed.length) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email && allowed.includes(user.email.toLowerCase()) ? user : null;
}

// Wraps a handler so it only runs for the signed-in owner.
export const owner = (handler) => async (request) => {
  let user = null;
  try { user = await signedIn(request); } catch { user = null; }
  if (!user) return json({ error: "not signed in" }, 401);
  return handler(request, user);
};

const q = encodeURIComponent;

// Supabase behind the push delivery loop in app/src/push.js.
export const pushStore = {
  async queued() {
    const rows = await rest(`notifications?select=id,title,body,url,created_at&sent_at=is.null&created_at=lte.${q(new Date().toISOString())}&order=id&limit=10`);
    return rows.map((n) => ({ ...n, created_at: Date.parse(n.created_at) }));
  },
  devices: () => rest("push_subs?select=endpoint,p256dh,auth"),
  dropDevice: (endpoint) => rest(`push_subs?endpoint=eq.${q(endpoint)}`, { method: "DELETE" }),
  deviceOk: (endpoint) => rest(`push_subs?endpoint=eq.${q(endpoint)}`, { method: "PATCH", body: { last_ok: new Date().toISOString() } }),
  markSent: (id, result) => rest(`notifications?id=eq.${q(id)}`, { method: "PATCH", body: { sent_at: new Date().toISOString(), result } }),
};
