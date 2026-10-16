// Prints a fresh VAPID key pair for Web Push (src/lib/webpush.ts).
// Set both as SV Cloud settings; never commit them:
//   VAPID_PUBLIC_KEY   (the uncompressed P-256 point, base64url)
//   VAPID_PRIVATE_KEY  (the private scalar, base64url)
// A new pair makes every existing subscription stop working, so make one once.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const b64url = (b) => Buffer.from(b).toString("base64url");
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
