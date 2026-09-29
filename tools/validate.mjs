// Checks a budget document against docs/data-model.md before it's loaded or written (Node 20+).
//   node tools/validate.mjs budget.json
// Errors (exit 1): anything the app can't render or project correctly. Warnings: an unexplained gap
// (shown in the app as "Spending not itemised yet") and other things worth a look.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Usage: node tools/validate.mjs budget.json"); process.exit(2); }
const doc = JSON.parse(readFileSync(file, "utf8"));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isNum = (n) => typeof n === "number" && isFinite(n);
const money = (n) => "£" + n.toFixed(2);

const debtNames = new Set((doc.debts || []).map((d) => d.name));

function groups(list, where, { history = false } = {}) {
  if (!Array.isArray(list)) { err(`${where} must be an array of groups`); return []; }
  let disc = 0;
  list.forEach((g, gi) => {
    const at = `${where}[${gi}]` + (g && g.group ? ` "${g.group}"` : "");
    if (!g || typeof g.group !== "string") err(`${at}: needs a "group" name`);
    if (g && g.discretionary) disc++;
    if (!g || !Array.isArray(g.items)) { err(`${at}: needs an "items" array`); return; }
    g.items.forEach((i, ii) => {
      const it = `${at}.items[${ii}]` + (i && i.name ? ` "${i.name}"` : "");
      if (!i || typeof i.name !== "string" || !i.name) err(`${it}: needs a name`);
      if (!i || !isNum(i.amount)) err(`${it}: amount must be a number`);
      if (i && i.due !== undefined && !isDate(i.due)) err(`${it}: due must be YYYY-MM-DD`);
      if (i && i.debt !== undefined && !debtNames.has(i.debt)) err(`${it}: debt "${i.debt}" isn't in debts`);
      if (history && i && !i.done) warn(`${it}: history items should all be done`);
    });
  });
  if (disc > 1) err(`${where}: more than one discretionary group`);
  return list;
}
const total = (gs, pred = () => true) => gs.reduce((s, g) => s + (g.items || []).filter(pred).reduce((t, i) => t + (Number(i.amount) || 0), 0), 0);
// The same gap the app shows as "not itemised yet": opening + income so far − spending so far − balance.
const gapOf = (p, inc, exp) => p.opening + total(inc, (i) => i.done) - total(exp, (i) => i.done) - p.balance;

// Top level
for (const k of ["asOf", "periodStart", "periodEnd", "payday"]) if (!isDate(doc[k])) err(`${k} must be a YYYY-MM-DD date`);
for (const k of ["opening", "balance"]) if (!isNum(doc[k])) err(`${k} must be a number`);
if (isDate(doc.periodStart) && isDate(doc.periodEnd) && doc.periodStart >= doc.periodEnd) err("periodStart must be before periodEnd");
if (isDate(doc.periodEnd) && isDate(doc.payday) && doc.payday <= doc.periodEnd) warn("payday is normally the day after periodEnd");
const inc = groups(doc.income, "income"), exp = groups(doc.expenses, "expenses");
if (!exp.some((g) => g.discretionary)) warn('no expense group has "discretionary": true (the app will add one for any gap)');
if (isNum(doc.opening) && isNum(doc.balance)) {
  const gap = gapOf(doc, inc, exp);
  if (Math.abs(gap) >= 0.5) warn(`current period has an unexplained gap of ${money(gap)}: itemise the missing ${gap > 0 ? "spending" : "refunds"}`);
}

// Debts
(doc.debts || []).forEach((d, i) => {
  const at = `debts[${i}]` + (d && d.name ? ` "${d.name}"` : "");
  if (!d || typeof d.name !== "string") err(`${at}: needs a name`);
  for (const k of ["apr", "monthly", "balance", "start"]) if (d && d[k] !== undefined && !isNum(d[k])) err(`${at}: ${k} must be a number`);
  if (d && !isNum(d.balance)) err(`${at}: balance is required`);
  if (d && !isNum(d.apr)) warn(`${at}: no apr, so projections won't add interest`);
});

