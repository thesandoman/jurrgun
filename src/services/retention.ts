/**
 * Data retention (PRD §12.4). There is no cron on this platform, so this runs
 * when a bma_admin presses "Run retention cleanup" on /admin, and lazily at
 * most once per 24 hours when a bma_admin opens /admin.
 *
 * It only removes what the retention table says to remove:
 *
 *   social signals            7 days after the event ends
 *   pending connection choices when the People I Met window closes (72h);
 *                             mutual connections live in social_connections
 *                             and are untouched
 *   expired sessions          once past expires_at
 *   login attempts            after 24 hours (throttling looks back 1 hour at most)
 *   check-in and group detail 12 months after the event: group numbers, who
 *                             checked them in and how, +1 links and buddy
 *                             pairs are cleared; the registration row and its
 *                             status stay, so attendance totals still add up
 *   City Pulse and wellbeing  24 months after the answer (research code rows)
 *   deactivated accounts      30 days after deactivation, unless a moderation
 *                             hold applies (an open or in-review report about
 *                             them): profile, vibe, sessions, notifications,
 *                             contact shares and consents are hard-deleted, the
 *                             account row is anonymised and its research_id link
 *                             cut, and their feedback comments are blanked
 *                             (the ratings stay, unlinked). Reports, moderation actions and audit rows
 *                             are kept (legal hold); registrations carry no
 *                             personal content and stay for aggregate counts.
 *
 * Every run writes one "retention.run" audit row with the counts.
 */
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, notExists, or, sql } from "drizzle-orm";
import { batch, getDb, type DatabaseEnv } from "../db";
import { PEOPLE_WINDOW_HOURS } from "../domain/rules";
import { audit } from "../lib/records";
import {
  accounts,
  auditLog,
  buddyPairs,
  connectionChoices,
  connections,
  consents,
  contactShares,
  events,
  feedback,
  loginAttempts,
  notifications,
  oauthLinks,
  profiles,
  pulseResponses,
  registrations,
  reports,
  sessions,
  vibes,
  wellbeing,
} from "../schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const SIGNAL_RETENTION_DAYS = 7;
export const DEACTIVATED_RETENTION_DAYS = 30;
export const LOGIN_ATTEMPT_RETENTION_HOURS = 24;
export const CHECKIN_RETENTION_DAYS = 365;
export const RESEARCH_RETENTION_DAYS = 730;
/** Accounts anonymised per run; the rest wait for the next run. */
export const ACCOUNT_BATCH = 200;
/** How often the lazy run on /admin may fire. */
export const RETENTION_INTERVAL_MS = DAY;
export const RETENTION_ACTION = "retention.run";

export type RetentionCounts = {
  signalsCleared: number;
  choicesDeleted: number;
  sessionsDeleted: number;
  loginAttemptsDeleted: number;
  checkInsAggregated: number;
  researchAnswersDeleted: number;
  accountsDeleted: number;
  /** True when more deactivated accounts were due than one run handles. */
  accountsRemaining: boolean;
};

export async function runRetention(env: DatabaseEnv, now: Date = new Date(), actor = "system"): Promise<RetentionCounts> {
  const db = getDb(env);
  const signalCutoff = new Date(now.getTime() - SIGNAL_RETENTION_DAYS * DAY);
  const windowCutoff = new Date(now.getTime() - PEOPLE_WINDOW_HOURS * HOUR);
  const attemptCutoff = new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_HOURS * HOUR);
  const deactivatedCutoff = new Date(now.getTime() - DEACTIVATED_RETENTION_DAYS * DAY);
  const checkinCutoff = new Date(now.getTime() - CHECKIN_RETENTION_DAYS * DAY);
  const researchCutoff = new Date(now.getTime() - RESEARCH_RETENTION_DAYS * DAY);

  const endedBefore = (cutoff: Date) => db.select({ id: events.id }).from(events).where(lte(events.endsAt, cutoff));

  // 1. Time-based cleanups, as one batch. `returning` gives the counts.
  const [signals, choices, sess, attempts, checkIns, , pulseOld, wellOld] = await batch(env, [
    db
      .update(registrations)
      .set({ socialSignal: null, signalTopics: null })
      .where(
        and(
          inArray(registrations.eventId, endedBefore(signalCutoff)),
          or(isNotNull(registrations.socialSignal), isNotNull(registrations.signalTopics)),
        ),
      )
      .returning({ id: registrations.id }),
    db
      .delete(connectionChoices)
      .where(inArray(connectionChoices.eventId, endedBefore(windowCutoff)))
      .returning({ id: connectionChoices.id }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    db.delete(loginAttempts).where(lt(loginAttempts.createdAt, attemptCutoff)).returning({ id: loginAttempts.id }),
    db
      .update(registrations)
      .set({ groupNo: null, checkedInBy: null, checkInMethod: null, plusOneWith: null, plusOneUsername: null })
      .where(
        and(
          inArray(registrations.eventId, endedBefore(checkinCutoff)),
          or(isNotNull(registrations.groupNo), isNotNull(registrations.checkedInBy), isNotNull(registrations.plusOneWith), isNotNull(registrations.plusOneUsername)),
        ),
      )
      .returning({ id: registrations.id }),
    db.delete(buddyPairs).where(inArray(buddyPairs.eventId, endedBefore(checkinCutoff))),
    db.delete(pulseResponses).where(lt(pulseResponses.createdAt, researchCutoff)).returning({ id: pulseResponses.id }),
    db.delete(wellbeing).where(lt(wellbeing.createdAt, researchCutoff)).returning({ id: wellbeing.id }),
  ]);

  // 2. Deactivated accounts past 30 days, without a moderation hold. Bounded.
  const due = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.status, "deactivated"),
        isNotNull(accounts.deactivatedAt),
        lt(accounts.deactivatedAt, deactivatedCutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reports)
            .where(and(eq(reports.targetAccount, accounts.id), inArray(reports.status, ["open", "in_review"]))),
        ),
      ),
    )
    .orderBy(accounts.deactivatedAt)
    .limit(ACCOUNT_BATCH + 1);
  const ids = due.slice(0, ACCOUNT_BATCH).map((r) => r.id);

  const counts: RetentionCounts = {
    signalsCleared: signals.length,
    choicesDeleted: choices.length,
    sessionsDeleted: sess.length,
    loginAttemptsDeleted: attempts.length,
    checkInsAggregated: checkIns.length,
    researchAnswersDeleted: pulseOld.length + wellOld.length,
    accountsDeleted: ids.length,
    accountsRemaining: due.length > ACCOUNT_BATCH,
  };

  const writes = [];
  if (ids.length) {
    writes.push(
      db.delete(profiles).where(inArray(profiles.accountId, ids)),
      db.delete(vibes).where(inArray(vibes.accountId, ids)),
      db.delete(sessions).where(inArray(sessions.accountId, ids)),
      db.delete(notifications).where(inArray(notifications.accountId, ids)),
      db.delete(contactShares).where(inArray(contactShares.accountId, ids)),
      db.delete(consents).where(inArray(consents.accountId, ids)),
      db.update(feedback).set({ comment: "" }).where(inArray(feedback.accountId, ids)),
      // Frees their Google / LINE identity, so they can sign up again later.
      db.delete(oauthLinks).where(inArray(oauthLinks.accountId, ids)),
      // Their mutual connections end, so the other person no longer sees them.
      db
        .update(connections)
        .set({ removedAt: now })
        .where(and(isNull(connections.removedAt), or(inArray(connections.aAccount, ids), inArray(connections.bAccount, ids)))),
      db
        .update(accounts)
        .set({
          username: sql`'deleted_' || left(${accounts.id}, 8)`,
          passwordHash: "",
          passwordSalt: "",
          status: "deleted",
          researchId: null,
        })
        .where(and(inArray(accounts.id, ids), eq(accounts.status, "deactivated"))),
    );
  }
  writes.push(audit(db, actor, RETENTION_ACTION, undefined, { ...counts }));
  await batch(env, writes);
  return counts;
}

export type RetentionRun = { at: Date; counts: Partial<RetentionCounts>; actor: string };

/** The most recent run, read from the audit log. */
export async function lastRetentionRun(env: DatabaseEnv): Promise<RetentionRun | null> {
  const [row] = await getDb(env)
    .select({ at: auditLog.createdAt, detail: auditLog.detail, actor: auditLog.actor })
    .from(auditLog)
    .where(eq(auditLog.action, RETENTION_ACTION))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  return row ? { at: row.at, counts: row.detail as Partial<RetentionCounts>, actor: row.actor } : null;
}

/** Lazy timer: run if the last run is older than 24 hours (or there was none). */
export async function retentionIfDue(env: DatabaseEnv, actor: string, now: Date = new Date()): Promise<RetentionRun | null> {
  const last = await lastRetentionRun(env);
  if (last && now.getTime() - last.at.getTime() < RETENTION_INTERVAL_MS) return last;
  const counts = await runRetention(env, now, actor);
  return { at: now, counts, actor };
}
