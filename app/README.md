# Budget Panel app

The phone app (PWA) and the Cloudflare Worker that serves it. Setup is in [../docs/setup.md](../docs/setup.md).

- `public/`: the app. `index.html` (shell, loader, push sign-up), `panel.js` + `panel.css` (all rendering
  and the projection engine; also used by the Claude artifact), `manifest.webmanifest`, `sw.js` (offline
  copy and push display), icons. Light and dark palettes follow the phone's setting; every colour is a
  `:root` token in `panel.css`.
- `src/index.js`: the Worker. Verifies the Cloudflare Access token on every request, serves the app,
  returns the budget from D1 at `/api/budget`, and handles push sign-up (`/api/push/key`,
  `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/test`). Its cron (every minute) sends
  queued notifications.
- `src/push.js`: Web Push with no dependencies: VAPID (RFC 8292) and aes128gcm encryption (RFC 8291)
  on WebCrypto.
- `schema.sql`: the D1 tables `docs`, `push_subs` and `notifications`.
- `icon-source.svg`, `icon-source-dark.svg`: the Home Screen icons (see "Customising" in the setup guide).

Deploy with `npm install && npx wrangler deploy` (uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`,
or `npx wrangler login`).

The service worker fetches network-first and falls back to its cached copy offline. Bump `SHELL` in
`sw.js` when you add or rename files it caches.
