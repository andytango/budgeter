// The tools an agent runs: validate, make-seed, create.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repo, createApp } from "./helpers.mjs";

const tool = (name, ...args) => spawnSync(process.execPath, [join(repo, "tools", name), ...args], { encoding: "utf8" });
const demo = join(repo, "examples", "demo-budget.json");

test("the demo budget validates with no warnings", () => {
  const r = tool("validate.mjs", demo);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /OK \(0 warning/);
});

test("validate catches broken documents", () => {
  const d = JSON.parse(readFileSync(demo, "utf8"));
  d.balance -= 40;
  d.plan.expenses[0].weekly = 3;
  d.expenses[0].items[0].debt = "Nope";
  const f = join(mkdtempSync(join(tmpdir(), "budgeter-")), "bad.json");
  writeFileSync(f, JSON.stringify(d));
  const r = tool("validate.mjs", f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /exactly one of day, weekly, payday, date/);
  assert.match(r.stdout, /debt "Nope" isn't in debts/);
  assert.match(r.stdout, /unexplained gap of £40\.00/);
});

test("make-seed writes SQLite and Postgres", () => {
  const sqlite = tool("make-seed.mjs", demo).stdout;
  assert.match(sqlite, /^INSERT INTO docs/);
  const pg = tool("make-seed.mjs", demo, "--postgres").stdout;
  assert.match(pg, /^insert into docs \(id, body\) values \('current', \$budget\$\{/);
  assert.match(pg, /\$budget\$::jsonb\)/);
});

test("create makes self-contained apps and refuses unsafe targets", () => {
  for (const platform of ["cloudflare", "vercel-supabase"]) {
    const dir = createApp(platform);
    assert.ok(existsSync(join(dir, "public", "panel.js")));
    assert.ok(existsSync(join(dir, "BUDGETER.md")));
    const imports = spawnSync("grep", ["-rEl", String.raw`from ["'](\.\./)+server/`, dir], { encoding: "utf8" }).stdout.trim();
    assert.equal(imports, "", "no imports point back into the Budgeter repo");
  }
  const vs = createApp("vercel-supabase");
  assert.match(readFileSync(join(vs, "public", "auth.js"), "utf8"), /emails you a one-time code/, "Supabase sign-in swapped in");
  assert.notEqual(tool("create.mjs", "cloudflare", join(repo, "tmp-app")).status, 0, "refuses to write inside this repo");
  assert.notEqual(tool("create.mjs", "nowhere", "/tmp/x").status, 0, "rejects unknown platforms");
});
