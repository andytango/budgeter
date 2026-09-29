# My finances: working memory

<!--
Template. Copy this to the root of your PRIVATE finance repo as CLAUDE.md. Claude reads it at the start
of every session (and the daily routine is told to read it first), so it's how Claude remembers your
situation between conversations. Fill in what you know; Claude will keep it up to date as you go.
Never put this file, or your budget data, in a public repo.
-->

Last updated: YYYY-MM-DD.

## How to work with me
- Tone: {{e.g. light but honest; I hate doing finances}}.
- Don't over-explain things I already know. Give exact steps when I ask for them.
- Check my email before asking what a payment is. Read ALL emails from a sender before flagging.
- Verify before claiming anything.

## Data sources and tools
- **Bank connector**: {{e.g. Era Context}} (read-only): current account (`{{ACCOUNT_KEY}}`) and credit
  card (`{{ACCOUNT_KEY}}`). Consent expires {{DATE}}: reconnect before then.
- **Email** connector: read to explain transactions. Never send or delete; drafts only when I ask.
- **Cloudflare**: env vars `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (Workers, D1 Edit, Access,
  DNS on my zone). The Cloudflare MCP connector can also query D1.
- **Daily routine** "Daily budget check" (trigger `{{TRIGGER_ID}}`), {{TIME}} {{TIMEZONE}}. Update its
  prompt when the rules below change.

## Budget Panel
- Phone app: https://{{YOUR_DOMAIN}} (Cloudflare Worker `budget-panel`, behind Cloudflare Access,
  allowed email: me only). Code: `budget-panel/` (a copy of the open-source repo).
- Claude artifact: {{ARTIFACT_URL}} (data in the artifact database doc `budget/current`).
- D1 database `budget-panel-db` (id `{{D1_DATABASE_ID}}`): `docs` row `current` = the budget JSON;
  `push_subs`; `notifications` (insert a row to notify my phone; a future `created_at` schedules it).
- Deploy code: `cd budget-panel/app && npx wrangler deploy`. Data changes need no deploy.

**Model (my rules):**
- A pay period runs from the day before payday to the day before the next payday.
  Payday: {{PAYDAY RULE}}.
- Start of Period + Income − Expenses = Period End Cash (the headline number).
- Discretionary spending is itemised, never forecast. The plan holds only planned bills, transfers
  and income.
- {{Anything else: how shared bills with a partner work, what counts as income, etc.}}

**Current period** {{START}} → {{END}}: opening £{{…}}, balance £{{…}}. Projected Period End Cash £{{…}}.

## Pending / next
- {{Things in progress: disputes, refunds, renewals to check, decisions to make.}}

## People
- {{Partner / housemates: how bills are split, who owes whom.}}

## Income
- {{Employer, gross and take-home pay, payday, tax code, pension.}}

## Debts
| Debt | Balance | Rate | Payment | Notes |
|---|---:|---|---:|---|
| {{Credit card}} | £{{…}} | {{…}}% APR | £{{…}}/month | {{Plan to clear it}} |

## Subscriptions
Kept: {{…}}. Cancelled (flag if they reappear): {{…}}.
Annual renewals (in the plan with `everyYears`): {{…}}.

## Spending habits to watch
- {{e.g. takeaways, train upgrades, impulse DIY runs}}

## Long-term goals
- {{Debt-free date, emergency buffer, pension, mortgage, big purchases, FIRE…}}
