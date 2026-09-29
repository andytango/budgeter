// Generates a VAPID key pair for Web Push (Node 18+, no dependencies).
//   node tools/gen-vapid.mjs
// Put the public key in app/wrangler.jsonc (VAPID_PUBLIC_KEY) and the private JWK in the Worker secret:
//   cd app && npx wrangler secret put VAPID_PRIVATE_JWK   (paste the JSON when asked)
// Keep the private key out of the repo. Replacing it later means every device has to turn notifications on again.
import { webcrypto as crypto } from "node:crypto";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log("VAPID_PUBLIC_KEY (wrangler.jsonc vars):\n" + b64url(publicRaw) + "\n");
console.log("VAPID_PRIVATE_JWK (Worker secret; don't commit it):\n" + JSON.stringify(privateJwk));
