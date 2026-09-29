# My finances: working memory

<!--
Template (AGENTS.md, phase 4). Save as CLAUDE.md at the root of the user's PRIVATE finance repo and
delete this comment. Fill in what you know, replace {{APP}} with the MEMORY block from
platforms/<platform>/snippets.md, and leave {{…}} lines you can't fill yet for later sessions. Claude
reads this file at the start of every session and the daily routine reads it first, so it's how
Claude remembers the user's situation. Keep it current as things change. Never put it in a public repo.
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
- **Daily routine** "Daily budget check" (trigger `{{TRIGGER_ID}}`), {{TIME}} {{TIMEZONE}}. Update its
  prompt when the rules below change.

## Budgeter
{{APP}}
- Claude artifact (optional): {{ARTIFACT_URL}} (a copy of the budget in the artifact database, doc `budget/current`).
- Budgeter source: {{PATH OR URL OF THE BUDGETER CHECKOUT}} (tools: validate, make-seed, create --update).

**Model (my rules):**
- A pay period runs from the day before payday to the day before the next payday.
  Payday: {{PAYDAY RULE}}.
- Start of Period + Income − Expenses = Period End Cash (the headline number).
- Discretionary spending is itemised, never forecast. The plan holds only planned bills, transfers
  and income.
- Every discretionary transaction is itemised, so the unexplained gap stays £0.
- Money paid back for a specific purchase or split bill (and refunds) is negative spending, not income.
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
