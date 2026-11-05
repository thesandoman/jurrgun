/**
 * Push to the phone app through Expo's push service (Mobile App, Nov 2026).
 * The app registers its Expo push token through POST /settings/push; the row
 * sits in social_push_subscriptions beside the browsers', with the token as
 * its endpoint and no keys. pushToAccount (src/services/push.ts) sends to both.
 *
 * Expo sees what we send in plain text, unlike Web Push, so every message is
 * the same generic line plus the path to open: no names, event titles or
 * message text (Privacy & Security, Nov 2026).
 *
 * Expo answers each message with a ticket. "DeviceNotRegistered" means the app
 * was removed or notifications were turned off on the phone, so the row goes.
 */
import type { PushResult } from "./webpush";

const SEND_URL = "https://exp.host/--/api/v2/push/send";

/** An Expo push token as the app gets it from getExpoPushTokenAsync. */
export function isExpoToken(s: string): boolean {
  return /^Expo(nent)?PushToken\[[\w-]{10,100}\]$/.test(s);
}

/** The only words an Expo push ever carries. */
export function expoLine(lang: "th" | "en"): { title: string; body: string } {
  return lang === "th" ? { title: "Jurrgun", body: "มีอะไรใหม่สำหรับคุณใน Jurrgun" } : { title: "Jurrgun", body: "You have something new in Jurrgun" };
}

/** Sends the generic line and `url` to each token, in one request (Expo takes up to 100). Results are in token order. */
export async function sendExpo(tokens: string[], url: string, lang: "th" | "en", ttlSeconds: number, accessToken?: string): Promise<PushResult[]> {
  if (!tokens.length) return [];
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    // `data.url` is what the app opens on a tap.
    body: JSON.stringify(tokens.map((to) => ({ to, ...expoLine(lang), data: { url }, ttl: ttlSeconds, sound: "default", priority: "high" }))),
  });
  if (!res.ok) return tokens.map(() => ({ ok: false, status: res.status, gone: false }));
  const out = (await res.json().catch(() => null)) as { data?: { status?: string; details?: { error?: string } }[] } | null;
  return tokens.map((_, i) => {
    const t = out?.data?.[i];
    return { ok: t?.status === "ok", status: res.status, gone: t?.details?.error === "DeviceNotRegistered" };
  });
}
