// Turns a budget JSON file into SQL that loads it into D1 as the 'current' document (Node 18+).
//   node tools/make-seed.mjs examples/demo-budget.json > seed.sql
//   cd app && npx wrangler d1 execute budgeter-db --remote --file=../seed.sql
// seed.sql contains your budget: don't commit it.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Usage: node tools/make-seed.mjs budget.json > seed.sql"); process.exit(1); }
const body = JSON.stringify(JSON.parse(readFileSync(file, "utf8"))).replace(/'/g, "''");
process.stdout.write(
  "INSERT INTO docs (id, body, updated_at) VALUES ('current', '" + body + "', datetime('now'))\n" +
  "ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at;\n");
