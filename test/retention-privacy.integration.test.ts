/**
 * Privacy risk assessment R5 and R6 (design/reference/privacy-risk-assessment.md):
 * deleting an account reaches every table that holds its id (deleted, or
 * anonymised where totals or the other person need the row), and reports,
 * moderation actions, strikes, the audit log and read notifications have
 * retention periods.
 */
import { describe, expect, it } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import { createMember, db, ENV, HAS_DB, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import {
  accounts,
  auditLog,
  blocks,
  buddyMatches,
  buddyPairs,
  buddyQuests,
  chatVotes,
  circleHeadRequests,
  circleShares,
  connectionChoices,
  connections,
  contactShares,
  events,
  feedback,
  invites,
  meetFeedback,
  moderationActions,
  notifications,
  pitchJoins,
  planPitches,
  regularTableConflicts,
  regularTableMembers,
  regularTables,
  registrations,
  reports,
  strikes,
  thanks,
  weeklyPlans,
} from "../src/schema";
import { runRetention } from "../src/services/retention";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function pastEvent() {
  const id = newId();
  await db().insert(events).values({ id, title: `RET-${id.slice(0, 6)}`, startsAt: ago(3), endsAt: ago(3), venueName: "Lumphini Park", district: "pathum_wan", capacity: 20, status: "published", createdBy: "test" });
  return id;
}
const deactivate = (m: Member, days: number) => db().update(accounts).set({ status: "deactivated", deactivatedAt: ago(days) }).where(eq(accounts.id, m.id));

describe.skipIf(!HAS_DB)("R5: account deletion reaches every table with the account id", () => {
  it("deletes their rows, and anonymises the ones others or totals need", async () => {
    const [gone, other] = await Promise.all([createMember(), createMember()]);
    const g = gone.id;
    const o = other.id;
    const ev = await pastEvent();
    const [a, b] = [g, o].sort();
    const conn = newId();
    const pitch = newId();
    const match = newId();
    const quest = newId();
    const table = newId();
    const regGone = newId();
    const regOther = newId();
    await db().insert(connections).values({ id: conn, aAccount: a, bAccount: b, level: "friend", eventId: ev });
    await db().insert(contactShares).values({ id: newId(), connectionId: conn, accountId: o, method: "line", value: "other_line" });
    await db().insert(blocks).values([{ id: newId(), blocker: g, blocked: newId() }, { id: newId(), blocker: newId(), blocked: g }]);
    await db().insert(connectionChoices).values([{ id: newId(), eventId: newId(), fromAccount: g, toAccount: o, choice: "friend" }, { id: newId(), eventId: newId(), fromAccount: o, toAccount: g, choice: "friend" }]);
    await db().insert(strikes).values({ id: newId(), accountId: g, eventId: ev, reason: "no_show", expiresAt: new Date(Date.now() + 30 * DAY) });
    await db().insert(invites).values([{ id: newId(), eventId: ev, inviter: g }, { id: newId(), eventId: ev, inviter: o, usedBy: g, usedAt: new Date() }]);
    await db().insert(buddyPairs).values({ id: newId(), eventId: ev, members: [g, o], method: "stable" });
    await db().insert(buddyMatches).values({ id: match, aAccount: a, bAccount: b, week: "2026-W40", state: "active" });
    await db().insert(buddyQuests).values({ id: quest, matchId: match, week: "2026-W40", scenario: "s", typeCode: "BDMN", district: "bang_rak" });
    await db().insert(meetFeedback).values([
      { id: newId(), kind: "quest", ref: quest, accountId: g, aboutAccount: o, comment: "about other" },
      { id: newId(), kind: "quest", ref: quest, accountId: o, aboutAccount: g, comment: "about gone" },
    ]);
    await db().insert(weeklyPlans).values({ id: newId(), accountId: g, week: "2026-W40" });
    await db().insert(planPitches).values({ id: pitch, accountId: g, week: "2026-W40", what: "kayak", district: "bang_rak", whenText: "Sun", audience: "circle" });
    await db().insert(pitchJoins).values([{ pitchId: pitch, accountId: o }, { pitchId: newId(), accountId: g }]);
    await db().insert(thanks).values([{ id: newId(), fromAccount: g, toAccount: o, context: `conn:${conn}`, body: "ty" }, { id: newId(), fromAccount: o, toAccount: g, context: `conn:${conn}`, body: "ty too" }]);
    await db().insert(circleHeadRequests).values({ id: newId(), accountId: g, circleName: "Gone's table" });
    await db().insert(circleShares).values({ id: newId(), eventId: ev, fromAccount: g, toAccount: o });
    await db().insert(regularTables).values({ id: table, hostAccountId: g, name: "Tuesday noodles", district: "bang_rak", description: "my words", joinToken: randomToken(12) });
    await db().insert(regularTableMembers).values({ id: newId(), tableId: table, accountId: o });
    await db().insert(regularTableMembers).values({ id: newId(), tableId: newId(), accountId: g });
    await db().insert(regularTableConflicts).values({ id: newId(), tableId: table, aAccount: a, bAccount: b });
    await db().insert(chatVotes).values({ messageId: newId(), accountId: g, option: 0 });
    await db().insert(feedback).values({ id: newId(), eventId: ev, accountId: g, groupRating: 4, comment: "nice" });
    await db().insert(registrations).values([
      { id: regGone, eventId: ev, accountId: g, status: "confirmed", passToken: randomToken(18), checkedInAt: ago(3), socialSignal: "open_to_chat", etaStatus: "on_my_way", plusOneWith: o, wantsBuddy: true },
      { id: regOther, eventId: ev, accountId: o, status: "confirmed", passToken: randomToken(18), plusOneWith: g, plusOneUsername: gone.username },
    ]);
    await deactivate(gone, 31);

    await runRetention(ENV, new Date());

    const none = async (rows: Promise<unknown[]>) => expect(await rows).toEqual([]);
    await none(db().select().from(contactShares).where(eq(contactShares.connectionId, conn)));
    await none(db().select().from(blocks).where(or(eq(blocks.blocker, g), eq(blocks.blocked, g))));
    await none(db().select().from(connectionChoices).where(or(eq(connectionChoices.fromAccount, g), eq(connectionChoices.toAccount, g))));
    await none(db().select().from(strikes).where(eq(strikes.accountId, g)));
    await none(db().select().from(invites).where(eq(invites.inviter, g)));
    await none(db().select().from(invites).where(eq(invites.usedBy, g)));
    await none(db().select().from(buddyPairs).where(eq(buddyPairs.eventId, ev)));
    await none(db().select().from(meetFeedback).where(eq(meetFeedback.accountId, g)));
    await none(db().select().from(meetFeedback).where(eq(meetFeedback.aboutAccount, g)));
    await none(db().select().from(weeklyPlans).where(eq(weeklyPlans.accountId, g)));
    await none(db().select().from(planPitches).where(eq(planPitches.accountId, g)));
    await none(db().select().from(pitchJoins).where(or(eq(pitchJoins.accountId, g), eq(pitchJoins.pitchId, pitch))));
    await none(db().select().from(thanks).where(or(eq(thanks.fromAccount, g), eq(thanks.toAccount, g))));
    await none(db().select().from(circleHeadRequests).where(eq(circleHeadRequests.accountId, g)));
    await none(db().select().from(circleShares).where(or(eq(circleShares.fromAccount, g), eq(circleShares.toAccount, g))));
    await none(db().select().from(regularTableMembers).where(eq(regularTableMembers.accountId, g)));
    await none(db().select().from(regularTableConflicts).where(eq(regularTableConflicts.tableId, table)));
    await none(db().select().from(chatVotes).where(eq(chatVotes.accountId, g)));

    // Kept, without anything personal: the other buddy's quest, the other person's
    // feedback (unlinked), attendance, the regular table's history.
    const [m] = await db().select().from(buddyMatches).where(eq(buddyMatches.id, match));
    expect([m.state, m.endReason]).toEqual(["ended", "account_deleted"]);
    expect(await db().select().from(buddyQuests).where(eq(buddyQuests.id, quest))).toHaveLength(1);
    const [theirs] = await db().select().from(meetFeedback).where(eq(meetFeedback.accountId, o));
    expect(theirs.aboutAccount).toBeNull();
    const [t] = await db().select().from(regularTables).where(eq(regularTables.id, table));
    expect([t.archivedAt !== null, t.description]).toEqual([true, ""]);
    const regs = await db().select().from(registrations).where(inArray(registrations.id, [regGone, regOther]));
    const mine = regs.find((r) => r.id === regGone)!;
    expect([mine.status, mine.checkedInAt !== null, mine.socialSignal, mine.etaStatus, mine.plusOneWith, mine.wantsBuddy]).toEqual(["confirmed", true, null, null, null, false]);
    const theirReg = regs.find((r) => r.id === regOther)!;
    expect([theirReg.plusOneWith, theirReg.plusOneUsername]).toEqual([null, null]);
    const [fb] = await db().select().from(feedback).where(eq(feedback.accountId, g));
    expect([fb.comment, fb.groupRating]).toEqual(["", 4]);
    expect((await db().select().from(accounts).where(eq(accounts.id, g)))[0].status).toBe("deleted");
  });
});

describe.skipIf(!HAS_DB)("R6: retention periods", () => {
  it("read notifications go after 90 days, closed reports, actions and strikes after 2 years, the audit log after 1 year", async () => {
    const m = await createMember();
    const ev = await pastEvent();
    const id = () => newId();
    const n = { old: id(), unread: id(), fresh: id() };
    await db().insert(notifications).values([
      { id: n.old, accountId: m.id, kind: "t", titleTh: "ท", titleEn: "t", readAt: ago(91), createdAt: ago(100) },
      // Unread: kept for UNREAD_NOTIFICATION_RETENTION_DAYS (1 year), however old the read period.
      { id: n.unread, accountId: m.id, kind: "t", titleTh: "ท", titleEn: "t", createdAt: ago(300) },
      { id: n.fresh, accountId: m.id, kind: "t", titleTh: "ท", titleEn: "t", readAt: ago(10), createdAt: ago(100) },
    ]);
    const r = { old: id(), open: id(), recent: id() };
    await db().insert(reports).values([
      { id: r.old, reporter: m.id, reason: "other", status: "dismissed", createdAt: ago(731) },
      { id: r.open, reporter: m.id, reason: "other", status: "open", createdAt: ago(731) },
      { id: r.recent, reporter: m.id, reason: "other", status: "actioned", createdAt: ago(700) },
    ]);
    const a = { old: id(), recent: id() };
    await db().insert(moderationActions).values([
      { id: a.old, accountId: m.id, action: "warning", by: "mod", createdAt: ago(731) },
      { id: a.recent, accountId: m.id, action: "warning", by: "mod", createdAt: ago(30) },
    ]);
    const s = { old: id(), recent: id() };
    await db().insert(strikes).values([
      { id: s.old, accountId: m.id, eventId: ev, reason: "no_show", expiresAt: ago(600), createdAt: ago(731) },
      { id: s.recent, accountId: m.id, eventId: newId(), reason: "no_show", expiresAt: ago(1), createdAt: ago(30) },
    ]);
    const l = { old: id(), recent: id() };
    await db().insert(auditLog).values([
      { id: l.old, actor: m.id, action: "test.old", createdAt: ago(366) },
      { id: l.recent, actor: m.id, action: "test.recent", createdAt: ago(300) },
    ]);

    const counts = await runRetention(ENV, new Date());
    expect(counts.readNotificationsDeleted).toBeGreaterThanOrEqual(1);

    const ids = async <T extends { id: string }>(rows: Promise<T[]>) => (await rows).map((x) => x.id).sort();
    expect(await ids(db().select({ id: notifications.id }).from(notifications).where(inArray(notifications.id, Object.values(n))))).toEqual([n.unread, n.fresh].sort());
    expect(await ids(db().select({ id: reports.id }).from(reports).where(inArray(reports.id, Object.values(r))))).toEqual([r.open, r.recent].sort());
    expect(await ids(db().select({ id: moderationActions.id }).from(moderationActions).where(inArray(moderationActions.id, Object.values(a))))).toEqual([a.recent]);
    expect(await ids(db().select({ id: strikes.id }).from(strikes).where(inArray(strikes.id, Object.values(s))))).toEqual([s.recent]);
    expect(await ids(db().select({ id: auditLog.id }).from(auditLog).where(inArray(auditLog.id, Object.values(l))))).toEqual([l.recent]);
  });
});
