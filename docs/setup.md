# Setup

About an hour, most of it clicking through Cloudflare. You'll need:

- a **Cloudflare account** with a **domain** on it (the app lives on a subdomain such as
  `budget.example.com`),
- **Node 18+** on your computer (for `wrangler`, Cloudflare's CLI),
- a **GitHub account** for a private repo that holds your finances,
- a **Claude plan with Claude Code on the web** (for the daily routine and connectors).

Everything below uses `budget.example.com`; use your own subdomain.

## 1. Make a private repo for your finances

Your budget, `CLAUDE.md` and statements must never be public. Create a **private** GitHub repo (for
example `my-finances`) and copy this project into it as a folder:

```
my-finances/
├── CLAUDE.md          ← from templates/CLAUDE.md, filled in over time
└── budget-panel/      ← this repo
```

Claude Code on the web will run in this private repo, so the daily routine can read `CLAUDE.md` and
deploy changes to the app.

## 2. Create the database

```sh
cd budget-panel/app
npm install
npx wrangler login                      # or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
npx wrangler d1 create budget-panel-db  # prints a database_id
```

Put the `database_id` into `app/wrangler.jsonc`, then create the tables:

```sh
npx wrangler d1 execute budget-panel-db --remote --file=schema.sql
```

## 3. Push notification keys

```sh
node ../tools/gen-vapid.mjs
```

- Put the **public key** in `app/wrangler.jsonc` → `VAPID_PUBLIC_KEY`.
- Store the **private JWK** as a Worker secret. Paste the whole JSON when it asks, and don't save it
  anywhere in the repo:

  ```sh
  npx wrangler secret put VAPID_PRIVATE_JWK
  ```

  (If `wrangler` says the Worker doesn't exist yet, deploy once (step 5) and run this again.)

Also set `VAPID_SUBJECT` to `https://budget.example.com`.

## 4. Lock it down with Cloudflare Access

The Worker refuses every request that doesn't carry a valid Access token, so this step is required.

1. Open **Cloudflare Zero Trust** (from the Cloudflare dashboard). The first time, pick a **team name**:
   your team domain becomes `https://<team>.cloudflareaccess.com`. The free plan is enough.
2. **Access → Applications → Add an application → Self-hosted.**
   - Application domain: `budget.example.com`.
   - Session duration: 1 month is comfortable on a phone.
   - Login method: **One-time PIN** (a code by email). No identity provider needed.
3. Add a policy: **Allow**, Include **Emails** = your email address (and nobody else's).
4. Save, then open the application and copy its **Application Audience (AUD) tag**.

Put both into `app/wrangler.jsonc`:

```jsonc
"ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com",
"ACCESS_AUD": "<the AUD tag>",
```

Leave `"workers_dev": false` and `"preview_urls": false` as they are: those addresses would bypass
Access. The Worker checks the token itself as well, so a misconfiguration fails closed.

## 5. Deploy

Set your domain in `app/wrangler.jsonc` → `routes` (`"pattern": "budget.example.com"`), then:

```sh
npx wrangler deploy
```

Wrangler creates the DNS record for the custom domain. Visit `https://budget.example.com`: you should
get the Access login, then "No budget yet".

## 6. Load a budget

Start from the demo to check everything works, then replace it with your own (see
[claude.md](claude.md#your-first-budget)):

```sh
node ../tools/make-seed.mjs ../examples/demo-budget.json > ../seed.sql
npx wrangler d1 execute budget-panel-db --remote --file=../seed.sql
rm ../seed.sql
```

`seed.sql` contains the whole budget, so delete it afterwards (it's also in `.gitignore`). D1 caps a
single statement at about 100 KB, which is plenty: a year of history is roughly 40 KB.

## 7. Put it on your phone

1. Open `https://budget.example.com` in **Safari** (iPhone) or Chrome (Android) and sign in with the
   emailed code.
2. **Share → Add to Home Screen.** On iPhone, push notifications only work from the Home Screen app.
3. Open it from the Home Screen and tap the **bell**. Allow notifications: you'll get a test message.

The Home Screen icon is embedded in `index.html` as a data URI because iOS fetches it without your
Access cookie (a URL would get the login page instead).

## 8. Give Claude access

For the daily routine to update the phone app, Claude needs to write to D1:

- Create a **Cloudflare API token** (My Profile → API Tokens → Create Token → Custom) with
  **Account → D1 → Edit**. Add **Account → Workers Scripts → Edit** if you want Claude to deploy
  changes to the app too.
- Add it to your Claude Code on the web **environment** as the environment variables
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (your account ID is on the Cloudflare dashboard
  home page).
- Alternatively, connect the **Cloudflare connector** in Claude; the routine template covers both.

Then carry on with [claude.md](claude.md): the connectors, the artifact and the daily routine.

## Customising

| What | Where |
|---|---|
| Payday rule (default: last Friday of the month, earlier if that's a bank holiday) | `paydayOf` and `isWorkday` in `app/public/panel.js` |
| How far ahead to project (default 60 pay periods, 5 years) | `AHEAD` in `panel.js` |
| Currency and date format (default £ and `en-GB`) | `whole`, `pence` and `fmt` at the top of `panel.js` |
| Tax year (default UK, 6 April to 5 April) | `taxYears` in `panel.js` |
| Colours, light and dark | the `:root` tokens in `app/public/panel.css` |
| App name and colours on the Home Screen | `app/public/manifest.webmanifest` |
| Home Screen icon | edit `app/icon-source.svg` / `icon-source-dark.svg`, render 180×180, 192×192 and 512×512 PNGs, and replace the `data:` URIs in `index.html` |

After changing `panel.js` or `panel.css`, redeploy the Worker **and** republish the artifact, which
uses the same two files.

To try changes locally first: `node tools/preview.mjs` serves `app/public` with the demo data.
