// GET /api/config: the public Supabase settings the sign-in page needs (URL and publishable key).
// Both are meant to be public; the secret key is never sent.
import { json } from "./_lib/supabase.js";

export const GET = () => json({ supabaseUrl: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY });
