// Sign-in for Vercel + Supabase: tools/create.mjs puts this in place of the no-op app/auth.js.
//
// Supabase Auth emails you a one-time code (a code rather than a link, because a link opens Safari
// instead of the Home Screen app). The session is kept in this browser and refreshed as needed, so
// you sign in about once a month. Only existing users can sign in (no sign-ups), and the server
// additionally only accepts the addresses in ALLOWED_EMAILS.
(function () {
  const STORE = "budget-session", CONFIG = "budget-auth-config";

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
  const save = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch {} };
  let session = load(STORE);

  // The project's public settings, from /api/config. Kept for offline starts and refreshed each launch.
  let config = load(CONFIG);
  const fresh = fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then((c) => {
    if (c && c.supabaseUrl && c.publishableKey) { config = c; save(CONFIG, c); }
    return config;
  }).catch(() => config);
  const settings = async () => config || (await fresh);

  async function auth(path, body) {
    const { supabaseUrl, publishableKey } = (await settings()) || {};
    if (!supabaseUrl) throw new Error("Sign-in isn't configured");
    const res = await fetch(supabaseUrl.replace(/\/+$/, "") + "/auth/v1/" + path, {
      method: "POST",
      headers: { apikey: publishableKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.msg || data.error_description || data.message || "Sign-in failed"), { status: res.status });
    return data;
  }

  const keep = (d) => {
    session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600) };
    save(STORE, session);
  };

  // A valid access token, refreshing it if it's (nearly) expired. Offline, the old one is used and the
  // service worker serves the cached budget.
  let refreshing = null;
  async function token() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    refreshing = refreshing || auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then(keep)
      .catch((e) => { if (e.status >= 400 && e.status < 500) { session = null; save(STORE, null); } })
      .finally(() => { refreshing = null; });
    await refreshing;
    return session && session.access_token;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Shows the sign-in form in place of the budget; resolves once signed in.
  let pending = null;
  function signIn() {
    session = null; save(STORE, null);
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const app = document.getElementById("app");
      let email = "";
      const draw = (step, msg) => {
        app.innerHTML = '<h1>Monthly Budget</h1><form class="signin box" novalidate>' +
          (step === "email"
            ? '<label for="si-in">Email</label><input id="si-in" type="email" autocomplete="email" inputmode="email" required value="' + esc(email) + '"><button type="submit">Email me a code</button>'
            : '<p>We sent a code to <b>' + esc(email) + '</b>.</p><label for="si-in">Code</label><input id="si-in" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]*" required><button type="submit">Sign in</button><button type="button" class="link">Use a different email</button>') +
          (msg ? '<p class="msg">' + esc(msg) + "</p>" : "") + "</form>";
        const form = app.querySelector("form"), input = form.querySelector("input");
        input.focus();
        const back = form.querySelector(".link");
        if (back) back.onclick = () => draw("email");
        form.onsubmit = async (e) => {
          e.preventDefault();
          const value = input.value.trim();
          if (!value) return;
          form.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          try {
            if (step === "email") {
              email = value;
              await auth("otp", { email, create_user: false });
              draw("code");
            } else {
              keep(await auth("verify", { type: "email", email, token: value }));
              pending = null;
              app.innerHTML = '<p class="status">Loading…</p>';
              resolve();
            }
          } catch (err) {
            draw(step, step === "email" ? "Couldn't send a code to that address." : "That code didn't work. Check it, or ask for a new one.");
          }
        };
      };
      draw("email");
    });
    return pending;
  }

  const style = document.createElement("style");
  style.textContent = [
    ".signin { background: var(--card); padding: 16px; display: grid; gap: 10px; }",
    ".signin p { margin: 0; }",
    ".signin label { font-weight: 700; }",
    ".signin input { font: inherit; font-size: 18px; padding: 10px 12px; border: 2px solid var(--edge); border-radius: 8px; background: var(--frame); color: var(--ink); -webkit-user-select: text; user-select: text; }",
    ".signin button { font: inherit; font-weight: 800; font-size: 17px; padding: 10px; border: 2px solid var(--edge); border-radius: 10px; background: var(--inc-head); color: var(--ink); }",
    ".signin button.link { background: none; border: 0; font-weight: 600; font-size: 15px; color: var(--ink-soft); text-decoration: underline; }",
    ".signin .msg { color: var(--exp-num); font-weight: 600; }",
  ].join("\n");
  document.head.appendChild(style);

  window.BudgetAuth = {
    // Resolves when there's a session: straight away if one is saved, otherwise after signing in.
    ready: () => (session ? Promise.resolve() : signIn()),
    signIn,
    async fetch(path, opts = {}) {
      const t = await token();
      const headers = Object.assign({}, opts.headers, t ? { Authorization: "Bearer " + t } : {});
      return fetch(path, Object.assign({}, opts, { headers }));
    },
    signOut() { session = null; save(STORE, null); location.reload(); },
  };
})();
