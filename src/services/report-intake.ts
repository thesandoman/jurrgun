/**
 * How a new report reaches staff, and how often a member may file one
 * (owner card A, 2026-10-26).
 *
 * - Limits: 1 report a day about the same person, 10 a day in all. A critical
 *   report ("I feel unsafe", or a money-flagged chat message) is never
 *   blocked.
 * - Alerts: a standard report only shows in the queue count on the staff
 *   dashboard. A critical one also gets an in-app alert and a push to each
 *   active moderator and admin, with no detail in the text.
 * - Reports about a moderator or an admin are for admins only; moderators
 *   don't see them in the queue or the counts.
 */
import { and, count, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { getDb } from "../db";
import type { Bindings } from "../lib/env";
import { newId } from "../lib/crypto";
import { accounts, notifications, reports } from "../schema";
import { pushToAccount } from "./push";

type Db = ReturnType<typeof getDb>;

export const REPORTS_PER_TARGET_PER_DAY = 1;
export const REPORTS_PER_DAY = 10;
const DAY = 86_400_000;

/** Roles whose reports only admins handle. */
export const STAFF_TARGET_ROLES = ["moderator", "bma_admin"] as const;

/** Why a report can't be filed right now, or null when it can. */
export type ReportLimit = "same_person" | "daily" | null;

export async function reportLimit(db: Db, reporter: string, target: string | null, critical: boolean, now = new Date()): Promise<ReportLimit> {
  if (critical) return null;
  const since = new Date(now.getTime() - DAY);
  const [row] = await db
    .select({
      all: count(),
      same: target ? sql<number>`sum(case when ${reports.targetAccount} = ${target} then 1 else 0 end)`.mapWith(Number) : sql<number>`0`.mapWith(Number),
    })
    .from(reports)
    .where(and(eq(reports.reporter, reporter), gte(reports.createdAt, since)));
  if (target && Number(row?.same ?? 0) >= REPORTS_PER_TARGET_PER_DAY) return "same_person";
  if (Number(row?.all ?? 0) >= REPORTS_PER_DAY) return "daily";
  return null;
}

/** The member-facing line for a limit. Never says anything about the other person. */
export function limitText(limit: Exclude<ReportLimit, null>): [string, string] {
  return limit === "same_person"
    ? [
        "วันนี้คุณรายงานคนนี้ไปแล้ว ทีมงานกำลังดูอยู่ ถ้ารู้สึกไม่ปลอดภัย ติ๊ก 'ไม่ปลอดภัย' แล้วส่งได้เสมอ คุณบล็อกเขาได้ทันที",
        "You've already reported this person today, and the team is looking at it. If you feel unsafe, tick 'unsafe' and send: that always goes through. You can block them right away.",
      ]
    : [
        `วันนี้คุณส่งรายงานครบ ${REPORTS_PER_DAY} ครั้งแล้ว ส่งใหม่ได้พรุ่งนี้ ถ้ารู้สึกไม่ปลอดภัย ติ๊ก 'ไม่ปลอดภัย' แล้วส่งได้เสมอ`,
        `You've sent ${REPORTS_PER_DAY} reports today. You can send more tomorrow. If you feel unsafe, tick 'unsafe' and send: that always goes through.`,
      ];
}

/**
 * Reports a moderator may see: no target account, or one that isn't staff.
 * Admins see every report.
 */
export function moderatorVisible(): SQL {
  return sql`(${reports.targetAccount} is null or ${reports.targetAccount} not in (select ${accounts.id} from ${accounts} where ${inArray(accounts.role, [...STAFF_TARGET_ROLES])}))`;
}

const URGENT: [string, string] = ["รายงานด่วน: มีคนรู้สึกไม่ปลอดภัย", "Urgent report: someone feels unsafe"];

/**
 * The writes (and, for a critical report, the pushes) that tell staff about a
 * new report. Standard reports write nothing: the queue count is the signal.
 * `aboutStaff` sends a critical alert to admins only.
 */
export async function staffAlert(env: Bindings, db: Db, opts: { critical: boolean; aboutStaff: boolean }) {
  if (!opts.critical) return { writes: [], push: async () => 0 };
  const staff = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.role, opts.aboutStaff ? ["bma_admin"] : [...STAFF_TARGET_ROLES]), eq(accounts.status, "active")))
    .limit(500);
  const writes = staff.length
    ? [db.insert(notifications).values(staff.map((s) => ({ id: newId(), accountId: s.id, kind: "report", titleTh: URGENT[0], titleEn: URGENT[1], link: "/admin/moderation" })))]
    : [];
  const push = async () => {
    let n = 0;
    for (const s of staff) n += await pushToAccount(env, db, s.id, { title: "Jurrgun", body: `${URGENT[0]} · ${URGENT[1]}`, url: "/admin/moderation", tag: "report:critical" }, 3600);
    return n;
  };
  return { writes, push };
}

/** Whether an account is staff whose reports only admins see. */
export async function isStaffTarget(db: Db, accountId: string | null): Promise<boolean> {
  if (!accountId) return false;
  const [a] = await db.select({ role: accounts.role }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return !!a && (STAFF_TARGET_ROLES as readonly string[]).includes(a.role);
}
