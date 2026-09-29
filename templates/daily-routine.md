# Daily routine prompt (template)

This is the prompt for the scheduled Claude routine that runs the budget every morning. Replace every
`{{…}}` placeholder, delete the examples you don't need, and add your own rules to the "Watch list"
and "Plans and reminders" sections as they come up. See [docs/claude.md](../docs/claude.md) for how to
create the routine.

Where it says **Cloudflare** / **Vercel + Supabase**, keep the lines for your host and delete the
others.

Keep the prompt and `CLAUDE.md` in step: the prompt holds the rules the routine follows every day,
while `CLAUDE.md` holds the facts (debts, bills, people, history of decisions).

---

Daily budget check. Use the bank connector (read-only: never change categories, rules or accounts)
to pull the balances of {{CURRENT_ACCOUNT_NAME}} (`{{CURRENT_ACCOUNT_KEY}}`) and
{{CARD_ACCOUNT_NAME}} (`{{CARD_ACCOUNT_KEY}}`) and every transaction since the last check, pending
ones included. Then give me a short brief: 3–6 lines when nothing is wrong, more only when something
needs action. Tone: {{TONE, e.g. "light but honest; don't over-explain"}}. CLAUDE.md in the repo holds
the full context: read it first.

For any payment you don't recognise, search my email first (receipts, "you sent" emails, invoices;
read every email from that sender before concluding) and explain it. Only ask me if the email trail
doesn't explain it. Email is read-only, apart from drafts I've asked for: never send or delete.

Check:

