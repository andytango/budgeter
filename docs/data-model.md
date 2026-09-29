# The budget document

One JSON document holds the whole budget. It's stored twice, with identical content: in D1 (`docs`
table, row `current`) for the phone app, and in the Claude artifact's database (`budget/current`) for
the artifact. [`examples/demo-budget.json`](../examples/demo-budget.json) is a complete example.

Dates are ISO strings (`YYYY-MM-DD`) and amounts are positive numbers in pounds: whether an item is
money in or money out depends on the list it's in (`income` or `expenses`). Negative amounts are
allowed and mean "money back" (a refund, or someone's share of a bill).

## Top level

| Field | Meaning |
|---|---|
| `asOf` | Date of the last update. |
| `updatedLabel` | Shown as "updated …" under the dates (e.g. `"29 Sep"`). Falls back to `asOf`. |
| `periodStart` | The day before the last payday: the start of the current pay period. |
| `periodEnd` | The day before the next payday: the end of the current period. |
| `payday` | The NEXT payday. |
| `opening` | Start of Period: the balance just before the salary landed. |
| `balance` | Today's balance, minus pending card payments. |
| `income`, `expenses` | Groups of items for the current period (below). |
| `debts` | Loans and cards, shown on the Loans tab and simulated in projections. |
| `note` | One or two sentences shown above the total. `**bold**` works. |
| `alerts` | Timeline notes for the current period. |
| `plan` | Recurring items used to project future periods. |
| `history` | Finished periods, oldest first. |

## Groups and items

```json
{ "group": "Housing", "items": [
  { "name": "Mortgage", "amount": 1050, "due": "2026-10-01" },
  { "name": "Council tax", "amount": 165, "due": "2026-10-07", "done": true }
] }
```

| Item field | Meaning |
|---|---|
| `name` | Label. |
| `amount` | Pounds. Negative = money back. |
| `due` | Date it happens (or happened). |
| `done` | `true` once it has actually happened. |
| `est` | `true` for an estimate; shown with an "est." tag. |
| `flag` | Optional short label shown as an amber tag (e.g. `"check"`). |
| `debt` | Name of an entry in `debts` that this payment reduces. |
| `count` | In history: how many transactions were merged into this line (shown as "×3"). |

**Period End Cash** = `balance` + income not yet `done` − expenses not yet `done`: today's money plus
what's still to come. Planned items that haven't happened yet are included; discretionary spending you
haven't done yet isn't.

A group with `"discretionary": true` holds the spending that isn't planned. The page checks that
`opening` + all income − all expenses equals Period End Cash, and shows any difference in that group as
"Spending not itemised yet" (or "Refunds not itemised yet"). A fully itemised period has no such line.

## Debts

```json
{ "name": "Credit card", "rate": "22.9% APR", "apr": 22.9, "monthly": 200, "balance": 1400, "start": 2500 }
```

| Field | Meaning |
|---|---|
| `name` | Matches the `debt` field on payment items and plan items. |
| `rate` | Display text. |
| `apr` | Annual rate used for the simulation (monthly interest = apr / 12). |
| `monthly` | Usual payment; used for "months left" when the forecast doesn't clear it. |
| `balance` | Current balance. |
| `start` | Starting balance, for "% paid off". |

In projections each debt's balance gets a month of interest per period, then the plan's payments with
that `debt` come off in date order; once it reaches £0 those payments stop. The Loans tab's "clear by"
date is the forecast's last payment.

## Alerts (timeline notes)

```json
{ "date": "2026-10-02", "kind": "action", "text": "Renew the TV licence before it lapses" }
```

`kind` is `action` (amber: something to do; stays until removed), `good` (green) or `info` (grey).
Good and info notes hide three days after their date. Only the current period shows them: as pins on
the progress bar and as a list at the bottom.

## Plan

```json
"plan": {
  "income": [
    { "group": "Salary", "name": "{month} pay", "amount": 3150, "payday": true, "est": true }
  ],
  "expenses": [
    { "group": "Housing", "name": "Mortgage", "amount": 1050, "day": 1 },
    { "group": "Housing", "name": "Council tax", "amount": 165, "day": 7, "months": [4,5,6,7,8,9,10,11,12,1] },
    { "group": "Debt Repayments", "name": "Credit card", "amount": 200, "day": 1, "debt": "Credit card" },
    { "group": "Groceries", "name": "Food shop", "amount": 45, "weekly": 0, "est": true },
    { "group": "Subscriptions", "name": "Annual insurance", "amount": 480, "date": "2027-03-14", "everyYears": 1 },
    { "group": "Debt Repayments", "name": "Credit card (extra)", "amount": 500, "date": "2026-10-30", "debt": "Credit card" }
  ]
}
```

Each item has `group`, `name`, `amount` and exactly one schedule:

| Schedule | Meaning |
|---|---|
| `"day": N` | Monthly on day N (the last day in shorter months). |
| `"weekly": N` | Every week on weekday N (0 = Sunday … 5 = Friday, 6 = Saturday). |
| `"payday": true` | On payday. |
| `"date": "YYYY-MM-DD"` | Once; add `"everyYears": 1` (or 2) to repeat annually (or every two years). |

Optional: `months` (only in these calendar months, 1–12), `from` / `until` (ISO dates), `est`,
`debt`. `{month}` in a name becomes the payday's month ("October pay").

The plan holds only planned bills, transfers and income. Don't put discretionary spending in it: the
forecast is meant to show what you'd have left without any.

## History

Each entry is a finished period in the same shape as the current one: `periodStart`, `periodEnd`,
`payday`, `opening`, `balance` (the balance just before the next salary), `income`, `expenses`, all
items `done`. The daily routine appends one at every payday; `tools/backfill.py` builds the first
ones from a bank statement.
