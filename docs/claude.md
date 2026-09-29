# The Claude side

The app only displays a JSON document. Claude does the work: every morning it reads your bank, works
out what happened, updates the document and tells you about it. This page covers setting that up and
using it day to day.

## What Claude needs

| | Why | Notes |
|---|---|---|
| **Claude Code on the web** | Runs in your private finance repo, can run scripts, call your host's API and deploy the app. | The daily routine is a scheduled Claude Code routine. |
| **A bank connector** | Balances and transactions. | This was built with **Era Context** (open banking, read-only). Any connector that lists transactions works; describe it in `CLAUDE.md` and the routine prompt. Without one, you can upload statements instead. |
| **An email connector** (e.g. Gmail) | Explains mystery payments from receipts, spots renewals, bills and bookings. | Keep it read-only apart from drafts you ask for. |
| **Database access** | Writes the budget and queues notifications. | Cloudflare: an API token in the environment (see [setup.md](setup.md#8-give-claude-access)) or the Cloudflare connector. Vercel + Supabase: the Supabase secret key in the environment or the Supabase connector (see [vercel-supabase.md](vercel-supabase.md#8-give-claude-access)). |
| Google Drive (optional) | Reads documents you keep there: payslips, quotes, a shared household spreadsheet. | |

## Working memory: `CLAUDE.md`

Copy [`templates/CLAUDE.md`](../templates/CLAUDE.md) to the root of your private repo. Claude reads
it at the start of every session, so it's where your situation lives: debts, bills, pay, people,
decisions and your rules. You don't have to fill it all in up front. Tell Claude things as they come
up ("my car insurance renews in August", "the cleaner is £65 a week") and ask it to keep `CLAUDE.md`
current. Commit it, so the daily routine sees the latest version.

## Your first budget

Two options:

- **From scratch:** "Here are my bills, pay and debts: build my budget document for the current pay
  period, based on `budget-panel/examples/demo-budget.json`." Claude creates `plan`, `debts` and the
  current period, and itemises what's already been spent from your bank connector.
- **With history:** export a statement CSV from your bank, copy
  [`tools/backfill.example.json`](../tools/backfill.example.json) to `backfill.json` (keep it out of
  git), fill in your paydays and rules, and run
  `python3 tools/backfill.py backfill.json statement.csv history.json`. Every period should print
  `gap 0.00`. Claude can write the rules with you: "match my statement's descriptions to bills and
  build history".

Then load it into the database ([Cloudflare](setup.md#6-load-a-budget),
[Supabase](vercel-supabase.md#6-load-a-budget)) or let Claude write it.

## The artifact

The same budget can be shown inside Claude as an artifact, using the same `panel.js` and `panel.css`
as the phone app. Ask Claude:

> Publish `budget-panel/artifact/artifact.html` as an artifact with `panel.js` and `panel.css` from
> `budget-panel/app/public` as its files, with a database, and save my budget JSON in the database as
> `budget/current`.

Note the artifact's URL in `CLAUDE.md` and in the routine prompt. The artifact starts private to you.

## The daily routine

1. Fill in [`templates/daily-routine.md`](../templates/daily-routine.md): your account keys, artifact
   URL, D1 database ID, payday rule, and the things you want watched.
2. Ask Claude Code on the web: "Create a routine called Daily budget check that runs every day at
   07:50 UK time with this prompt", and paste it.
3. Note the routine's trigger ID in `CLAUDE.md`, so later sessions can update its prompt.

Each run it reads `CLAUDE.md`, pulls the new transactions, updates the budget in both places,
writes you a short brief and sends a push notification. On payday it moves the finished period into
`history` and starts a new one from the plan.

**Keep the prompt current.** When you change a rule ("the food shop is now £48", "I've cancelled
Netflix"), ask Claude to update the plan, `CLAUDE.md` *and* the routine's prompt. Otherwise the next
morning's run works from the old rules.

## Day to day

Talk to Claude in the same session (the routine runs there too, so it has the context). Things that
work well:

- "I've cancelled Disney+." → removes it from the plan and watches for it reappearing.
- "Add a monthly haircut, about £40 mid-month." → a planned bill in the plan and this period.
- "How did this period go negative?" / "What's driving the year-end number?" → a breakdown.
- "I'm borrowing £100 from my partner until payday." → income now, repayment on payday.
- "Remind me tomorrow at 8 to move the supermarket collection." → a scheduled push notification (a
  row in `notifications` with a future `created_at`, in UTC).
- "Look at my receipts: what else do I usually buy?" → it reads receipt emails.
- "Move the notes list to the bottom" → it changes the app, deploys it and republishes the artifact.

### Rules that make it work

These are in the templates. They're worth keeping:

- **Never forecast discretionary spending.** The plan holds only bills, transfers and income, so the
  forecast shows what you'd have left without spending anything else.
- **Itemise to a £0 gap.** Every discretionary transaction becomes a line. Any unexplained difference
  shows up as "not itemised yet" until it's explained.
- **Money back is negative spending, not income.** Refunds, or a friend paying their half of dinner,
  reduce the spending they relate to. Only real income (salary, a partner's regular bill share)
  counts as income.
- **Check email before asking.** Claude should work out a payment from receipts before asking you.
- **Read-only banking.** Claude never moves money, changes bank settings, or sends email. It tells you
  what to do and you do it.

## Notifications

The routine queues one message a day. Any session can send one (this is D1; for Supabase see
[vercel-supabase.md](vercel-supabase.md#8-give-claude-access)):

```sql
INSERT INTO notifications (title, body, url) VALUES ('Budget', 'Your text', '/');
-- later: created_at is UTC
INSERT INTO notifications (title, body, url, created_at) VALUES ('Budget', 'Your text', '/', '2026-10-01 07:00:00');
```

Queued messages are sent every minute and records `sent_at` and `result` (the push
services' HTTP status per device, `no devices` or `stale` for anything more than a day old). Keep
messages short, and don't put anything in them you wouldn't want on your lock screen.
