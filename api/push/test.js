// POST /api/push/test: sends a test notification to this phone.
import { owner, rest, json } from "../_lib/supabase.js";
import { sendPush } from "../../app/src/push.js";

export const POST = owner(async (request) => {
  const sub = await request.json().catch(() => null);
  const rows = sub && sub.endpoint ? await rest(`push_subs?select=endpoint,p256dh,auth&endpoint=eq.${encodeURIComponent(sub.endpoint)}`) : [];
  if (!rows.length) return json({ error: "not subscribed" }, 404);
  const status = await sendPush(rows[0], { title: "Budget", body: "Notifications are on. Your daily brief will land here.", url: "/" }, process.env);
  return json({ status }, status >= 200 && status < 300 ? 200 : 502);
});
