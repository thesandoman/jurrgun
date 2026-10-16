/**
 * Sends a Web Push message to every phone or browser a member turned
 * notifications on for. Push is off (sends nothing, never fails) until the
 * VAPID keys are set in SV Cloud settings; the in-app notification row is
 * written either way by the caller.
 */
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { sendPush, type VapidKeys } from "../lib/webpush";
import { createLogger } from "../logger";
import { pushSubscriptions } from "../schema";

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
  const keys = vapidKeys(env);
  if (!keys || env.NO_EXTERNAL) return 0;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.accountId, accountId)).limit(10);
  let sent = 0;
  const gone: string[] = [];
  for (const s of subs) {
    try {
      const r = await sendPush(s, msg, keys, ttlSeconds);
      if (r.ok) sent++;
      else if (r.gone) gone.push(s.id);
      else createLogger(env).warn("push refused", { status: r.status, kind: msg.tag });
    } catch (err) {
      createLogger(env).warn("push failed", { kind: msg.tag, error: String(err) });
    }
  }
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return sent;
}
