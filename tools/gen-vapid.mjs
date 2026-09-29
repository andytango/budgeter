// Generates a VAPID key pair for Web Push (Node 20+, no dependencies).
//   node tools/gen-vapid.mjs          → {"publicKey": "...", "privateJwk": "{...}"} on stdout
// publicKey  → VAPID_PUBLIC_KEY (public; wrangler.jsonc vars or a Vercel env var)
// privateJwk → VAPID_PRIVATE_JWK (SECRET: Worker secret or sensitive Vercel env var; never commit it,
//              never print it in chat). Write the output to a temp file outside any repo and delete it
//              once both values are stored. Replacing the key later means every device must re-enable
//              notifications.
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const privateJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
console.log(JSON.stringify({ publicKey, privateJwk }));
