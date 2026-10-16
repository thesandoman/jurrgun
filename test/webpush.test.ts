/**
 * Web Push encryption and VAPID (src/lib/webpush.ts), checked the way a
 * browser would: decrypt with the subscription's private key, and verify the
 * VAPID signature with the public key.
 */
import { describe, expect, it } from "vitest";
import { allowedEndpoint, b64urlDecode, b64urlEncode, contentKeys, encryptPayload, vapidHeader } from "../src/lib/webpush";

async function p256() {
  const k = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer);
  return { keys: k, raw };
}

describe("web push", () => {
  it("encrypts so the browser's key can decrypt it (RFC 8291, aes128gcm)", async () => {
    const ua = await p256();
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const message = { title: "Jurrgun", body: "พรุ่งนี้ 18:00 ตระเวนกินเยาวราช", url: "/me/events/x/pass" };
    const body = await encryptPayload({ p256dh: b64urlEncode(ua.raw), auth: b64urlEncode(auth) }, new TextEncoder().encode(JSON.stringify(message)));

    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096);
    const idlen = body[20];
    expect(idlen).toBe(65);
    const asPublic = body.slice(21, 21 + idlen);
    const sealed = body.slice(21 + idlen);

    const as = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: as } as unknown as SubtleCryptoDeriveKeyAlgorithm, ua.keys.privateKey, 256));
    const { cek, nonce } = await contentKeys(secret, auth, ua.raw, asPublic, salt);
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
    expect(plain[plain.length - 1]).toBe(2); // last-record delimiter
    expect(JSON.parse(new TextDecoder().decode(plain.slice(0, -1)))).toEqual(message);
  });

  it("signs a VAPID token the public key verifies, for the push service's origin", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
    const keys = { publicKey: b64urlEncode(raw), privateKey: jwk.d!, subject: "https://jurrgun.apps.sv-academy.org" };
    const now = new Date("2026-10-16T03:00:00Z");
    const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe(keys.subject);
    expect(claims.exp).toBe(Math.floor(now.getTime() / 1000) + 12 * 3600);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, b64urlDecode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("only accepts https endpoints on the known push services", () => {
    expect(allowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(allowedEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(allowedEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(allowedEndpoint("https://localhost:8787/x")).toBe(false);
    expect(allowedEndpoint("not a url")).toBe(false);
  });
});
