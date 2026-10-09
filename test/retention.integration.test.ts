/**
 * Data retention (PRD §12.4), against local Postgres. runRetention works on
 * the whole local database, so the assertions only look at this file's own
 * fixtures and treat the run's counts as lower bounds.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId, randomToken, sha256 } from "../src/lib/crypto";
import {
  accounts,
  auditLog,
  connectionChoices,
  connections,
  consents,
  contactShares,
  events,
  loginAttempts,
  notifications,
  profiles,
  registrations,
  reports,
  sessions,
  vibes,
} from "../src/schema";
import { RETENTION_ACTION, retentionIfDue, runRetention } from "../src/services/retention";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function makeEvent(endedAgoMs: number) {
  const id = newId();
  const ends = new Date(Date.now() - endedAgoMs);
  await db().insert(events).values({
    id,
    title: `งานทดสอบ ${id.slice(0, 6)}`,
    startsAt: new Date(ends.getTime() - 2 * HOUR),
    endsAt: ends,
    venueName: "Lumphini Park",
    district: "pathum_wan",
    capacity: 20,
    status: "published",
    createdBy: "test",
  });
  return id;
}

async function attend(eventId: string, m: Member) {
  const id = newId();
  await db().insert(registrations).values({
    id,
    eventId,
    accountId: m.id,
    status: "confirmed",
    passToken: randomToken(),
    checkedInAt: new Date(),
    socialSignal: "open_to_chat",
    signalTopics: ["food"],
  });
  return id;
}

async function deactivate(m: Member, daysAgo: number) {
  await db()
    .update(accounts)
    .set({ status: "deactivated", deactivatedAt: new Date(Date.now() - daysAgo * DAY) })
    .where(eq(accounts.id, m.id));
}

async function personalRows(m: Member) {
  await db().insert(vibes).values({ accountId: m.id, vector: { energy: 0.5 }, archetype: "allrounder" });
  await db().insert(notifications).values({ id: newId(), accountId: m.id, kind: "test", titleTh: "ทดสอบ", titleEn: "Test" });
}

describe.skipIf(!HAS_DB)("runRetention", () => {
  it("removes exactly what the retention table says, and audits the run", async () => {
    const a = await createMember();
    const b = await createMember();

    // Signals: cleared 7+ days after the event, kept before that.
    const evOld = await makeEvent(8 * DAY);
    const regOld = await attend(evOld, a);
    const evMid = await makeEvent(4 * DAY);
    const regMid = await attend(evMid, a);
    await attend(evMid, b);

    // Choices: the 4-day-old event's window is closed; the 1-day-old one is open.
    const evNew = await makeEvent(1 * DAY);
    const closedChoice = newId();
    const openChoice = newId();
    await db().insert(connectionChoices).values([
      { id: closedChoice, eventId: evMid, fromAccount: a.id, toAccount: b.id, choice: "friend" },
      { id: openChoice, eventId: evNew, fromAccount: a.id, toAccount: b.id, choice: "friend" },
    ]);
    const [lo, hi] = [a.id, b.id].sort();
    const mutual = newId();
    await db().insert(connections).values({ id: mutual, aAccount: lo, bAccount: hi, level: "friend", eventId: evMid });

    // Sessions and sign-in attempts.
    const expired = await sha256(randomToken());
    await db().insert(sessions).values({ id: expired, accountId: a.id, expiresAt: new Date(Date.now() - HOUR) });
    const oldAttempt = newId();
    const freshAttempt = newId();
    await db().insert(loginAttempts).values([
      { id: oldAttempt, username: `old_${oldAttempt.slice(0, 6)}`, ipHash: "x", createdAt: new Date(Date.now() - 25 * HOUR) },
      { id: freshAttempt, username: `new_${freshAttempt.slice(0, 6)}`, ipHash: "x", createdAt: new Date(Date.now() - HOUR) },
    ]);

    // Deactivated accounts: one due, one too recent, one due but on moderation hold.
    const gone = await createMember();
    await personalRows(gone);
    const goneConn = newId();
    const [g1, g2] = [gone.id, b.id].sort();
    await db().insert(connections).values({ id: goneConn, aAccount: g1, bAccount: g2, level: "friend", eventId: evOld });
    await db().insert(contactShares).values({ id: newId(), connectionId: goneConn, accountId: gone.id, method: "line", value: "gone_line" });
    const closedReport = newId();
    await db().insert(reports).values({ id: closedReport, reporter: b.id, targetAccount: gone.id, reason: "other", status: "dismissed" });
    await deactivate(gone, 31);

    const recent = await createMember();
    await personalRows(recent);
    await deactivate(recent, 5);

    const held = await createMember();
    await db().insert(reports).values({ id: newId(), reporter: b.id, targetAccount: held.id, reason: "harassment", status: "open" });
    await deactivate(held, 40);

    const actor = `test_${newId()}`;
    const counts = await runRetention(ENV, new Date(), actor);

    expect(counts.signalsCleared).toBeGreaterThanOrEqual(1);
    expect(counts.choicesDeleted).toBeGreaterThanOrEqual(1);
    expect(counts.sessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(counts.loginAttemptsDeleted).toBeGreaterThanOrEqual(1);
    expect(counts.accountsDeleted).toBeGreaterThanOrEqual(1);

    const d = db();
    const regs = await d.select().from(registrations).where(inArray(registrations.id, [regOld, regMid])).limit(5);
    expect(regs.find((r) => r.id === regOld)).toMatchObject({ socialSignal: null, signalTopics: null });
    expect(regs.find((r) => r.id === regMid)).toMatchObject({ socialSignal: "open_to_chat", signalTopics: ["food"] });

    const choices = await d.select({ id: connectionChoices.id }).from(connectionChoices).where(inArray(connectionChoices.id, [closedChoice, openChoice])).limit(5);
    expect(choices.map((c) => c.id)).toEqual([openChoice]);
    const [conn] = await d.select().from(connections).where(eq(connections.id, mutual)).limit(1);
    expect(conn.removedAt).toBeNull();

    expect(await d.select().from(sessions).where(eq(sessions.id, expired)).limit(1)).toHaveLength(0);
    const attempts = await d.select({ id: loginAttempts.id }).from(loginAttempts).where(inArray(loginAttempts.id, [oldAttempt, freshAttempt])).limit(5);
    expect(attempts.map((r) => r.id)).toEqual([freshAttempt]);

    // The due account: personal rows gone, account anonymised, reports kept.
    const [goneAcct] = await d.select().from(accounts).where(eq(accounts.id, gone.id)).limit(1);
    expect(goneAcct).toMatchObject({ username: `deleted_${gone.id.slice(0, 8)}`, passwordHash: "", passwordSalt: "", status: "deleted", researchId: null });
    for (const [table, col] of [
      [profiles, profiles.accountId],
      [vibes, vibes.accountId],
      [sessions, sessions.accountId],
      [notifications, notifications.accountId],
      [contactShares, contactShares.accountId],
      [consents, consents.accountId],
    ] as const) {
      expect(await d.select().from(table).where(eq(col, gone.id)).limit(1)).toHaveLength(0);
    }
    const [goneConnRow] = await d.select().from(connections).where(eq(connections.id, goneConn)).limit(1);
    expect(goneConnRow.removedAt).not.toBeNull();
    expect(await d.select().from(reports).where(eq(reports.id, closedReport)).limit(1)).toHaveLength(1);
    expect((await req("/events", { cookie: gone.cookie })).status).toBe(302);

    // Too recent, and on hold: untouched.
    for (const m of [recent, held]) {
      const [acct] = await d.select().from(accounts).where(eq(accounts.id, m.id)).limit(1);
      expect(acct).toMatchObject({ username: m.username, status: "deactivated", researchId: m.researchId });
      expect(await d.select().from(profiles).where(eq(profiles.accountId, m.id)).limit(1)).toHaveLength(1);
    }
    expect(await d.select().from(vibes).where(eq(vibes.accountId, recent.id)).limit(1)).toHaveLength(1);
    expect(await d.select().from(notifications).where(eq(notifications.accountId, recent.id)).limit(1)).toHaveLength(1);

    const [row] = await d.select().from(auditLog).where(and(eq(auditLog.actor, actor), eq(auditLog.action, RETENTION_ACTION))).limit(2);
    expect(row.detail).toMatchObject({ accountsDeleted: counts.accountsDeleted, signalsCleared: counts.signalsCleared });

    // The lazy timer does not run again within 24 hours.
    const again = await retentionIfDue(ENV, `${actor}_lazy`);
    expect(again).not.toBeNull();
    expect(await d.select().from(auditLog).where(eq(auditLog.actor, `${actor}_lazy`)).limit(1)).toHaveLength(0);
  });
});

describe.skipIf(!HAS_DB)("retention on the staff dashboard", () => {
  it("only lets bma_admin run it", async () => {
    for (const role of ["host", "moderator", "insight_viewer", "partner_admin"] as const) {
      const m = await createMember({ role });
      expect((await req("/admin/retention", { cookie: m.cookie, method: "POST" })).status, role).toBe(403);
    }
    const member = await createMember();
    expect((await req("/admin/retention", { cookie: member.cookie, method: "POST" })).status).toBe(403);
    expect((await req("/admin/retention", { method: "POST" })).status).toBe(302);
  });

  it("runs on demand for bma_admin and shows the last run", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const r = await req("/admin/retention", { cookie: admin.cookie, method: "POST" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("/admin");
    const rows = await db().select().from(auditLog).where(and(eq(auditLog.actor, admin.id), eq(auditLog.action, RETENTION_ACTION))).limit(2);
    expect(rows).toHaveLength(1);

    const page = await (await req("/admin", { cookie: admin.cookie })).text();
    expect(page).toContain("การเก็บรักษาข้อมูล");
    expect(page).toContain('action="/admin/retention"');
    // Visiting right after a run does not run it again.
    const after = await db().select().from(auditLog).where(and(eq(auditLog.actor, admin.id), eq(auditLog.action, RETENTION_ACTION))).limit(5);
    expect(after).toHaveLength(1);

    const host = await createMember({ role: "host" });
    expect(await (await req("/admin", { cookie: host.cookie })).text()).not.toContain("/admin/retention");
  });
});
