/**
 * Sends a push message to every phone or browser a member turned
 * notifications on for: Web Push to browsers, Expo push to the phone app
 * (src/lib/expo-push.ts). Web Push is off until the VAPID keys are set in SV
 * Cloud settings; Expo needs no keys, and carries only a generic line and the
 * path, never `msg`'s words. Neither ever fails the caller, and the
 * in-app notification row is written either way by the caller.
 */
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { sha256 } from "../lib/crypto";
import { sendPush, type VapidKeys } from "../lib/webpush";
import { isExpoToken, sendExpo } from "../lib/expo-push";
import { createLogger } from "../logger";
import { profiles, pushSubscriptions, sessions } from "../schema";
import { pickLang } from "../lib/i18n";

type Db = ReturnType<typeof getDb>;

/** What the service worker shows: a title, one line, and where a tap goes. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

const SUBJECT = "https://jurrgun.apps.sv-academy.org";

export function vapidKeys(env: Bindings): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT ?? SUBJECT };
}

/** Sends `msg` to all of a member's devices (at most 10). Returns how many accepted it. */
export async function pushToAccount(env: Bindings, db: Db, accountId: string, msg: PushMessage, ttlSeconds: number): Promise<number> {
  if (env.NO_EXTERNAL) return 0;
  const keys = vapidKeys(env);
  // Columns named, not select(): a new column can't break sending before its migration lands.
  // An Expo row counts only while the session it was registered in is still signed in.
  const subs = await db
    .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.accountId, accountId),
        or(isNull(pushSubscriptions.sessionId), sql`exists (select 1 from ${sessions} where ${sessions.id} = ${pushSubscriptions.sessionId} and ${sessions.expiresAt} > now())`),
      ),
    )
    .limit(10);
  const expo = subs.filter((s) => isExpoToken(s.endpoint));
  const web = keys ? subs.filter((s) => !isExpoToken(s.endpoint)) : [];
  let sent = 0;
  const gone: string[] = [];
  const tally = (id: string, r: { ok: boolean; gone: boolean; status: number }, via: string) => {
    if (r.ok) sent++;
    else if (r.gone) gone.push(id);
    else createLogger(env).warn("push refused", { status: r.status, kind: msg.tag, via });
  };
  for (const s of web) {
    try {
      tally(s.id, await sendPush(s, msg, keys!, ttlSeconds), "web");
    } catch (err) {
      createLogger(env).warn("push failed", { kind: msg.tag, error: String(err) });
    }
  }
  if (expo.length) {
    try {
      const [p] = await db.select({ locale: profiles.locale }).from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
      const results = await sendExpo(expo.map((s) => s.endpoint), msg.url, pickLang(p?.locale ?? "th"), ttlSeconds, env.EXPO_ACCESS_TOKEN);
      results.forEach((r, i) => tally(expo[i].id, r, "expo"));
    } catch (err) {
      createLogger(env).warn("push failed", { kind: msg.tag, error: String(err), via: "expo" });
    }
  }
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return sent;
}

/**
 * In the Jurrgun phone app: whether this signed-in app session already has push on. Expo rows
 * belong to one session (by the hash of its cookie), so the switch shows the truth for this phone.
 */
export async function appPushOn(db: Db, sessionCookie: string | undefined, userAgent: string | undefined): Promise<boolean> {
  if (!sessionCookie || !/JurrgunApp/.test(userAgent ?? "")) return false;
  const sessionId = await sha256(sessionCookie);
  const [row] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(eq(pushSubscriptions.sessionId, sessionId), isNotNull(pushSubscriptions.sessionId))).limit(1);
  return !!row;
}
