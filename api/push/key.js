// GET /api/push/key: the VAPID public key the phone subscribes with.
import { owner, json } from "../_lib/supabase.js";

export const GET = owner(async () => json({ key: process.env.VAPID_PUBLIC_KEY }));
