// Budgeter: the pay-period budget, projections of future periods, a 12-period year view
// and the loans. Shared by the phone app (index.html) and the Claude artifact (artifact.html).
// Both call Budgeter.render(doc) with the budget document, or Budgeter.fail(message).
(function () {
  "use strict";
  const AHEAD = 60; // future pay periods to project (five years; enough for four full tax years ahead)

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const whole = (n) => (n < 0 ? "−£" : "£") + Math.abs(Math.round(n)).toLocaleString("en-GB");
  const pence = (n) => (n < 0 ? "−£" : "£") + Math.abs(Number(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // Dates are handled as UTC midnights so daylight saving never shifts a day.
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const toISO = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const fmt = (s, opts) => (s ? toDate(s).toLocaleDateString("en-GB", Object.assign({ timeZone: "UTC" }, opts)) : "");
  const shortDate = (s) => fmt(s, { day: "numeric", month: "short" });
  const fullDate = (s) => fmt(s, { day: "numeric", month: "short", year: "numeric" });
  const dayDate = (s) => fmt(s, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const monthYear = (s) => fmt(s, { month: "long", year: "numeric" });
  const monthName = (s) => fmt(s, { month: "long" });

  // Payday is the last Friday of the month, brought forward off a bank holiday
  // (Christmas and Good Friday can both land on it).
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
  }
  function isWorkday(d) {
    const wd = d.getUTCDay(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (wd === 0 || wd === 6) return false;
    if ((m === 12 && (day === 25 || day === 26)) || (m === 1 && day === 1)) return false;
    return toISO(addDays(easterSunday(d.getUTCFullYear()), -2)) !== toISO(d);
  }
  function paydayOf(y, m) { // m is a 0-based month and may run past December
    let d = new Date(Date.UTC(y, m + 1, 0));
    while (d.getUTCDay() !== 5) d = addDays(d, -1);
    while (!isWorkday(d)) d = addDays(d, -1);
    return d;
  }

  // Dates a planned item falls on between `from` and `to` (inclusive).
  // Rules: {day: 1} monthly, {weekly: 5} every Friday, {payday: true}, {date: "2026-10-30"} once,
  // or {date, everyYears: 1} for annual (or 2-yearly) renewals; optional months: [4, …, 1],
  // from and until (ISO dates).
  function datesFor(p, from, to) {
    let out = [];
    if (p.date) {
      const d0 = toDate(p.date);
      out = [d0];
      for (let y = d0.getUTCFullYear() + (p.everyYears || 0); p.everyYears && y <= to.getUTCFullYear(); y += p.everyYears) {
        out.push(new Date(Date.UTC(y, d0.getUTCMonth(), d0.getUTCDate())));
      }
    }
    else if (p.payday) out = [from];
    else if (p.weekly != null) {
      for (let d = from; d <= to; d = addDays(d, 1)) if (d.getUTCDay() === p.weekly) out.push(d);
    } else if (p.day) {
      for (let y = from.getUTCFullYear(), m = from.getUTCMonth(); Date.UTC(y, m, 1) <= to.getTime(); m++) {
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        out.push(new Date(Date.UTC(y, m, Math.min(p.day, last))));
      }
    }
    return out.filter((d) => d >= from && d <= to &&
      (!p.months || p.months.includes(d.getUTCMonth() + 1)) &&
      (!p.from || d >= toDate(p.from)) && (!p.until || d <= toDate(p.until)));
  }

  const sum = (items, pred) => (items || []).filter(pred || (() => true)).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const all = (groups, pred) => groups.reduce((s, g) => s + sum(g.items, pred), 0);
  const notDone = (i) => !i.done;
  const copyGroups = (gs) => (gs || []).map((g) => ({ group: g.group, discretionary: g.discretionary, items: (g.items || []).slice() }));

  // One pay period as shown on screen. Money already spent has left the balance; items not
  // done yet are still to come. Any gap the itemised lines don't explain is shown in the
  // discretionary group, so Start + Income − Expenses always equals Period End Cash.
  function summarise(d, kind) {
    const income = copyGroups(d.income), expenses = copyGroups(d.expenses);
    const opening = Number(d.opening) || 0;
    const balance = d.balance != null ? Number(d.balance) : opening;
    const periodEnd = balance + all(income, notDone) - all(expenses, notDone);
    const totIn = all(income);
    const gap = opening + totIn - all(expenses) - periodEnd;
    if (Math.abs(gap) >= 0.5) {
      let disc = expenses.find((g) => g.discretionary);
      if (!disc) { disc = { group: "Discretionary", discretionary: true, items: [] }; expenses.push(disc); }
      disc.items.push({ name: gap > 0 ? "Spending not itemised yet" : "Refunds not itemised yet", amount: gap, done: true });
    }
    return {
      kind, start: d.periodStart, end: d.periodEnd, opening, income, expenses, totIn, totOut: all(expenses), periodEnd,
      note: d.note, updated: d.updatedLabel || shortDate(d.asOf), cleared: d.cleared || [],
    };
  }

  // Future pay periods from the plan: recurring bills and income, and debt payments that stop
  // once the debt is cleared (interest added monthly). No discretionary spending is forecast.
  function project(d, first) {
    const plan = d.plan;
    if (!plan || !d.payday) return [];
    const debts = (d.debts || []).map((l) => {
      const toCome = (d.expenses || []).reduce((s, g) => s + sum(g.items, (i) => !i.done && i.debt === l.name), 0);
      return { name: l.name, r: (Number(l.apr) || 0) / 1200, bal: Math.max(0, (Number(l.balance) || 0) - toCome) };
    });
    const pd = toDate(d.payday), y = pd.getUTCFullYear(), m = pd.getUTCMonth();
    const out = [];
    let opening = first.periodEnd;
    for (let j = 0; j < AHEAD; j++) {
      const payday = j === 0 ? pd : paydayOf(y, m + j), next = paydayOf(y, m + j + 1), to = addDays(next, -1);
      debts.forEach((x) => { x.bal = Math.round(x.bal * (1 + x.r) * 100) / 100; });
      const owing = debts.map((x) => x.bal > 0.005);
      const build = (list) => {
        // Debt payments come off the simulated balance in date order, so a final payoff lands
        // before later regular payments (which then stop). Groups keep the plan's order.
        const groups = [], occ = [];
        for (const p of list || []) {
          const dates = datesFor(p, payday, to);
          if (dates.length && !groups.some((x) => x.group === p.group)) groups.push({ group: p.group, items: [] });
          dates.forEach((date) => occ.push({ p, date }));
        }
        occ.sort((a, b) => a.date - b.date);
        for (const { p, date } of occ) {
          let amount = Number(p.amount) || 0;
          const debt = p.debt && debts.find((x) => x.name === p.debt);
          if (debt) {
            amount = Math.min(amount, debt.bal);
            if (amount <= 0.005) continue;
            debt.bal = Math.round((debt.bal - amount) * 100) / 100;
          }
          groups.find((x) => x.group === p.group).items.push({ name: String(p.name).replace("{month}", monthName(toISO(payday))), amount, due: toISO(date), est: !!p.est, debt: p.debt });
        }
        return groups.filter((g) => g.items.length);
      };
      const expenses = build(plan.expenses);
      const s = summarise({
        periodStart: toISO(addDays(payday, -1)), periodEnd: toISO(to), opening, balance: opening,
        income: build(plan.income), expenses,
        cleared: debts.filter((x, i) => owing[i] && x.bal <= 0.005).map((x) => x.name),
      }, "future");
      out.push(s);
      opening = s.periodEnd;
    }
    return out;
  }

  function timeline(d) {
    const periods = (d.history || []).map((h) => summarise(h, "past"));
    const current = summarise(d, "current");
    const cur = periods.push(current) - 1;
    return { periods: periods.concat(project(d, current)), cur };
  }

  // Pay periods grouped by UK tax year (6 Apr – 5 Apr) by the date each period ends, so a year
  // runs April to March: its last period ends in late March. A future tax year the projection
  // doesn't reach the end of is left out.
  const taxYearOf = (p) => { const e = toDate(p.end), y = e.getUTCFullYear(); return e < new Date(Date.UTC(y, 3, 6)) ? y - 1 : y; };
  function taxYears(periods) {
    const groups = [];
    periods.forEach((p, i) => {
      const ty = taxYearOf(p);
      let g = groups[groups.length - 1];
      if (!g || g.ty !== ty) groups.push((g = { ty, idx: [] }));
      g.idx.push(i);
    });
    const last = groups[groups.length - 1];
    if (last && groups.length > 1 && periods[last.idx[last.idx.length - 1]].kind === "future") groups.pop();
    return groups;
  }
  const tyLabel = (ty) => ty + "/" + String(ty + 1).slice(2);

  // Several pay periods added together, same shape as a single period.
  function aggregate(list) {
    const merge = (key) => {
      const groups = [];
      for (const p of list) for (const g of p[key]) {
        let G = groups.find((x) => x.group === g.group);
        if (!G) groups.push((G = { group: g.group, discretionary: g.discretionary, items: [] }));
        G.discretionary = G.discretionary || g.discretionary;
        for (const i of g.items) {
          let I = G.items.find((x) => x.name === i.name);
          if (!I) G.items.push((I = { name: i.name, amount: 0, count: 0, done: true, est: false, due: i.due }));
          I.amount += Number(i.amount) || 0; I.count++; I.done = I.done && !!i.done; I.est = I.est || !!i.est;
        }
      }
      return groups;
    };
    // Biggest first (a year mixes periods with and without some groups); discretionary last.
    const bySize = (a, b) => (!!a.discretionary - !!b.discretionary) || sum(b.items) - sum(a.items);
    const income = merge("income").sort(bySize), expenses = merge("expenses").sort(bySize);
    const first = list[0], last = list[list.length - 1];
    return {
      kind: list.some((p) => p.kind === "future") ? "future" : "past", start: first.start, end: last.end,
      opening: first.opening, income, expenses, totIn: all(income), totOut: all(expenses), periodEnd: last.periodEnd,
      cleared: list.flatMap((p) => p.cleared.map((name) => ({ name, when: p.start }))), includesCurrent: list.some((p) => p.kind === "current"),
    };
  }

  // ---- rendering ----
  const EYE = '<svg class="eye" viewBox="0 0 28 18" aria-hidden="true"><path class="lid" d="M1.5 9C5 3.5 9.3 1.5 14 1.5S23 3.5 26.5 9C23 14.5 18.7 16.5 14 16.5S5 14.5 1.5 9Z" stroke-width="1.6" style="fill: var(--eye-lid, #eef2f7); stroke: var(--eye-ink, #2b3a57)"/><circle class="pupil" cx="14" cy="9" r="4.6" style="fill: var(--eye-ink, #2b3a57)"/><circle cx="15.6" cy="7.4" r="1.4" fill="#ffffff"/></svg>';
  const REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" style="fill: var(--bell-fill, none)" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const CHEV = (dir) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7") + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let open = {};
  try { open = JSON.parse(localStorage.getItem("budget-open") || "{}"); } catch (e) { open = {}; }
  const saveOpen = () => { try { localStorage.setItem("budget-open", JSON.stringify(open)); } catch (e) {} };

  // Each app launch starts on the current period with the breakdown folded away.
  const state = { tab: "period", idx: null, yearIdx: null, breakdown: false };
  let doc = null, tl = null;

  function groupBlock(kind, g, idx) {
    const key = kind + ":" + g.group;
    const isOpen = !!open[key];
    const items = (g.items || []).map((i) => {
      const tags = (i.est ? '<span class="tag">est.</span>' : "") + (i.flag ? '<span class="tag act">' + esc(i.flag) + "</span>" : "");
      const when = i.count > 1 ? "×" + i.count : i.done ? (kind === "in" ? "in" : "paid") : shortDate(i.due);
      return '<div class="item' + (i.done ? " done" : "") + '"><span></span><span>' + esc(i.name) + tags +
        '</span><span class="due">' + when + '</span><span class="num">' + pence(i.amount) + "</span></div>";
    }).join("");
    return '<div class="grp"><button class="group row" type="button" aria-expanded="' + isOpen + '" data-key="' + esc(key) + '" id="g-' + kind + "-" + idx + '">' +
      EYE + "<span>" + esc(g.group) + '</span><span class="num">' + whole(sum(g.items)) + "</span></button>" +
      '<div class="items"' + (isOpen ? "" : " hidden") + ">" + items + "</div></div>";
  }

  function noteFor(p, year) {
    if (p.kind === "current" && p.note && !year) return p.note;
    if (p.kind === "past" && p.note) return p.note;
    const lead = year ? "Tax year " + p.label + (p.kind === "future" ? ", projected" : "") : "Projected";
    let s = p.kind === "past" && !year
      ? "Started on **" + whole(p.opening) + "**, ended on **" + whole(p.periodEnd) + "**."
      : year ? lead + ": start on **" + whole(p.opening) + "**, end on **" + whole(p.periodEnd) + "**."
      : lead + ": start on **" + whole(p.opening) + "**, end on **" + whole(p.periodEnd) + "** on " + dayDate(p.end) + ".";
    if (year) p.cleared.forEach((c) => { s += " **" + c.name + "** is cleared in the " + monthName(toISO(addDays(toDate(c.when), 1))) + " period."; });
    else p.cleared.forEach((name) => { s += " **" + name + "** is cleared this period."; });
    return s;
  }

  function summaryBox(p, year) {
    const unit = year ? "Year" : "Period";
    return '<section class="summary" role="button" tabindex="0" aria-expanded="' + state.breakdown + '" aria-label="' + unit + ' totals. Tap for the breakdown">' +
      '<div class="line big"><span>Start of ' + unit + (year ? "" : " (" + shortDate(p.start) + ")") + "</span><span>" + whole(p.opening) + "</span></div>" +
      '<div class="line in"><span>Income</span><span>' + whole(p.totIn) + "</span></div>" +
      '<div class="line out"><span>Expenses</span><span>' + whole(p.totOut) + "</span></div>" +
      '<div class="line end' + (p.periodEnd < 0 ? " neg" : "") + '"><span>' + unit + " End Cash</span><span>" + whole(p.periodEnd) + "</span></div>" +
      "</section>";
  }

  function breakdown(p, year) {
    const col = year ? "This Year" : "This Period";
    return '<div class="breakdown"' + (state.breakdown ? "" : " hidden") + ">" +
      '<section class="box inc" aria-label="Income"><div class="row head"><span class="label">Income</span><span class="num">' + col + "</span></div>" +
        p.income.map((g, i) => groupBlock("in", g, i)).join("") + "</section>" +
      '<section class="box exp" aria-label="Expenses"><div class="row head"><span class="label">Expenses</span><span class="num">' + col + "</span></div>" +
        p.expenses.map((g, i) => groupBlock("out", g, i)).join("") + "</section>" +
      "</div>";
  }

  function nav(label, kind, canBack, canFwd) {
    return '<div class="nav"><button type="button" data-step="-1" aria-label="Previous"' + (canBack ? "" : " disabled") + ">" + CHEV(-1) + "</button>" +
      '<div class="when"><div class="dates">' + label + '</div><div class="kind">' + kind + "</div></div>" +
      '<button type="button" data-step="1" aria-label="Next"' + (canFwd ? "" : " disabled") + ">" + CHEV(1) + "</button></div>";
  }

  // How far through the current period today is (device date): day N of the period, days left.
  function progress(p) {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const start = toDate(p.start).getTime(), end = toDate(p.end).getTime();
    const total = Math.round((end - start) / DAY);
    const day = Math.round((today - start) / DAY), left = total - day;
    const pct = Math.min(100, Math.max(0, (day / total) * 100));
    const payday = dayDate(toISO(addDays(toDate(p.end), 1)));
    const right = left > 1 ? left + " days left · payday " + payday
      : left === 1 ? "1 day left · payday " + payday
      : left === 0 ? "Last day · payday tomorrow" : "Period over · waiting for the update";
    const leftText = day < 1 ? "Starts " + shortDate(toISO(addDays(toDate(p.start), 1))) : "Day " + Math.min(day, total) + " of " + total;
    // Notes from the daily check, pinned to their dates on the bar (listed at the bottom by notesList).
    const notes = activeNotes(today);
    const pins = notes.map((n) => {
      const at = toDate(n.date).getTime();
      if (at < start || at > end) return "";
      return '<span class="pin ' + n.kind + '" style="left:' + ((at - start) / (end - start) * 100).toFixed(1) + '%"></span>';
    }).join("");
    return '<div class="progress"><div class="track"><div class="bar time" role="img" aria-label="' + leftText + ", " + right + '"><span style="width:' + pct.toFixed(1) + '%"></span></div>' +
      (pins ? '<div class="pins" aria-hidden="true">' + pins + "</div>" : "") + "</div>" +
      '<div class="sub"><span>' + leftText + "</span><span>" + right + "</span></div></div>";
  }

  // The same notes as a list, at the bottom of the current period.
  function notesList() {
    const now = new Date();
    const list = activeNotes(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      .map((n) => '<li class="' + n.kind + '"><span class="dot"></span><span><b>' + shortDate(n.date) + "</b> · " + esc(n.text) + "</span></li>").join("");
    return list ? '<ul class="pinlist" aria-label="Notes">' + list + "</ul>" : "";
  }

  // The daily check's notes (doc.alerts: {date, kind: action | good | info, text}). Things to do stay
  // until the check removes them; good news and info drop off three days after their date.
  function activeNotes(today) {
    return (doc.alerts || [])
      .filter((n) => n && n.date && n.text)
      .map((n) => ({ date: n.date, text: n.text, kind: ["action", "good", "info"].includes(n.kind) ? n.kind : "info" }))
      .filter((n) => n.kind === "action" || toDate(n.date).getTime() >= today - 3 * DAY)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // Date of the last payment on a debt in the forecast (current period onwards), or null if it
  // isn't cleared within the projection.
  function clearedOn(name) {
    const p = tl && tl.periods.slice(tl.cur).find((x) => x.cleared.includes(name));
    if (!p) return null;
    let last = null;
    for (const g of p.expenses) for (const i of g.items) if (i.debt === name && i.due && (!last || i.due > last)) last = i.due;
    return last ? toDate(last) : null;
  }

  function loansView() {
    const now = doc.asOf ? toDate(doc.asOf) : new Date();
    const loans = (doc.debts || []).map((l) => {
      const bal = Number(l.balance) || 0;
      const start = Number(l.start) || bal || 1;
      const paid = Math.min(100, Math.max(0, (1 - bal / start) * 100));
      const pay = Number(l.monthly) || 0;
      const r = (Number(l.apr) || 0) / 1200;
      let months = null;
      if (pay > 0 && bal > 0) {
        months = r > 0 ? (pay > bal * r ? Math.ceil(-Math.log(1 - (r * bal) / pay) / Math.log(1 + r)) : Infinity) : Math.ceil(bal / pay);
      }
      // Prefer the forecast's payoff (the plan's real payments, extras included) over a flat monthly figure.
      const payoff = clearedOn(l.name);
      if (payoff && bal > 0) months = Math.max(1, (payoff.getUTCFullYear() - now.getUTCFullYear()) * 12 + payoff.getUTCMonth() - now.getUTCMonth());
      let left = "";
      if (months === Infinity) left = "never at " + whole(pay) + "/month";
      else if (months != null) {
        const done = payoff || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
        left = months + (months === 1 ? " month" : " months") + " left · clear by " + done.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
      }
      return '<div class="loan"><div class="top"><span><span class="name">' + esc(l.name) + '</span><span class="rate">' + esc(l.rate || "") +
        '</span></span><span class="bal">' + pence(bal) + '</span></div><div class="bar" role="img" aria-label="' + Math.round(paid) + '% paid off"><span style="width:' + paid.toFixed(1) + '%"></span></div>' +
        '<div class="sub">' + Math.round(paid) + "% paid off" + (left ? " · " + left : "") + "</div></div>";
    }).join("");
    return loans ? '<section class="loans" aria-label="Loans">' + loans + "</section>" : '<p class="status">No loans. Nice.</p>';
  }

  // Prompt to turn on notifications (PWA only), until they're on or dismissed for a fortnight.
  const LATER = "budget-push-later";
  function pushCard() {
    const push = window.Budgeter.push;
    if (!push || push.state !== "off") return "";
    let later = 0;
    try { later = Number(localStorage.getItem(LATER)) || 0; } catch (e) { later = 0; }
    if (Date.now() - later < 14 * 86400000) return "";
    return '<div class="pushcard"><span>' + BELL + 'Get your daily brief and reminders as notifications.</span>' +
      '<button type="button" class="pushon" data-bell>Turn on</button>' +
      '<button type="button" class="pushlater" data-pushlater aria-label="Not now">Not now</button></div>';
  }

  const TITLES = { period: "Monthly Budget", year: "Annual Budget", loans: "Loans" };

  function draw() {
    if (!doc) return;
    const P = tl.periods;
    let body = "";
    if (state.tab === "period") {
      const p = P[state.idx];
      const kind = p.kind === "current" ? "This period · updated " + esc(p.updated) : p.kind === "future" ? "Projection" : "Past period";
      body = nav(shortDate(p.start) + " – " + fullDate(p.end), kind, state.idx > 0, state.idx < P.length - 1) +
        (p.kind === "current" ? progress(p) : "") + pushCard() + '<p class="note">' + bold(noteFor(p, false)) + "</p>" + summaryBox(p, false) + breakdown(p, false) +
        (p.kind === "current" ? notesList() : "");
    } else if (state.tab === "year") {
      const G = tl.years[state.yearIdx];
      const a = aggregate(G.idx.map((i) => P[i]));
      a.label = tyLabel(G.ty);
      a.months = monthYear(G.idx.length ? P[G.idx[0]].end : a.start) + " – " + monthYear(a.end);
      const kind = a.months + " · " + (a.includesCurrent ? "this tax year" : a.kind === "future" ? "projection" : "actual");
      body = nav("Tax year " + a.label, kind, state.yearIdx > 0, state.yearIdx < tl.years.length - 1) +
        '<p class="note">' + bold(noteFor(a, true)) + "</p>" + summaryBox(a, true) + breakdown(a, true);
    } else {
      body = loansView();
    }
    const tabs = Object.keys(TITLES).map((t) =>
      '<button type="button" role="tab" data-tab="' + t + '" aria-selected="' + (state.tab === t) + '">' + { period: "Period", year: "Year", loans: "Loans" }[t] + "</button>").join("");
    const refresh = window.Budgeter.onRefresh
      ? '<button type="button" class="refresh" data-refresh aria-label="Refresh">' + REFRESH + "</button>" : "";
    const push = window.Budgeter.push;
    const bell = push
      ? '<button type="button" class="refresh bell ' + push.state + '" data-bell aria-pressed="' + (push.state === "on") + '" aria-label="' +
        { on: "Notifications on. Tap to send a test", off: "Turn on notifications", denied: "Notifications are blocked in Settings" }[push.state] + '">' + BELL + "</button>" : "";
    const away = state.tab === "period" ? state.idx !== tl.cur : state.tab === "year" ? state.yearIdx !== tl.curYear : false;
    const jump = away ? '<button type="button" class="jump" data-now aria-label="Back to the current ' + (state.tab === "period" ? "period" : "tax year") + '">Today</button>' : "";
    $("#app").innerHTML = '<header class="top"><h1>' + TITLES[state.tab] + '</h1><div class="actions">' + jump + bell + refresh + "</div></header>" +
      '<div class="tabs" role="tablist">' + tabs + "</div>" + '<div class="view">' + body + "</div>";
  }

  function step(dir) {
    if (state.tab === "period") state.idx = Math.max(0, Math.min(tl.periods.length - 1, state.idx + dir));
    else if (state.tab === "year") {
      state.yearIdx = Math.max(0, Math.min(tl.years.length - 1, state.yearIdx + dir));
    }
    draw();
  }

  function toggleBreakdown() {
    state.breakdown = !state.breakdown;
    const b = $(".breakdown"), s = $(".summary");
    if (b) b.hidden = !state.breakdown;
    if (s) s.setAttribute("aria-expanded", String(state.breakdown));
  }

  let refreshing = false;
  async function refresh(btn) {
    if (refreshing || !window.Budgeter.onRefresh) return;
    refreshing = true;
    btn.classList.add("spinning");
    try { await window.Budgeter.onRefresh(); } finally {
      refreshing = false;
      const b = $(".refresh");
      if (b) b.classList.remove("spinning");
    }
  }

  document.addEventListener("click", (e) => {
    const bl = e.target.closest("[data-bell]");
    if (bl) {
      const push = window.Budgeter.push;
      if (push && push.state !== "denied") push.toggle().catch(() => {});
      else alert("Notifications are blocked for this app. Turn them on in Settings → Notifications → Budget.");
      return;
    }
    if (e.target.closest("[data-pushlater]")) {
      try { localStorage.setItem(LATER, String(Date.now())); } catch (err) {}
      draw();
      return;
    }
    const r = e.target.closest("[data-refresh]");
    if (r) { refresh(r); return; }
    const t = e.target.closest("[data-tab]");
    if (t) { state.tab = t.dataset.tab; draw(); return; }
    if (e.target.closest("[data-now]")) { state.idx = tl.cur; state.yearIdx = tl.curYear; draw(); return; }
    const n = e.target.closest("[data-step]");
    if (n) { if (!n.disabled) step(Number(n.dataset.step)); return; }
    if (e.target.closest(".summary")) { toggleBreakdown(); return; }
    const b = e.target.closest("button.group");
    if (!b) return;
    const key = b.dataset.key;
    const expanded = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!expanded));
    b.nextElementSibling.hidden = expanded;
    open[key] = !expanded;
    saveOpen();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".summary")) { e.preventDefault(); toggleBreakdown(); }
  });

  // Swipe left or right to move between periods.
  let touch = null;
  document.addEventListener("touchstart", (e) => { touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!touch || state.tab === "loans") return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.Budgeter = {
    render(d) {
      const first = !doc;
      doc = d;
      tl = timeline(d);
      tl.years = taxYears(tl.periods);
      tl.curYear = tl.years.findIndex((g) => g.idx.includes(tl.cur));
      if (first || state.idx >= tl.periods.length || state.yearIdx >= tl.years.length) {
        state.idx = tl.cur;
        state.yearIdx = tl.curYear;
      }
      draw();
    },
    redraw() { draw(); },
    fail(html) { doc = null; $("#app").innerHTML = '<h1>Monthly Budget</h1><p class="status">' + html + "</p>"; },
    _test: { paydayOf, datesFor, timeline, aggregate, toISO },
  };
})();
