// Shared test helpers: generated apps, VAPID keys, a fake push service and a fake phone subscription.
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("..", import.meta.url));
export const b64u = (b) => Buffer.from(b).toString("base64url");

// Runs tools/create.mjs into a temp folder and returns its path.
export function createApp(platform) {
  const dir = join(mkdtempSync(join(tmpdir(), "budgeter-")), "app");
  execFileSync(process.execPath, [join(repo, "tools", "create.mjs"), platform, dir], { stdio: "pipe" });
  return dir;
}

export async function vapidEnv() {
  const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  return {
    VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey("raw", k.publicKey)),
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", k.privateKey)),
    VAPID_SUBJECT: "https://budget.example.com",
  };
}

// A browser-style push subscription's keys.
export async function phoneKeys() {
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { p256dh: b64u(await crypto.subtle.exportKey("raw", ua.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}

// A push service that records requests; paths containing "gone" answer 410 like an expired subscription.
export async function pushService() {
  const received = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      received.push({ path: req.url, encoding: req.headers["content-encoding"], auth: req.headers.authorization });
      res.writeHead(req.url.includes("gone") ? 410 : 201);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { received, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
