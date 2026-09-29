// GET/POST /api/cron/deliver: sends queued notifications. Called every minute by Supabase pg_cron
// (see schema.sql) or by Vercel Cron on a Pro plan; both send "Authorization: Bearer <CRON_SECRET>".
import { store, deliverPending, json } from "../_lib/supabase.js";

async function run(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  return json({ sent: await deliverPending(store, process.env) });
}

export const GET = run;
export const POST = run;
