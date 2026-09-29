// POST /api/push/subscribe: saves (or refreshes) this phone's push subscription.
import { owner, rest, json } from "../_lib/supabase.js";

export const POST = owner(async (request) => {
  const sub = await request.json().catch(() => null);
  const endpoint = sub && sub.endpoint, keys = (sub && sub.keys) || {};
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) return json({ error: "bad subscription" }, 400);
  await rest("push_subs?on_conflict=endpoint", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  return json({ ok: true });
});