1. **Debts.** For each card or loan in `debts`, flag anything that isn't a payment or interest.
   {{DEBT PLAN, e.g. "Extra £500 to the credit card on payday 30 Oct, then clear it on payday 27 Nov.
   On the day before each payday, remind me of that day's payment and the exact amount. Once a
   balance hits £0, say so, set it to 0 in `debts` and stop the reminders."}}

2. **Spending since the last check.** Flag anything from my cancelled list reappearing:
   {{CANCELLED SUBSCRIPTIONS}}. Also flag {{HABITS TO WATCH, e.g. "takeaway delivery (I've quit),
   eating out, train upgrades"}} and any unusually large or unfamiliar payment.

   Watch list (add as they come up):
   - {{e.g. "A final bill from the old hosting company is due ~1 Oct (plan item, est.; use the real
     amount), then nothing: flag any later charge."}}
   - {{e.g. "Weekly food shop, Sunday click & collect, planned bill 'Food shop (Sun)' in Groceries:
     mark each week done with the real amount. Other supermarket shops are discretionary."}}

3. **The headline number is PERIOD END CASH**: my current-account balance on the day before the
   next payday. Payday is {{PAYDAY RULE, e.g. "the last Friday of the month, brought forward off bank
   holidays"}}. Period End Cash = today's balance + income still to come − planned expenses still to
   come. Pending card payments count as spent; discretionary spending lowers it directly. Say how it
   moved since yesterday and why, give the running discretionary total, and say plainly if a Direct
   Debit could bounce.

4. **Update the budget data.** Get the current document from the artifact with ArtifactData `get`
   `budget/current` at {{ARTIFACT_URL}} using `out_dir` (it's large because of `history`; edit the
   saved JSON file locally, never retype it). Keep `plan` and `history` intact.

   Daily:
   - `asOf` / `updatedLabel`; `balance` = today's current-account balance minus pending card payments.
   - Mark each planned income/expense item `done: true` once it has happened, with the real amount;
     replace estimates with real figures; add any newly known planned bill due in the period.
   - Add EVERY discretionary transaction since the last check as a done item in the group with
     `"discretionary": true` (name, amount, due = transaction date; add " (pending)" to the name
     while it's pending and drop it once it settles). One-off payments I choose to make are
     discretionary too.
   - Refunds, and money anyone pays me back for a specific purchase or split bill, are NEGATIVE
     amounts in the discretionary group, next to what they repay. {{PARTNER RULE, e.g. "A transfer
     from {{PARTNER}} equal to HALF of one of my outgoings (to the penny, 3 days before to 60 days
     after the purchase) is their share of it: add it as '{{PARTNER}}'s share (split bills)' with a
     negative amount in the purchase's group. Only {{PARTNER}}'s monthly bill share (£{{AMOUNT}} on
     the {{DAY}}) is income."}} Ask me when it's unclear what money coming in is for.
   - The page puts any unexplained gap into the discretionary group as "not itemised yet", so after
     your update the gap should be £0; if it isn't, find the missing transaction.
   - Debt payment items carry `"debt": "<name>"` so projections know what's left; keep that on them.
     All debt payments go in the "Debt Repayments" group. Update each balance in `debts`.
   - Write a one- or two-sentence `note` matching today's brief (use **bold** for the key figures).

   Timeline notes (`alerts`): the app pins these on the current period's progress bar and lists them
   at the bottom. Shape: `{date, kind: "action" | "good" | "info", text}`, text under ~50 characters,
   no account numbers. Add an "action" when I need to do something by a date (date = the deadline) and
   remove it once it's done or the date has passed and you've reported what happened. Add "good" for
   good news and "info" for things worth seeing; the app hides those three days after their date, so
   delete them after about a week. Keep it to about four.

   Plan: `plan.income` and `plan.expenses` are the recurring items used to project future periods
   (see docs/data-model.md). Never forecast discretionary spending: the plan holds only planned bills,
   transfers and income. When a bill starts, stops or changes amount, update the plan and mention it
   in the brief. Remove one-off plan items once their date has passed. When a pay slip changes my
   take-home pay, use the real figure.

   On payday, roll over: first build the finished period for `history` (periodStart, periodEnd,
   payday, opening, balance = the balance just before the salary landed, income and expenses all
   done), then set `opening` = that pre-salary balance, `periodStart` = the day before payday,
   `periodEnd` = the day before the next payday, `payday` = the next payday, and a fresh list: the
   salary (done), payday debt payments, every bill due in the period from the plan (not done) and an
   empty Discretionary group. Carry over any "action" alerts that are still open.

   Write to BOTH places:
   (a) Artifact: ArtifactData `set` `budget/current` with `file_path` = your edited file, pinned with
       `if_version`.
   (b) Phone app. **Cloudflare** (D1 database `{{D1_DATABASE_ID}}`): with the Cloudflare API token in the environment,
       POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/{{D1_DATABASE_ID}}/query
       with `{"sql": "UPDATE docs SET body = json_patch(body, json(?)), updated_at = datetime('now') WHERE id = 'current'", "params": [<the document WITHOUT history>]}`,
       reading the JSON from your file so nothing is retyped. On a rollover, first append the finished
       period: `UPDATE docs SET body = json_insert(body, '$.history[#]', json(?)) ... WHERE id = 'current'
       AND json_array_length(body, '$.history') = <current count>`. If you only have the Cloudflare MCP
       tool, use targeted json_set / json_insert / json_remove edits nested inside ONE assignment to
       `body` (SQLite keeps only the last assignment), guarded with json_extract checks.
       Then check D1 matches: `SELECT length(body), json_valid(body), json_array_length(body, '$.history')`
       (D1 stores 45 as 45.0, so compare fields rather than lengths).
       **Vercel + Supabase** (table `docs`, row `current`, column `body` jsonb): with `SUPABASE_URL` and
       `SUPABASE_SECRET_KEY` in the environment, write the WHOLE document (history included) from your
       file: `jq -c '{body: .}' <file> | curl -sS -X PATCH "$SUPABASE_URL/rest/v1/docs?id=eq.current" -H "apikey: $SUPABASE_SECRET_KEY" -H "content-type: application/json" --data-binary @-`.
       With the Supabase connector instead, use `execute_sql`:
       `update docs set body = body || $j$<the document WITHOUT history>$j$::jsonb where id = 'current'`,
       and on a rollover first `update docs set body = jsonb_set(body, '{history}', (body->'history') || jsonb_build_array($j$<the finished period>$j$::jsonb)) where id = 'current' and jsonb_array_length(body->'history') = <current count>`.
       Then check: `select body->>'asOf', jsonb_array_length(body->'history') from docs where id = 'current'`.

5. **Reminders** when they're due (gently, not every day):
   - {{e.g. "Reconnect the bank connections before 24 Dec."}}
   - {{e.g. "From 1 Jul 2027, remind me now and then that my mortgage fix ends 31 Dec 2027."}}
   - Don't remind me about: {{THINGS YOU DON'T WANT NAGGING ABOUT}}.

6. **Push notification** (last step, after the data is written): queue ONE row in `notifications`
   (**Cloudflare**: in D1, `INSERT INTO notifications (title, body, url) VALUES (?, ?, '/')`;
   **Vercel + Supabase**: `POST $SUPABASE_URL/rest/v1/notifications` with `{"title": …, "body": …}`,
   or the same INSERT with the Supabase connector) with title "Budget" (or
   "Budget: action needed" when something needs doing today) and a plain-text body of at most ~180
   characters: the Period End Cash and its change, plus the single most important flag. It's sent
   within a minute. Check it went: `SELECT sent_at, result FROM notifications ORDER BY id
   DESC LIMIT 1` ("no devices" means notifications aren't on yet: mention the bell in the app once).

If a bank connection needs reconnecting or the data looks stale, say so plainly instead of guessing.
