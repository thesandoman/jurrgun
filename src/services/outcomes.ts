/**
 * Outcome notices (owner card C, 2026-10-26).
 *
 * - Ban, lift and suspension notices name the rule. They never quote the
 *   report, and each is sent once with no reminders.
 * - A ban also shows on the blocked sign-in screen, with "ask us to look
 *   again". A banned member has no session, so that screen hands out a
 *   one-time request token (15 minutes, stored hashed like a session; a
 *   banned account can't sign in with it). The request lands in the
 *   moderation queue as a report the member filed about their own account.
 * - The reporter hears "We've closed your report: action taken / no rule
 *   broken", never anything about the other person.
 */
import { and, desc, eq, gt, like } from "drizzle-orm";
import type { getDb } from "../db";
import { label, REPORT_REASON_LABELS } from "../lib/constants";
import { newId, randomToken, sha256 } from "../lib/crypto";
import { fmtDay } from "../lib/i18n";
import { moderationActions, reports, sessions } from "../schema";

type Db = ReturnType<typeof getDb>;
export type Pair = [th: string, en: string];

/** The rule a moderator named, as `[rule] note` in the action's note; null when it came from 3 flags. */
export function ruleOf(note: string | null | undefined): string | null {
  const m = /^\[([a-z_]+)\]/.exec(note ?? "");
  return m && REPORT_REASON_LABELS.some((r) => r.value === m[1]) ? m[1] : null;
}

/** The rule's name in each language, or "3 warnings" when there's no single rule. */
export function ruleName(rule: string | null, flags = 3): Pair {
  if (!rule) return [`ได้รับคำเตือนครบ ${flags} ครั้ง`, `${flags} warnings`];
  return [label(REPORT_REASON_LABELS, rule, "th"), label(REPORT_REASON_LABELS, rule, "en")];
}

export function banCopy(rule: string | null): Pair {
  if (!rule) {
    return [
      "บัญชีของคุณถูกปิดถาวร เพราะได้รับคำเตือนครบ 3 ธง หากคิดว่าเราตัดสินผิด ขอให้ทบทวนได้ที่นี่",
      "Your account is closed for good because you reached 3 flags (upheld warnings). If you think we got this wrong, ask us to look again.",
    ];
  }
  const [th, en] = ruleName(rule);
  return [
    `บัญชีของคุณถูกปิดถาวร เพราะผิดหลักปฏิบัติข้อ "${th}" หากคิดว่าเราตัดสินผิด ขอให้ทบทวนได้ที่นี่`,
    `Your account is closed for good for breaking "${en}". If you think we got this wrong, ask us to look again.`,
  ];
}

export const LIFT_COPY: Pair = [
  "เรายกเลิกการระงับบัญชีของคุณแล้ว ที่นั่งที่ถูกยกเลิกไปจะไม่กลับมาเอง",
  "We've lifted the restriction on your account. Seats released during it don't come back on their own.",
];

export function suspendCopy(until: Date, rule: string | null): Pair {
  if (!rule) {
    return [
      `บัญชีของคุณถูกระงับถึง ${fmtDay(until, "th")} เพราะได้รับคำเตือนครบ 3 ธง`,
      `Your account is suspended until ${fmtDay(until, "en")} because you reached 3 flags (upheld warnings).`,
    ];
  }
  const [th, en] = ruleName(rule);
  return [
    `บัญชีของคุณถูกระงับถึง ${fmtDay(until, "th")} เพราะผิดหลักปฏิบัติข้อ "${th}"`,
    `Your account is suspended until ${fmtDay(until, "en")} for breaking "${en}".`,
  ];
}

export function reporterCopy(actioned: boolean): Pair {
  return actioned
    ? ["เราปิดรายงานของคุณแล้ว: ดำเนินการแล้ว คุณยังบล็อกได้เสมอ", "We've closed your report: action taken. You can still block them."]
    : ["เราปิดรายงานของคุณแล้ว: ไม่พบการละเมิด คุณยังบล็อกได้เสมอ", "We've closed your report: no rule broken. You can still block them."];
}

/** The rule named on the member's latest ban. */
export async function latestBanRule(db: Db, accountId: string): Promise<string | null> {
  const [a] = await db
    .select({ note: moderationActions.note })
    .from(moderationActions)
    .where(and(eq(moderationActions.accountId, accountId), eq(moderationActions.action, "ban")))
    .orderBy(desc(moderationActions.createdAt))
    .limit(1);
  return ruleOf(a?.note);
}

// --------------------------------------------------- ask us to look again --

export const LOOK_AGAIN_PREFIX = "Ban review requested by the member";
const LOOK_AGAIN_MINUTES = 15;
export const LOOK_AGAIN_MAX = 500;

/** A report the member filed about their own ban (reporter = target). */
export const isLookAgain = (r: { reporter: string; targetAccount: string | null; details: string }) =>
  r.reporter === r.targetAccount && r.details.startsWith(LOOK_AGAIN_PREFIX);

/** A one-time token for the blocked sign-in screen, after the member proved who they are. */
export async function lookAgainToken(db: Db, accountId: string): Promise<string> {
  const token = randomToken();
  await db.insert(sessions).values({ id: await sha256(`look-again:${token}`), accountId, expiresAt: new Date(Date.now() + LOOK_AGAIN_MINUTES * 60_000) });
  return token;
}

export type LookAgainResult = "sent" | "already" | "expired";

/** Files the request once per ban. The token is used up either way. */
export async function fileLookAgain(db: Db, token: string, words: string, isBanned: (accountId: string) => Promise<boolean>): Promise<LookAgainResult> {
  const id = await sha256(`look-again:${token}`);
  const [row] = await db.select({ accountId: sessions.accountId }).from(sessions).where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()))).limit(1);
  await db.delete(sessions).where(eq(sessions.id, id));
  if (!row || !(await isBanned(row.accountId))) return "expired";
  // Once per ban: any request since the latest ban counts, open or answered.
  const [ban] = await db
    .select({ at: moderationActions.createdAt })
    .from(moderationActions)
    .where(and(eq(moderationActions.accountId, row.accountId), eq(moderationActions.action, "ban")))
    .orderBy(desc(moderationActions.createdAt))
    .limit(1);
  const [earlier] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporter, row.accountId),
        eq(reports.targetAccount, row.accountId),
        like(reports.details, `${LOOK_AGAIN_PREFIX}%`),
        ban ? gt(reports.createdAt, ban.at) : undefined,
      ),
    )
    .limit(1);
  if (earlier) return "already";
  const text = words.trim().slice(0, LOOK_AGAIN_MAX);
  await db.insert(reports).values({
    id: newId(),
    reporter: row.accountId,
    targetAccount: row.accountId,
    reason: "other",
    details: text ? `${LOOK_AGAIN_PREFIX}: ${text}` : `${LOOK_AGAIN_PREFIX}.`,
    severity: "standard",
  });
  return "sent";
}