// Plan
const plan = doc.plan || {};
if (!doc.plan) warn("no plan: future periods will be empty");
for (const side of ["income", "expenses"]) (plan[side] || []).forEach((p, i) => {
  const at = `plan.${side}[${i}]` + (p && p.name ? ` "${p.name}"` : "");
  if (!p || typeof p.group !== "string" || typeof p.name !== "string") err(`${at}: needs group and name`);
  if (!p || !isNum(p.amount)) err(`${at}: amount must be a number`);
  const schedules = ["day", "weekly", "payday", "date"].filter((k) => p && p[k] !== undefined);
  if (schedules.length !== 1) err(`${at}: needs exactly one of day, weekly, payday, date (has ${schedules.join(", ") || "none"})`);
  if (p && p.day !== undefined && !(Number.isInteger(p.day) && p.day >= 1 && p.day <= 31)) err(`${at}: day must be 1–31`);
  if (p && p.weekly !== undefined && !(Number.isInteger(p.weekly) && p.weekly >= 0 && p.weekly <= 6)) err(`${at}: weekly must be 0 (Sun) to 6 (Sat)`);
  if (p && p.date !== undefined && !isDate(p.date)) err(`${at}: date must be YYYY-MM-DD`);
  for (const k of ["from", "until"]) if (p && p[k] !== undefined && !isDate(p[k])) err(`${at}: ${k} must be YYYY-MM-DD`);
  if (p && p.months !== undefined && !(Array.isArray(p.months) && p.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12))) err(`${at}: months must be numbers 1–12`);
  if (p && p.debt !== undefined && !debtNames.has(p.debt)) err(`${at}: debt "${p.debt}" isn't in debts`);
  if (p && /discretionary/i.test(p.group)) warn(`${at}: the plan shouldn't forecast discretionary spending`);
});

// Alerts
(doc.alerts || []).forEach((a, i) => {
  if (!a || !isDate(a.date) || !["action", "good", "info"].includes(a.kind) || typeof a.text !== "string") err(`alerts[${i}]: needs date, kind (action | good | info) and text`);
  else if (a.text.length > 70) warn(`alerts[${i}]: keep text under ~50 characters`);
});

// History: oldest first, each period chaining to the next, every one itemised.
let prevEnd = null, prevBalance = null;
(doc.history || []).forEach((h, i) => {
  const at = `history[${i}] (${h && h.periodStart})`;
  for (const k of ["periodStart", "periodEnd"]) if (!h || !isDate(h[k])) err(`${at}: ${k} must be a date`);
  for (const k of ["opening", "balance"]) if (!h || !isNum(h[k])) err(`${at}: ${k} must be a number`);
  if (!h) return;
  const hi = groups(h.income, `${at}.income`, { history: true }), he = groups(h.expenses, `${at}.expenses`, { history: true });
  if (isNum(h.opening) && isNum(h.balance)) {
    const gap = gapOf(h, hi, he);
    if (Math.abs(gap) >= 0.5) warn(`${at}: unexplained gap of ${money(gap)}`);
  }
  if (prevEnd && h.periodStart < prevEnd) err(`${at}: overlaps the previous period (history must be oldest first)`);
  if (prevBalance !== null && isNum(h.opening) && Math.abs(h.opening - prevBalance) >= 0.01) warn(`${at}: opening ${money(h.opening)} doesn't match the previous period's closing ${money(prevBalance)}`);
  prevEnd = h.periodEnd; prevBalance = h.balance;
});
if (prevEnd && isDate(doc.periodStart) && doc.periodStart < prevEnd) err("the current period overlaps the last history period");
if (prevBalance !== null && isNum(doc.opening) && Math.abs(doc.opening - prevBalance) >= 0.01) warn(`opening ${money(doc.opening)} doesn't match the last history period's closing ${money(prevBalance)}`);

for (const m of errors) console.log("error: " + m);
for (const m of warnings) console.log("warning: " + m);
console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s).` : `OK (${warnings.length} warning(s)).`);
process.exit(errors.length ? 1 : 0);
