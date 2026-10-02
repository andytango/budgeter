// Keeps the app shell and the last budget on the phone so it opens offline.
const SHELL = "budget-shell-v15";
const DATA = "budget-data-v1";
const SHELL_FILES = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/panel.css", "/panel.js", "/auth.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Budget data: always try the network; fall back to the last good copy when offline.
  if (url.pathname === "/api/budget") {
    e.respondWith(fetch(e.request).then((res) => {
      const ok = res.ok && (res.headers.get("content-type") || "").includes("application/json");
      if (ok) caches.open(DATA).then((c) => c.put("/api/budget", res.clone()));
      return res;
    }).catch(() => caches.match("/api/budget").then((r) => r || Response.error())));
    return;
  }

  // Other API calls (sign-in config, push keys): always the network, never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Pages: network first (so Cloudflare Access can send you to sign in); cached shell when offline.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
    return;
  }

  // Code, styles, icons, manifest: network first so updates arrive straight away; cached copy offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && !res.redirected) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || Response.error())));
});

// Push notifications (daily brief, reminders). The payload is {title, body, url}.
self.addEventListener("push", (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || "Budget", {
    body: msg.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: msg.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if ("focus" in w) { w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
