# Budgeter: instructions for coding agents

You've been pointed at this repo to set Budgeter up for a user. Budgeter is a phone app (an
installable PWA) that shows one number: how much will be in their account the day before their next
payday, with the budget behind it. A scheduled Claude routine keeps it current every morning from
their bank and email. This file is the whole playbook. (Humans: see README.md.)

## What you're building

| Piece | Where | Notes |
|---|---|---|
| The app | `app/` | Static PWA, no build step. Renders one JSON budget document ([docs/data-model.md](docs/data-model.md)). Platform-neutral. |
| The API | `server/api.js`, `server/push.js` | Serves the budget to the signed-in owner, handles push sign-up, sends Web Push (no dependencies). Platform-neutral. |
| A platform adapter | `platforms/<platform>/` | Hosting, database, sign-in and a once-a-minute trigger. `SETUP.md` is the runbook, `snippets.md` the Claude-side commands. |
| The Claude side | `claude/` | Templates for the user's `CLAUDE.md` and the daily routine prompt; the optional Claude artifact. |
| Tools | `tools/` | `create.mjs` (generate the app), `validate.mjs` (check a budget), `make-seed.mjs` (load one), `gen-vapid.mjs` (push keys), `backfill.py` (history from a statement), `preview.mjs` (local demo). |

How it fits together: [docs/architecture.md](docs/architecture.md).

