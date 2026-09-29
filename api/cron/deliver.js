// GET/POST /api/cron/deliver: sends queued notifications. Called every minute by Supabase pg_cron (see
// platforms/vercel-supabase/schema.sql) or by Vercel Cron on a Pro plan. Both send
// "Authorization: Bearer <CRON_SECRET>".
import { json, pushStore } from "../_lib/supabase.js";
import { deliverPending } from "../../app/src/push.js";

async function run(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  const sent = await deliverPending(pushStore, process.env);
  return json({ sent });
}

export const GET = run;
export const POST = run;
