/**
 * Card F4 (owner, 2026-11): someone who deletes their account ("Delete account", card S2; the account is
 * deactivated, then deleted) with a report open can't come back on the same login if that report ends in a ban.
 *
 * In that same step we take a keyed hash of their Google, LINE and email logins (holdWrites), because it
 * deletes the links. Never Apple's account ID (owner card S1). A hold refuses nothing until the report ends in a ban (markBanned). A dismissal,
 * a lesser outcome or a lifted ban releases it (releaseIfSettled, release). All holds go after REJOIN_HOLD_DAYS.
 * Accepted by the owner: a new password account gets around this.
 */
import { and, eq, gt, inArray, isNotNull, lt, ne } from "drizzle-orm";
import type { getDb } from "../db";
import { hmacSha256, newId } from "../lib/crypto";
import type { Bindings } from "../lib/env";
import { accounts, emailLinks, oauthLinks, rejoinHolds, reports } from "../schema";

type Db = ReturnType<typeof getDb>;

export const REJOIN_HOLD_DAYS = 730;
const OPEN = ["open", "in_review"];

const key = (env: Bindings, kind: string, value: string) => hmacSha256(`rejoin:${env.IP_HASH_SECRET || env.EMAIL_HASH_SALT || ""}`, `${kind}:${value}`);
export const oauthIdentity = (env: Bindings, provider: string, subject: string) => key(env, "oauth", `${provider}:${subject}`);
export const emailIdentity = (env: Bindings, emailHash: string) => key(env, "email", emailHash);

/** An open report about this member, from someone else (their own "look again" request doesn't count). */
async function hasOpenReport(db: Db, accountId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.targetAccount, accountId), inArray(reports.status, OPEN), ne(reports.reporter, accountId)))
    .limit(1);
  return !!r;
}

/** For the deactivation batch: holds for each login, or nothing when no report is open. Call before the links are deleted. */
export async function holdWrites(env: Bindings, db: Db, accountId: string, now = new Date()) {
  if (!(await hasOpenReport(db, accountId))) return [];
  const [oauth, email] = await Promise.all([
    // Never Apple: its account ID is used only to sign in (owner card S1).
    db.select({ provider: oauthLinks.provider, subject: oauthLinks.subject }).from(oauthLinks).where(and(eq(oauthLinks.accountId, accountId), ne(oauthLinks.provider, "apple"))).limit(10),
    db.select({ hash: emailLinks.emailHash }).from(emailLinks).where(eq(emailLinks.accountId, accountId)).limit(5),
  ]);
  const hashes = await Promise.all([...oauth.map((o) => oauthIdentity(env, o.provider, o.subject)), ...email.map((e) => emailIdentity(env, e.hash))]);
  if (!hashes.length) return [];
  const expiresAt = new Date(now.getTime() + REJOIN_HOLD_DAYS * 86_400_000);
  return [db.insert(rejoinHolds).values(hashes.map((identityHash) => ({ id: newId(), identityHash, accountId, expiresAt })))];
}

/** The report ended in a ban: from now on these logins are refused at sign-up. */
export const markBanned = (db: Db, accountId: string, now = new Date()) => db.update(rejoinHolds).set({ bannedAt: now }).where(eq(rejoinHolds.accountId, accountId));

/** A lifted ban: the logins are free again. */
export const release = (db: Db, accountId: string) => db.delete(rejoinHolds).where(eq(rejoinHolds.accountId, accountId));

/** After a report closes without a ban: release, unless another report is still open or they're banned. */
export async function releaseIfSettled(db: Db, accountId: string): Promise<void> {
  if (await hasOpenReport(db, accountId)) return;
  const [a] = await db.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (a?.status !== "banned") await release(db, accountId);
}

/** Whether this login is refused at sign-up. */
export async function rejoinRefused(db: Db, identityHash: string, now = new Date()): Promise<boolean> {
  const [h] = await db
    .select({ id: rejoinHolds.id })
    .from(rejoinHolds)
    .where(and(eq(rejoinHolds.identityHash, identityHash), isNotNull(rejoinHolds.bannedAt), gt(rejoinHolds.expiresAt, now)))
    .limit(1);
  return !!h;
}

/** For retention. */
export const deleteExpiredHolds = (db: Db, now = new Date()) => db.delete(rejoinHolds).where(lt(rejoinHolds.expiresAt, now));

/** The owner's copy for a refused login. */
export const REJOIN_REFUSED: [string, string] = ["สมัครด้วยบัญชีนี้ไม่ได้ ถ้าคิดว่าเราพลาด ติดต่อเราได้", "This login can't be used to join. If that seems wrong, contact us."];
