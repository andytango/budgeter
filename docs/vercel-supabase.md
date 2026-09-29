# Hosting on Vercel + Supabase

The same app, with Vercel serving it and Supabase holding the data and signing you in. It does
everything the Cloudflare version does: the phone app, push notifications (scheduled ones too), and
the daily routine writing your budget.

| | Cloudflare (default) | Vercel + Supabase |
|---|---|---|
| App and API | Worker (`app/src/index.js`) | Vercel Functions (`api/`) |
| Database | D1 (SQLite) | Supabase Postgres ([`schema.sql`](../platforms/vercel-supabase/schema.sql)) |
| Sign-in | Cloudflare Access, emailed code | Supabase Auth, emailed code ([`auth.js`](../platforms/vercel-supabase/auth.js)) |
| Every-minute push delivery | Worker cron | Supabase `pg_cron` calling `/api/cron/deliver` (or Vercel Cron on Pro) |
| Custom domain | Required (Access needs one) | Optional: `your-project.vercel.app` works |

The screens (`app/public`) and the push encryption (`app/src/push.js`) are shared, so changes to the
app work on both.

## How it's secured

- The pages and code are public (they're open source anyway). **Your budget isn't:** it's only
  served by `/api/budget`, which asks Supabase who you are and checks your address is in
  `ALLOWED_EMAILS`.
- The database has Row Level Security on and no policies, so the publishable key in the browser can't
  read or write anything. Only the Vercel functions (and Claude) use the secret key.
- Sign-ups are off: only the user you create can get a code, and only allowed addresses get data.
- The delivery endpoint needs `CRON_SECRET`.

## You'll need

- A **Supabase** account (the free plan is enough) and a **Vercel** account (Hobby is enough).
- **Node 20+** on your computer, just to generate the push keys.
- A private GitHub repo for your finances with this project in it (see
  [setup.md, step 1](setup.md#1-make-a-private-repo-for-your-finances)). Vercel deploys from it.

## 1. Create the Supabase project

1. Supabase dashboard → **New project**. Pick a region near you and a strong database password
   (you won't need it day to day).
2. **SQL Editor → New query**: paste [`platforms/vercel-supabase/schema.sql`](../platforms/vercel-supabase/schema.sql)
   and **Run**. (Leave the commented-out cron part for step 5.)
3. Note these from **Project Settings**:
   - **Project URL** (`https://<ref>.supabase.co`, under Data API or the Connect button),
   - **API Keys**: the **publishable** key (`sb_publishable_…`) and a **secret** key (`sb_secret_…`).
     Older projects have `anon` and `service_role` keys instead; those work too (anon = publishable,
     service_role = secret).

## 2. Set up sign-in

In **Authentication**:

1. **Users → Add user → Create new user**: your email, any long random password (it's never used),
   and tick **Auto Confirm User**.
2. **Sign In / Providers**: keep **Email** on and turn **Allow new users to sign up** off.
3. **Emails → Templates → Magic Link**: make the email show the code instead of (or as well as) the
   link, because a link would open Safari rather than the Home Screen app. For example:

   ```html
   <h2>Your Budgeter code</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   ```

Supabase's built-in email is rate-limited and only delivers to members of your Supabase
organisation, which is fine for one person signing in about once a month. If you need more (say, a
partner also signs in), set up custom SMTP under **Authentication → Emails → SMTP Settings**.

## 3. Push notification keys

```sh
node tools/gen-vapid.mjs
```

It prints a public key and a private JWK. You'll paste both into Vercel next; don't save the private
one anywhere in the repo.

## 4. Deploy to Vercel

1. Vercel → **Add New → Project** → import your private finance repo.
2. **Root Directory**: the folder that holds this project (e.g. `budgeter`). Leave the framework
   preset as it is; [`vercel.json`](../vercel.json) sets the build.
3. **Environment Variables**:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | the publishable (or anon) key. It's built into the page, which is fine. |
   | `SUPABASE_SECRET_KEY` | the secret (or service_role) key. Mark it **Sensitive**. |
   | `ALLOWED_EMAILS` | your email (comma-separate several) |
   | `VAPID_PUBLIC_KEY` | from step 3 |
   | `VAPID_PRIVATE_JWK` | the whole JSON from step 3. **Sensitive**. |
   | `VAPID_SUBJECT` | `mailto:you@example.com` or your app's URL |
   | `CRON_SECRET` | a long random string, e.g. from `openssl rand -hex 32`. **Sensitive**. |

4. **Deploy.** The build copies `app/public` to `dist/` and swaps in the Supabase sign-in; the build
   stops if the publishable key is actually a secret one.
5. Optional: **Settings → Domains** to use your own domain.

Open the site: you should get the sign-in form, receive a code, and then see "No budget yet" (the
database is empty).

Every push to the repo's production branch redeploys, so code changes Claude makes and pushes go
live on their own. Data changes need no deploy.

## 5. Deliver notifications every minute

Vercel's free cron only runs once a day, so Supabase calls the delivery endpoint instead. In the SQL
Editor, run the last part of `schema.sql` with your URL and `CRON_SECRET` filled in:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('budget-deliver', '* * * * *', $$
  select net.http_post(
    url := 'https://your-app.vercel.app/api/cron/deliver',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
  )
$$);
```

Check it's working a couple of minutes later:
`select status_code, content from net._http_response order by id desc limit 3;` should show `200`
and `{"sent":0}`.

**On Vercel Pro** you can use Vercel Cron instead: add
`"crons": [{ "path": "/api/cron/deliver", "schedule": "* * * * *" }]` to `vercel.json`. Vercel sends
the `CRON_SECRET` header for you. (On Hobby, a per-minute schedule fails the deploy.)

## 6. Load a budget

The simplest way is the SQL Editor, using Postgres's `$j$` quotes so the JSON needs no escaping:

```sql
insert into docs (id, body) values ('current', $j$ <paste the whole JSON here> $j$::jsonb)
on conflict (id) do update set body = excluded.body;
```

Start with [`examples/demo-budget.json`](../examples/demo-budget.json) to check everything works,
then replace it with your own (see [claude.md](claude.md#your-first-budget)).

## 7. Put it on your phone

As in [setup.md, step 7](setup.md#7-put-it-on-your-phone): open the site in Safari (iPhone) or
Chrome (Android), sign in with the emailed code, **Add to Home Screen**, open it from there and tap
the bell. You stay signed in: the app refreshes its session in the background.

## 8. Give Claude access

The daily routine writes the budget and queues notifications in Supabase. Either:

- connect the **Supabase connector** in Claude (it runs SQL with `execute_sql`), or
- add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to your Claude Code on the web **environment**, so
  the routine can use the REST API with `curl`. If the environment has a restricted network policy,
  allow `<ref>.supabase.co`.

The routine template covers both: in [`templates/daily-routine.md`](../templates/daily-routine.md)
keep the Supabase lines and delete the Cloudflare ones, and likewise in `templates/CLAUDE.md`.

Notifications, from Claude or from you in the SQL Editor:

```sql
insert into notifications (title, body) values ('Budget', 'Your text');
-- later, in your own time zone:
insert into notifications (title, body, created_at) values ('Budget', 'Your text', '2026-10-01 08:00 Europe/London');
```

## Good to know

- **Supabase pauses free projects** after a week without activity. The daily routine and the app
  count as activity, so in practice it stays awake; if it does pause, restore it from the dashboard.
- **Preview deployments** get the same environment variables unless you scope them to Production.
  They still need sign-in, and Vercel protects previews by default.
- To try the screens locally without any of this: `node tools/preview.mjs` (demo data, no sign-in).
  For the full stack locally, use `vercel dev` with the same environment variables in `.env.local`
  (it's in `.gitignore`).

## Other hosts

Any host works if it can provide five things: static files (`app/public`), the five API routes
(`/api/budget`, `/api/push/key|subscribe|unsubscribe|test`), a way to call the delivery loop every
minute, somewhere to keep one JSON document and two small tables, and a sign-in check in front of the
data. `app/src/push.js` runs anywhere with WebCrypto (Node 20+, Deno, Bun, Workers), and its
`deliverPending(store, env)` takes a small storage adapter: see `pushStore` in
[`api/_lib/supabase.js`](../api/_lib/supabase.js) and `d1Store` in
[`app/src/index.js`](../app/src/index.js). The front end calls the API through `window.BudgetAuth`
if an `auth.js` defines it, so a different sign-in only needs a different `auth.js`.
