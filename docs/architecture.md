# How Budgeter fits together

```
          ┌──────────────── Claude (scheduled routine, in the user's private repo) ────────────────┐
 bank ────┤  every morning: read balances + transactions, explain them from email, update the       │
 email ───┤  budget JSON, write a brief, queue a push notification. CLAUDE.md = working memory.      │
          └──────────────┬──────────────────────────────────────────────────┬──────────────────────┘
                         │ writes the budget + notifications                 │ (optional) mirrors it
                         ▼                                                   ▼
        ┌──────────── platform adapter ────────────┐              Claude artifact
        │ store: docs · push_subs · notifications   │              claude/artifact.html
        │ sign-in check (Access / Supabase Auth)    │              + panel.js/css
        │ every minute: deliverPending()            │
        └──────────────┬────────────────────────────┘
                       │ handleApi()  (server/api.js, server/push.js)
                       ▼
        /api/budget · /api/push/{key,subscribe,unsubscribe,test}
                       │
                       ▼
        the app (app/): index.html shell + panel.js/panel.css, service worker, push
        → the phone's Home Screen
```

## The pieces

- **`app/`**: a static PWA. `panel.js` does all the rendering and the projections (future pay periods
  from the plan, tax years, loans); `panel.css` holds the look, with every colour a `:root` token for
  light and dark mode. `index.html` loads the budget from `/api/budget`, handles the push bell, and
  registers `sw.js` (network first, cached copy offline). `auth.js` is a sign-in hook: empty where the
  platform signs you in at the edge (Cloudflare Access), replaced by an emailed-code sign-in on
  Vercel + Supabase.
- **`server/api.js`**: the API as one function, `handleApi(request, store, env)`, plus the `store`
  interface every platform implements. **`server/push.js`**: Web Push (VAPID and aes128gcm encryption
  on WebCrypto) and `deliverPending(store, env)`, which sends due notifications, drops dead devices and
  marks old messages stale.
- **`platforms/<name>/`**: everything host-specific. The Cloudflare Worker verifies the Access token
  and uses D1. The Vercel functions check a Supabase Auth token against `ALLOWED_EMAILS` and use
  Supabase's REST API; Supabase `pg_cron` calls the delivery endpoint every minute.
- **`tools/create.mjs`**: copies `app/`, `server/` and one platform into a flat, deployable folder
  that lives in the user's private repo.

## The model

Everything is organised by **pay period**: from the day before payday to the day before the next
payday, when the balance is lowest.

```
Start of Period (balance just before the salary)
+ Income        (the whole period)
− Expenses      (the whole period: bills, debt payments, every discretionary spend)
= Period End Cash   (= today's balance + income still to come − expenses still to come)
```

Planned items (salary, bills, debt payments) come from a recurring **plan**. **Discretionary spending
is never forecast**: it only appears once spent, so the forecast shows what's left if nothing else is
spent. Future periods are projected from the plan for five years, with each debt's balance simulated
(monthly interest; payments stop at £0). Past periods live in `history`. The format is in
[data-model.md](data-model.md).

## Security

- The budget is only served after the platform's sign-in check (Access JWT verified by the Worker
  itself; Supabase token plus an allowed-email list on Vercel). Both fail closed.
- On Supabase, Row Level Security is on with no policies, so the publishable key in the browser can't
  touch the tables; only the server (secret key) can.
- The push private key and database credentials exist only in the platform's secret store and the
  user's Claude environment.
- Push payloads pass through Apple's or Google's push service, encrypted; keep them short and no more
  sensitive than a lock-screen message.
