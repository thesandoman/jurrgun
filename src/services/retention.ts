/**
 * Data retention (PRD §12.4, privacy risk assessment R5 and R6). There is no
 * cron on this platform: the hourly clock (services/clock.ts) runs it at most
 * once per 24 hours, a bma_admin can run it from /admin, and opening /admin
 * runs it lazily too.
 *
 * It only removes what the retention table says to remove:
 *
 *   social signals, hello lines  7 days after the event ends
 *   pending connection choices when the People I Met window closes (72h);
 *                             mutual connections live in social_connections
 *                             and are untouched
 *   expired sessions          once past expires_at
 *   login attempts            after 24 hours (throttling looks back 1 hour at most)
 *   email sign-in codes       after 24 hours (each one expires after 10 minutes)
 *   check-in and group detail 12 months after the event: group numbers, who
 *                             checked them in and how, +1 links and buddy
 *                             pairs are cleared; the registration row and its
 *                             status stay, so attendance totals still add up
 *   chat messages, "home safe?" 180 days
 *   host announcements        180 days after the event ends
 *   read notifications        90 days after they were read (R6)
 *   unread notifications      1 year after they were sent
 *   exit reason notes         blanked after 1 year; the picked reasons stay
 *   contact shares            on a removed connection or a blocked pair (the
 *                             remove and block routes delete them at once)
 *   reports, moderation       2 years after the report or action, once the
 *   actions, strikes          report is closed (actioned or dismissed) (R6)
 *   audit log                 1 year (R6)
 *   City Pulse and wellbeing  24 months after the answer (research code rows)
 *   research ids              cut, with every answer under them, from any
 *                             account whose newest research answer isn't yes
 *                             (a research_id exists only with research consent)
 *   deactivated accounts      30 days after deactivation, unless a moderation
 *                             hold applies (an open or in-review report about
 *                             them). Every table holding their account id (R5):
 *     deleted: City Pulse and wellbeing answers (normally already gone at
 *       deactivation, with the research id), profile, Bangkok Type, sessions, notifications, push devices,
 *       consents, sign-in emails and their codes, Google / LINE links, social
 *       links, contact shares (theirs, and the other person's on a connection
 *       with them), chat messages (and photos), chat reads and poll votes,
 *       "home safe?" answers, dating intents, buddy opt-in and deck picks
 *       (theirs and about them), passport stamps, strikes, blocks (either way),
 *       connection choices (either way), invites they made, event buddy pairs
 *       with them, meet feedback they gave, weekly plans, plan pitches and
 *       joins (theirs, and others' joins on their pitches), thank-you notes
 *       (either way), Table Host requests, hangout shares (either way),
 *       regular table seats, regular table conflicts.
 *     anonymised, kept for totals or for the other person: the account row
 *       (username, password and research id cleared), feedback (comment
 *       blanked, ratings stay), registrations (signals, ETA, +1 links and the
 *       buddy wish cleared; status and check-in stay), connections (ended),
 *       buddy matches (ended, quests stay for the other buddy's passport),
 *       meet feedback about them (the link to them cut), invites they used
 *       (the link cut), regular tables they hosted (archived, description
 *       blanked), events they hosted (kept as listings), announcements
 *       they wrote (kept for the people going, the author link cut).
 *     kept until their own period: reports, moderation actions and audit rows.
 *
 * Every run writes one "retention.run" audit row with the counts.
 */
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, ne, notExists, or, sql } from "drizzle-orm";
import { batch, getDb, type DatabaseEnv } from "../db";
import { PEOPLE_WINDOW_HOURS } from "../domain/rules";
import { CODE_RETENTION_HOURS } from "./email-code";
import { audit } from "../lib/records";
import { deleteObject, type StorageEnv } from "../storage";
import {
  accounts,
  announcements,
  calendarTokens,
  eventFeeds,
  eventInbox,
  partnerApplications,
  partnerKeys,
  auditLog,
  blocks,
  buddyMatches,
  buddyPairs,
  chatVotes,
  circleHeadRequests,
  circleShares,
  invites,
  meetFeedback,
  moderationActions,
  pitchJoins,
  planPitches,
  regularTableConflicts,
  regularTableMembers,
  regularTables,
  strikes,
  thanks,
  weeklyPlans,
  connectionChoices,
  connections,
  consents,
  contactShares,
  events,
  exitReasons,
  feedback,
  loginAttempts,
  loginCodes,
  emailLinks,
  notifications,
  profileLinks,
  pushSubscriptions,
  oauthLinks,
  profiles,
  pulseResponses,
  registrations,
  reports,
  sessions,
  vibes,
  wellbeing,
  buddyOptins,
  buddySwipes,
  chatMessages,
  chatReads,
  datingIntents,
  passportStamps,
  safeArrivals,
} from "../schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const SIGNAL_RETENTION_DAYS = 7;
export const DEACTIVATED_RETENTION_DAYS = 30;
export const LOGIN_ATTEMPT_RETENTION_HOURS = 24;
export const CHECKIN_RETENTION_DAYS = 365;
export const RESEARCH_RETENTION_DAYS = 730;
/** Chat messages are kept this long, then deleted (reported ones stay in the report's details). */
export const CHAT_RETENTION_DAYS = 180;
/** Host announcements are deleted this long after their event ends (owner, 17 Oct 2026). */
export const ANNOUNCEMENT_RETENTION_DAYS = 180;
/** Read notifications are deleted this long after they were read (R6). */
export const READ_NOTIFICATION_RETENTION_DAYS = 90;
/** Unread notifications are deleted this long after they were sent (owner, 16 Oct 2026). */
export const UNREAD_NOTIFICATION_RETENTION_DAYS = 365;
/** The free-text note on an exit reason is blanked after this; the picked reasons stay for totals (owner, 16 Oct 2026). */
export const EXIT_NOTE_RETENTION_DAYS = 365;
/** Closed reports, moderation actions and strikes are deleted after this (R6). */
export const SAFETY_RETENTION_DAYS = 730;
/** Strikes follow the same 2 years as the reports they came from. */
export const STRIKE_RETENTION_DAYS = SAFETY_RETENTION_DAYS;
/** Audit rows are deleted after this (R6). */
export const AUDIT_RETENTION_DAYS = 365;
/** Research ids cut per run (accounts without research consent); the rest wait for the next run. */
export const RESEARCH_BATCH = 500;
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
  loginCodesDeleted: number;
  checkInsAggregated: number;
  researchAnswersDeleted: number;
  accountsDeleted: number;
  /** Research ids cut (and their answers deleted) because research consent isn't on. */
  researchLinksCut: number;
  /** R6: read notifications, closed reports, moderation actions, strikes and audit rows past their period. */
  readNotificationsDeleted: number;
  /** Unread notifications past UNREAD_NOTIFICATION_RETENTION_DAYS. */
  unreadNotificationsDeleted: number;
  /** Exit reason notes blanked after EXIT_NOTE_RETENTION_DAYS. */
  exitNotesCleared: number;
  /** Contact shares on a removed connection or between a blocked pair. */
  contactSharesDeleted: number;
  /** Host announcements past ANNOUNCEMENT_RETENTION_DAYS after their event. */
  announcementsDeleted: number;
  reportsDeleted: number;
  moderationActionsDeleted: number;
  strikesDeleted: number;
  auditRowsDeleted: number;
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
  // Chat photos go with their messages: collect the files before the rows are deleted (bounded).
  const oldPhotos = await db
    .select({ key: chatMessages.photoKey })
    .from(chatMessages)
    .where(and(lt(chatMessages.createdAt, new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY)), isNotNull(chatMessages.photoKey)))
    .limit(500);
  await dropFiles(env, oldPhotos.map((p) => p.key!));

  const safetyCutoff = new Date(now.getTime() - SAFETY_RETENTION_DAYS * DAY);
  const [signals, choices, sess, attempts, checkIns, , pulseOld, wellOld, , , codesOld, readOld, unreadOld, reportsOld, actionsOld, strikesOld, auditOld, exitNotes, sharesGone, annsOld] = await batch(env, [
    db
      .update(registrations)
      .set({ socialSignal: null, signalTopics: null, helloLine: null })
      .where(
        and(
          inArray(registrations.eventId, endedBefore(signalCutoff)),
          or(isNotNull(registrations.socialSignal), isNotNull(registrations.signalTopics), isNotNull(registrations.helloLine)),
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
    db.delete(chatMessages).where(lt(chatMessages.createdAt, new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY))),
    db.delete(safeArrivals).where(lt(safeArrivals.createdAt, new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY))),
    db.delete(loginCodes).where(lt(loginCodes.createdAt, new Date(now.getTime() - CODE_RETENTION_HOURS * HOUR))).returning({ id: loginCodes.id }),
    // R6 retention periods.
    db
      .delete(notifications)
      .where(and(isNotNull(notifications.readAt), lt(notifications.readAt, new Date(now.getTime() - READ_NOTIFICATION_RETENTION_DAYS * DAY))))
      .returning({ id: notifications.id }),
    db
      .delete(notifications)
      .where(and(isNull(notifications.readAt), lt(notifications.createdAt, new Date(now.getTime() - UNREAD_NOTIFICATION_RETENTION_DAYS * DAY))))
      .returning({ id: notifications.id }),
    db
      .delete(reports)
      .where(and(inArray(reports.status, ["actioned", "dismissed"]), lt(reports.createdAt, safetyCutoff)))
      .returning({ id: reports.id }),
    db.delete(moderationActions).where(lt(moderationActions.createdAt, safetyCutoff)).returning({ id: moderationActions.id }),
    db.delete(strikes).where(lt(strikes.createdAt, new Date(now.getTime() - STRIKE_RETENTION_DAYS * DAY))).returning({ id: strikes.id }),
    // The run's own audit row is written after this, so the last run stays readable.
    db.delete(auditLog).where(lt(auditLog.createdAt, new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY))).returning({ id: auditLog.id }),
    // Exit reasons: the picked reasons stay for totals, the free-text note goes.
    db
      .update(exitReasons)
      .set({ note: "" })
      .where(and(ne(exitReasons.note, ""), lt(exitReasons.createdAt, new Date(now.getTime() - EXIT_NOTE_RETENTION_DAYS * DAY))))
      .returning({ id: exitReasons.id }),
    // Contact shares last only while the connection does: removing it or a block deletes them at
    // once (routes/people.tsx); this catches any left on a removed connection or a blocked pair.
    db
      .delete(contactShares)
      .where(inArray(contactShares.connectionId, endedConnections(db)))
      .returning({ id: contactShares.id }),
    db
      .delete(announcements)
      .where(inArray(announcements.eventId, endedBefore(new Date(now.getTime() - ANNOUNCEMENT_RETENTION_DAYS * DAY))))
      .returning({ id: announcements.id }),
  ]);

  // 1b. A research_id only with research consent (privacy R7): an account holding one whose newest
  // research answer isn't yes (older accounts got one at sign-up) loses it and its answers. Bounded.
  const unconsented = await db
    .select({ id: accounts.id, rid: accounts.researchId })
    .from(accounts)
    .where(
      and(
        isNotNull(accounts.researchId),
        sql`not exists (select 1 from ${consents} c where c.account_id = ${accounts.id} and c.category = 'research' and c.granted
          and not exists (select 1 from ${consents} d where d.account_id = c.account_id and d.category = 'research' and d.created_at > c.created_at))`,
      ),
    )
    .limit(RESEARCH_BATCH);
  const cutRids = unconsented.map((r) => r.rid!);

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
  if (ids.length) {
    const theirPhotos = await db.select({ key: chatMessages.photoKey }).from(chatMessages).where(and(inArray(chatMessages.sender, ids), isNotNull(chatMessages.photoKey))).limit(2000);
    await dropFiles(env, theirPhotos.map((p) => p.key!));
  }

  const counts: RetentionCounts = {
    signalsCleared: signals.length,
    choicesDeleted: choices.length,
    sessionsDeleted: sess.length,
    loginAttemptsDeleted: attempts.length,
    loginCodesDeleted: codesOld.length,
    checkInsAggregated: checkIns.length,
    researchAnswersDeleted: pulseOld.length + wellOld.length,
    researchLinksCut: unconsented.length,
    readNotificationsDeleted: readOld.length,
    unreadNotificationsDeleted: unreadOld.length,
    exitNotesCleared: exitNotes.length,
    contactSharesDeleted: sharesGone.length,
    announcementsDeleted: annsOld.length,
    reportsDeleted: reportsOld.length,
    moderationActionsDeleted: actionsOld.length,
    strikesDeleted: strikesOld.length,
    auditRowsDeleted: auditOld.length,
    accountsDeleted: ids.length,
    accountsRemaining: due.length > ACCOUNT_BATCH,
  };

  const writes = [];
  if (unconsented.length) {
    writes.push(
      db.delete(pulseResponses).where(inArray(pulseResponses.researchId, cutRids)),
      db.delete(wellbeing).where(inArray(wellbeing.researchId, cutRids)),
      db.update(accounts).set({ researchId: null }).where(inArray(accounts.id, unconsented.map((r) => r.id))),
    );
  }
  if (ids.length) {
    // Their City Pulse and wellbeing answers, as on research withdrawal. Deactivation already
    // deletes them and cuts the research_id (routes/settings.tsx); this covers any account
    // that reached deletion still holding one. It must run before the research_id is cleared below.
    const theirRids = db.select({ rid: accounts.researchId }).from(accounts).where(and(inArray(accounts.id, ids), isNotNull(accounts.researchId)));
    writes.push(
      db.delete(pulseResponses).where(inArray(pulseResponses.researchId, theirRids)),
      db.delete(wellbeing).where(inArray(wellbeing.researchId, theirRids)),
      db.delete(profiles).where(inArray(profiles.accountId, ids)),
      db.delete(vibes).where(inArray(vibes.accountId, ids)),
      db.delete(sessions).where(inArray(sessions.accountId, ids)),
      db.delete(notifications).where(inArray(notifications.accountId, ids)),
      db.delete(pushSubscriptions).where(inArray(pushSubscriptions.accountId, ids)),
      // Contact shares: theirs, and the other person's on a connection with them.
      db
        .delete(contactShares)
        .where(
          or(
            inArray(contactShares.accountId, ids),
            inArray(contactShares.connectionId, db.select({ id: connections.id }).from(connections).where(or(inArray(connections.aAccount, ids), inArray(connections.bAccount, ids)))),
          ),
        ),
      db.delete(profileLinks).where(inArray(profileLinks.accountId, ids)),
      db.delete(chatMessages).where(inArray(chatMessages.sender, ids)),
      db.delete(chatReads).where(inArray(chatReads.accountId, ids)),
      db.delete(chatVotes).where(inArray(chatVotes.accountId, ids)),
      db.delete(safeArrivals).where(inArray(safeArrivals.accountId, ids)),
      db.delete(buddySwipes).where(or(inArray(buddySwipes.accountId, ids), inArray(buddySwipes.targetId, ids))),
      db.delete(datingIntents).where(inArray(datingIntents.accountId, ids)),
      db.delete(buddyOptins).where(inArray(buddyOptins.accountId, ids)),
      db.delete(passportStamps).where(inArray(passportStamps.accountId, ids)),
      db.delete(consents).where(inArray(consents.accountId, ids)),
      db.update(feedback).set({ comment: "" }).where(inArray(feedback.accountId, ids)),
      // R5: every other table that holds their account id.
      db.delete(strikes).where(inArray(strikes.accountId, ids)),
      db.delete(blocks).where(or(inArray(blocks.blocker, ids), inArray(blocks.blocked, ids))),
      db.delete(connectionChoices).where(or(inArray(connectionChoices.fromAccount, ids), inArray(connectionChoices.toAccount, ids))),
      db.delete(invites).where(inArray(invites.inviter, ids)),
      db.update(invites).set({ usedBy: null }).where(inArray(invites.usedBy, ids)),
      // Event buddy pairs with them. The id is matched in the column's text, which works however the
      // jsonb array was encoded (the local driver stores it as a JSON string); ids are UUIDs.
      db.delete(buddyPairs).where(or(...ids.map((x) => sql`strpos(${buddyPairs.members}::text, ${x}) > 0`))),
      db
        .update(buddyMatches)
        .set({ state: "ended", endReason: "account_deleted", endedAt: now })
        .where(and(ne(buddyMatches.state, "ended"), or(inArray(buddyMatches.aAccount, ids), inArray(buddyMatches.bAccount, ids)))),
      db.delete(meetFeedback).where(inArray(meetFeedback.accountId, ids)),
      db.update(meetFeedback).set({ aboutAccount: null }).where(inArray(meetFeedback.aboutAccount, ids)),
      db.delete(weeklyPlans).where(inArray(weeklyPlans.accountId, ids)),
      db.delete(pitchJoins).where(or(inArray(pitchJoins.accountId, ids), inArray(pitchJoins.pitchId, db.select({ id: planPitches.id }).from(planPitches).where(inArray(planPitches.accountId, ids))))),
      db.delete(planPitches).where(inArray(planPitches.accountId, ids)),
      db.delete(thanks).where(or(inArray(thanks.fromAccount, ids), inArray(thanks.toAccount, ids))),
      db.delete(circleHeadRequests).where(inArray(circleHeadRequests.accountId, ids)),
      db.delete(circleShares).where(or(inArray(circleShares.fromAccount, ids), inArray(circleShares.toAccount, ids))),
      db.delete(regularTableMembers).where(inArray(regularTableMembers.accountId, ids)),
      db.delete(regularTableConflicts).where(or(inArray(regularTableConflicts.aAccount, ids), inArray(regularTableConflicts.bAccount, ids))),
      db.update(regularTables).set({ archivedAt: now }).where(and(inArray(regularTables.hostAccountId, ids), isNull(regularTables.archivedAt))),
      db.update(regularTables).set({ description: "" }).where(inArray(regularTables.hostAccountId, ids)),
      // Announcements they wrote stay for the people going, without the link to them.
      db.update(announcements).set({ authorAccountId: null }).where(inArray(announcements.authorAccountId, ids)),
      // Registrations stay for attendance totals, without anything personal.
      db
        .update(registrations)
        .set({ socialSignal: null, signalTopics: null, etaStatus: null, etaAt: null, plusOneWith: null, plusOneUsername: null, wantsBuddy: false })
        .where(inArray(registrations.accountId, ids)),
      db.update(registrations).set({ plusOneWith: null, plusOneUsername: null }).where(inArray(registrations.plusOneWith, ids)),
      // Frees their Google / LINE identity, so they can sign up again later.
      db.delete(oauthLinks).where(inArray(oauthLinks.accountId, ids)),
      // Their sign-in email (a hash only) and any codes still waiting for it.
      db.delete(loginCodes).where(inArray(loginCodes.emailHash, db.select({ h: emailLinks.emailHash }).from(emailLinks).where(inArray(emailLinks.accountId, ids)))),
      db.delete(emailLinks).where(inArray(emailLinks.accountId, ids)),
      // Their private calendar link stops working, and partner applications go.
      db.delete(calendarTokens).where(inArray(calendarTokens.accountId, ids)),
      db.delete(partnerApplications).where(inArray(partnerApplications.accountId, ids)),
      db.update(partnerApplications).set({ reviewedBy: null }).where(inArray(partnerApplications.reviewedBy, ids)),
      // Links they pasted, feeds and keys they added stay for the partner, without the link to them.
      db.update(eventInbox).set({ addedBy: null }).where(inArray(eventInbox.addedBy, ids)),
      db.update(eventFeeds).set({ addedBy: null }).where(inArray(eventFeeds.addedBy, ids)),
      db.update(partnerKeys).set({ createdBy: null }).where(inArray(partnerKeys.createdBy, ids)),
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

/** Delete stored files when this environment has file storage; never fails retention. */
async function dropFiles(env: DatabaseEnv, keys: string[]) {
  const st = env as unknown as StorageEnv;
  if (!keys.length || (!st.FILES && !st.BUCKET)) return;
  await deleteObject(st, keys).catch(() => {});
}

/** Connections that are removed, or whose pair has a block either way: their contact shares go. */
export function endedConnections(db: ReturnType<typeof getDb>) {
  return db
    .select({ id: connections.id })
    .from(connections)
    .where(
      or(
        isNotNull(connections.removedAt),
        sql`exists (select 1 from ${blocks} b where (b.blocker = ${connections.aAccount} and b.blocked = ${connections.bAccount}) or (b.blocker = ${connections.bAccount} and b.blocked = ${connections.aAccount}))`,
      ),
    );
}
