// Regenerates docs/screenshots from examples/demo-budget.json (needs Playwright: npm i -D playwright).
//   node tools/screenshots.mjs [out-dir]
// Phone-sized PNGs (390×844 @2x, light and dark, device clock set to Fri 9 Oct 2026 to match the demo)
// plus hero.jpg, four phones side by side for the README.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] || join(root, "docs", "screenshots");
mkdirSync(out, { recursive: true });
const data = readFileSync(join(root, "examples", "demo-budget.json"), "utf8");
const browser = await chromium.launch();

for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: scheme, timezoneId: "Europe/London", locale: "en-GB" });
  await ctx.clock.setFixedTime(new Date("2026-10-09T08:30:00+01:00"));
  const p = await ctx.newPage();
  await p.route("https://local/**", (r) => { const path = new URL(r.request().url()).pathname; return r.fulfill({ path: join(root, "app", path === "/" ? "index.html" : path) }); });
  await p.route("**/api/budget", (r) => r.fulfill({ contentType: "application/json", body: data }));
  await p.route("**/api/push/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await p.goto("https://local/");
  await p.waitForSelector(".summary");
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { if (window.Budgeter.push) { window.Budgeter.push.state = "on"; window.Budgeter.redraw(); } });
  const shot = async (name) => { await p.waitForTimeout(250); await p.screenshot({ path: join(out, name + ".png") }); };
  const open = async () => { if (await p.$(".breakdown[hidden]")) await p.click(".summary"); };
  const close = async () => { if (await p.$(".breakdown:not([hidden])")) await p.click(".summary"); };
  const expand = async (label) => { const g = p.locator("button.group", { hasText: label }).first(); if ((await g.getAttribute("aria-expanded")) === "false") await g.click(); };
  const scrollTo = (sel) => p.evaluate((s) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - 12), sel);
  const home = async () => { await p.click('[data-tab="period"]'); const now = await p.$("[data-now]"); if (now) await now.click(); await p.evaluate(() => scrollTo(0, 0)); };
  const step = async (n) => { for (let i = 0; i < Math.abs(n); i++) { await p.click(`[data-step="${Math.sign(n)}"]`); await p.waitForTimeout(100); } };

  if (scheme === "light") {
    await shot("1-period");
    await open(); await shot("2-breakdown");
    await expand("Discretionary"); await scrollTo(".box.exp"); await shot("3-spending");
    await close(); await home(); await step(1); await open(); await expand("Debt Repayments"); await shot("4-next-period");
    await home(); await step(-3); await open(); await expand("Discretionary"); await scrollTo(".box.exp"); await shot("5-past-period");
    await home(); await close(); await p.click('[data-tab="year"]'); await shot("6-tax-year");
    await p.click('[data-tab="loans"]'); await shot("7-loans");
  } else {
    await shot("8-dark-period");
    await open(); await expand("Discretionary"); await scrollTo(".box.exp"); await shot("9-dark-spending");
  }
  await ctx.close();
}

// Hero: four phones on the app's sage background.
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1.5 });
const img = (n) => "data:image/png;base64," + readFileSync(join(out, n + ".png")).toString("base64");
await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Encode+Sans+Semi+Condensed:wght@600;800&display=swap">
<style>html,body{margin:0}body{width:1600px;height:960px;background:linear-gradient(160deg,#e8f0ec,#d3e0db);font-family:"Encode Sans Semi Condensed",Arial,sans-serif;color:#22304c;position:relative;overflow:hidden}
.head{position:absolute;left:0;right:0;top:44px;text-align:center}h1{margin:0;font-size:64px;font-weight:800}p{margin:8px 0 0;font-size:24px;font-weight:600;color:#4a5a78}
.row{position:absolute;left:0;right:0;top:210px;display:flex;justify-content:center;gap:44px}
.phone{width:300px;height:649px;border-radius:44px;background:#1b2231;padding:10px;box-shadow:0 30px 60px rgba(34,48,76,.28),0 6px 14px rgba(34,48,76,.18)}
.phone img{width:300px;height:649px;border-radius:35px;display:block}.phone:nth-child(1),.phone:nth-child(4){margin-top:40px}</style></head><body>
<div class="head"><h1>Budgeter</h1><p>How much will be in your account the day before payday? Claude keeps it up to date every morning.</p></div>
<div class="row">${["1-period", "3-spending", "6-tax-year", "8-dark-period"].map((n) => `<div class="phone"><img src="${img(n)}"></div>`).join("")}</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, "hero.jpg"), type: "jpeg", quality: 90 });
await browser.close();
console.log("Screenshots written to " + out);