**Platforms:** `cloudflare` (Workers + D1 + Access; needs a domain on Cloudflare) and
`vercel-supabase` (Vercel Functions + Supabase Postgres and Auth; no domain needed). For anything else,
see [Other platforms](#other-platforms).

## Ground rules

- **This repo never holds user data.** Their budget, statements, config and generated app live in their
  own PRIVATE repo. `tools/create.mjs` refuses to write inside this repo.
- **Secrets** (VAPID private key, Supabase secret key, API tokens, cron secret) go only into the
  platform's secret store and the user's Claude environment settings. Never commit them, never print
  them in chat, and delete temp files that held them.
- **Don't weaken sign-in.** Only the user's allowed address(es) may get the budget. No public bypasses,
  even for the manifest or icons (the app already handles that).
- **Do the work yourself.** Use the CLIs and APIs in the runbook. Stop for the user only at **USER**
  steps; then give exact clicks or links and say what to send back.
- **Verify each phase** before moving on. Report failures plainly.
- **Budget rules** (the user can change them, but these are the defaults the app is built around):
  discretionary spending is itemised, never forecast; every transaction is itemised so the gap is £0;
  money paid back for a purchase is negative spending, not income.

## Phase 1: ask the user (one message)

1. **Platform:** Cloudflare (they need a domain on Cloudflare) or Vercel + Supabase (free, no domain).
2. **Their private finance repo** (create one if needed; it must be private).
3. **Allowed email address(es)** for sign-in.
4. **Payday and locale**, if not the UK defaults: paid on the last Friday of the month (earlier
   if that's a bank holiday), pounds, UK tax year from 6 April. See [Customising](#customising).
5. **What you can reach:** a bank connector (e.g. Era Context) or statement CSV exports; an email
   connector (e.g. Gmail) for explaining payments.
6. **Claude artifact** too? An optional view of the budget inside Claude.

Don't ask for anything you can find out or that the runbook covers.

## Phase 2: generate the app

```sh
node tools/create.mjs <platform> <private-repo>/app
```

This writes a self-contained, deployable folder with no imports back into this repo (see its
`BUDGETER.md`). Apply any [customising](#customising) to the generated copy, and ideally upstream here
too. Commit it to the user's repo, with nothing secret in it.

## Phase 3: provision and deploy

Follow `platforms/<platform>/SETUP.md` step by step. It covers credentials, database, sign-in, push
keys, the every-minute trigger, deploying, loading a budget and its own checks. Load
`examples/demo-budget.json` first to prove the deployment works, before touching real data.

## Phase 4: the Claude side

In the user's private repo:

1. **Working memory.** Create `CLAUDE.md` from [claude/memory-template.md](claude/memory-template.md):
   fill in what you know and paste the MEMORY block from `platforms/<platform>/snippets.md`.
2. **Their first budget.** The format is in [docs/data-model.md](docs/data-model.md), and
   [examples/demo-budget.json](examples/demo-budget.json) is a complete example. Either:
   - **From a statement:** copy `tools/backfill.example.json` to their repo (outside git, or
     gitignored), set their paydays and matching rules, and run
     `python3 tools/backfill.py <config> <statement.csv> <history.json>`. Every period must print
     `gap 0.00`. Then build the current period and plan on top.
   - **From scratch:** ask about pay, bills, debts and partner arrangements; pull the current period's
     transactions from the bank connector; itemise discretionary spending.

   Then `node tools/validate.mjs budget.json` (no errors, no gap warnings) and load it using the
   runbook's "Load a budget" step. Delete statement files and seed SQL afterwards; the budget lives in
   the database.
3. **The artifact (optional).** Publish [claude/artifact.html](claude/artifact.html) as a Claude
   artifact, with `panel.js` and `panel.css` from `<app>/public/` as its files and the database
   capability, then save the budget JSON in the artifact database as `budget/current`. Record the URL
   in `CLAUDE.md`.
4. **The daily routine.** Fill [claude/daily-routine.md](claude/daily-routine.md) (slots for READ,
   WRITE and NOTIFY come from `snippets.md`) and create a scheduled routine with it: daily, e.g. 07:50
   in the user's time zone, in their private repo, with the platform credentials from `snippets.md`
   in its environment. Record the routine's ID in `CLAUDE.md`. Run it once now and check the result.

## Phase 5: hand over

Tell the user, in plain words:
1. Open the app's URL on the phone (Safari on iPhone), sign in with the emailed code.
2. Share → **Add to Home Screen**, then open it from the Home Screen (on iPhone, push only works there).
3. Tap the **bell** and allow notifications: a test message arrives.
4. What happens every morning, and that they can just talk to Claude in their finance repo to change
   things ("I've cancelled Netflix", "add a £40 haircut mid-month", "remind me Friday at 8").

Then send a push through NOTIFY from `snippets.md` and confirm it arrived.

## Checklist (everything must pass)

- [ ] The runbook's own checks pass (no data served without sign-in; the trigger runs).
- [ ] The user signs in on their phone and sees their budget.
- [ ] `tools/validate.mjs` passes on the stored budget with no gap warnings.
- [ ] A notification reaches the phone within a minute.
- [ ] The routine ran once, updated the budget and sent the brief.
- [ ] No secrets or personal data in any committed file; statements and seed files deleted.

## Customising

| What | Where (in `app/`, or the generated `public/`) |
|---|---|
| Payday rule (default: last Friday of the month, earlier if that's a bank holiday) | `paydayOf` and `isWorkday` in `panel.js` |
| How far ahead to project (default 60 pay periods, 5 years) | `AHEAD` in `panel.js` |
| Currency and date format (default £, `en-GB`) | `whole`, `pence` and `fmt` at the top of `panel.js` |
| Tax year (default UK, 6 April to 5 April) | `taxYears` in `panel.js` |
| Colours, light and dark | the `:root` tokens in `panel.css` (new UI must use tokens) |
| App name and Home Screen colours | `manifest.webmanifest`, `index.html` |
| Home Screen icon | `tools/icons/*.svg`: render 180, 192 and 512 px PNGs, replace the PNGs and the inline `data:` icons in `index.html` (inline because iOS fetches Home Screen icons without cookies) |

After changing `panel.js` or `panel.css`: redeploy, and republish the artifact if there is one (it
uses the same two files). If you change the files the service worker caches, bump `SHELL` in `sw.js`.
Check with `node tools/preview.mjs` (demo data at http://localhost:8787, no sign-in).

## Other platforms

Any host works if it provides: static hosting for the app, the API routes, a sign-in check in front of
them, a small store (one JSON document and two tables), and something that runs a function every
minute. To add one:

1. `platforms/<name>/` with an adapter that checks sign-in, then calls
   `handleApi(request, store, env)` from `server/api.js` (the `store` interface is documented at the
   top of that file), and calls `deliverPending(store, env)` every minute. Import shared code as
   `../../server/…`; `create.mjs` rewrites the paths. Copy the closest existing adapter.
2. A schema (`docs`, `push_subs`, `notifications`; see either existing one), `SETUP.md` (runbook) and
   `snippets.md` (MEMORY, READ, WRITE, NOTIFY).
3. If sign-in happens in the browser rather than at the edge, an `auth.js` that defines
   `window.BudgetAuth` (`ready()`, `signIn()`, `fetch()`), like `platforms/vercel-supabase/auth.js`.
4. A layout entry in `tools/create.mjs`, and tests in `tests/` like the existing ones.

## Working on this repo

- `npm test` runs all tests (Node 20+, no install needed). The browser sign-in test runs if Playwright
  is installed (`npm i -D playwright`), and is skipped otherwise.
- `node tools/preview.mjs` shows the app with the demo data.
- Demo data and screenshots: `python3 tools/make-demo.py` regenerates `examples/demo-budget.json`
  (fictional, deterministic); `node tools/screenshots.mjs` regenerates `docs/screenshots/` (Playwright).
- Keep `app/` and `server/` platform-neutral; platform code belongs in `platforms/`.
- Never commit real personal data: examples must be obviously fictional.
