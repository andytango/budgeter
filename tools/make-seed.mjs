// Turns a budget JSON file into SQL that stores it as the 'current' document (Node 20+).
//   node tools/make-seed.mjs budget.json            > seed.sql   (D1 / SQLite, for Cloudflare)
//   node tools/make-seed.mjs budget.json --postgres > seed.sql   (Supabase)
// Cloudflare: npx wrangler d1 execute budgeter-db --remote --file=seed.sql
// Supabase:   run it in the SQL editor, or POST it to the Management API's database/query endpoint.
// seed.sql contains the user's budget: never commit it, and delete it afterwards.
import { readFileSync } from "node:fs";

const [file, flag] = process.argv.slice(2);
if (!file || (flag && flag !== "--postgres")) { console.error("Usage: node tools/make-seed.mjs budget.json [--postgres] > seed.sql"); process.exit(1); }
const json = JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
if (flag === "--postgres") {
  let tag = "$budget$";
  while (json.includes(tag)) tag = "$budget" + Math.random().toString(36).slice(2, 8) + "$";
  process.stdout.write(`insert into docs (id, body) values ('current', ${tag}${json}${tag}::jsonb)\non conflict (id) do update set body = excluded.body;\n`);
} else {
  process.stdout.write(
    "INSERT INTO docs (id, body, updated_at) VALUES ('current', '" + json.replace(/'/g, "''") + "', datetime('now'))\n" +
    "ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at;\n");
}
