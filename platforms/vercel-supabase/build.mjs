// Vercel build: copies the shared app (app/public) to dist/ and swaps in the Supabase sign-in,
// filled in with the project's public Supabase settings. Run by Vercel (see vercel.json); locally:
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node platforms/vercel-supabase/build.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the Vercel project's environment variables.");
  process.exit(1);
}
if (/^eyJ/.test(SUPABASE_PUBLISHABLE_KEY) && JSON.parse(Buffer.from(SUPABASE_PUBLISHABLE_KEY.split(".")[1], "base64url")).role !== "anon") {
  console.error("SUPABASE_PUBLISHABLE_KEY must be the publishable (or legacy anon) key, never the secret one: it's sent to the browser.");
  process.exit(1);
}
if (/^sb_secret_/.test(SUPABASE_PUBLISHABLE_KEY)) {
  console.error("SUPABASE_PUBLISHABLE_KEY is a secret key. Use the publishable key: it's sent to the browser.");
  process.exit(1);
}

const dist = new URL("dist/", root);
rmSync(dist, { recursive: true, force: true });
cpSync(new URL("app/public/", root), dist, { recursive: true });
const auth = readFileSync(new URL("platforms/vercel-supabase/auth.js", root), "utf8")
  .replace("%%SUPABASE_URL%%", SUPABASE_URL.replace(/\/+$/, ""))
  .replace("%%SUPABASE_PUBLISHABLE_KEY%%", SUPABASE_PUBLISHABLE_KEY);
writeFileSync(new URL("auth.js", dist), auth);
console.log("Built dist/ for Vercel + Supabase.");
