// POST /api/push/unsubscribe: forgets this phone.
import { owner, rest, json } from "../_lib/supabase.js";

export const POST = owner(async (request) => {
  const sub = await request.json().catch(() => null);
  if (sub && sub.endpoint) await rest(`push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
  return json({ ok: true });
});
