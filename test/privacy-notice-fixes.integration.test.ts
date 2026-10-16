/**
 * Where the privacy notice promised more than the code did (owner rule, 16 Oct
 * 2026, design/reference/privacy-risk-assessment.md §7), the code now keeps the
 * promise: contact shares go with the connection, a closed account's research
 * answers are deleted, the data export is complete, exit notes and unread
 * notifications have a period.
 */
import { describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createMember, db, ENV, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import {
  accounts,
  blocks,
  chatMessages,
  chatVotes,
  circleHeadRequests,
  circleShares,
  connections,
  contactShares,
  events,
  exitReasons,
  notifications,
  pulseResponses,
  regularTableMembers,
  regularTables,
  wellbeing,
} from "../src/schema";
import { runRetention } from "../src/services/retention";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function pastEvent() {
  const id = newId();
  await db().insert(events).values({ id, title: `FIX-${id.slice(0, 6)}`, startsAt: ago(3), endsAt: ago(3), venueName: "Lumphini Park", district: "pathum_wan", capacity: 20, status: "published", createdBy: "test" });
  return id;
}

/** A connection between two members with a contact share from each of them. */
async function sharedPair(opts: { removed?: boolean } = {}) {
  const [x, y] = await Promise.all([createMember(), createMember()]);
  const [a, b] = [x.id, y.id].sort();
  const conn = newId();
  await db().insert(connections).values({ id: conn, aAccount: a, bAccount: b, level: "friend", eventId: await pastEvent(), removedAt: opts.removed ? ago(1) : null });
  await db().insert(contactShares).values([
    { id: newId(), connectionId: conn, accountId: x.id, method: "line", value: "x_line" },
    { id: newId(), connectionId: conn, accountId: y.id, method: "instagram", value: "y.ig" },
  ]);
  return { x, y, conn };
}
const sharesOn = (conn: string) => db().select({ id: contactShares.id }).from(contactShares).where(eq(contactShares.connectionId, conn));

describe.skipIf(!HAS_DB)("contact shares last only as long as the connection", () => {
  it("removing a connection deletes both people's contact shares", async () => {
    const { x, conn } = await sharedPair();
    expect((await req(`/connections/${conn}/remove`, { cookie: x.cookie, method: "POST" })).status).toBe(302);
    expect(await sharesOn(conn)).toEqual([]);
  });

  it("a block deletes both people's contact shares", async () => {
    const { x, y, conn } = await sharedPair();
    await req(`/block/${y.id}`, { cookie: x.cookie, form: { back: "/connections" } });
    expect(await sharesOn(conn)).toEqual([]);
  });

  it("the retention job deletes shares left on removed connections and blocked pairs, and keeps live ones", async () => {
    const removed = await sharedPair({ removed: true });
    const blocked = await sharedPair();
    await db().insert(blocks).values({ id: newId(), blocker: blocked.y.id, blocked: blocked.x.id });
    const live = await sharedPair();
    // Another test file's run may get there first, so the rows are checked, not this run's count.
    const counts = await runRetention(ENV);
    expect(await sharesOn(removed.conn)).toEqual([]);
    expect(await sharesOn(blocked.conn)).toEqual([]);
    expect(await sharesOn(live.conn)).toHaveLength(2);
    expect(counts.contactSharesDeleted).toEqual(expect.any(Number));
  });
});

describe.skipIf(!HAS_DB)("a closed account's City Pulse and wellbeing answers are deleted", () => {
  const answers = async (m: Member) => {
    await db().insert(pulseResponses).values({ id: newId(), questionId: newId(), researchId: m.researchId, answer: "yes" });
    await db().insert(wellbeing).values({ id: newId(), researchId: m.researchId, phase: "baseline", q1: 1, q2: 2, q3: 3 });
  };
  const left = async (m: Member) => [
    ...(await db().select({ id: pulseResponses.id }).from(pulseResponses).where(eq(pulseResponses.researchId, m.researchId))),
    ...(await db().select({ id: wellbeing.id }).from(wellbeing).where(eq(wellbeing.researchId, m.researchId))),
  ];

  it("deactivating deletes them at once, the same way withdrawing research does", async () => {
    const [m, other] = await Promise.all([createMember({ research: true }), createMember({ research: true })]);
    await answers(m);
    await answers(other);
    expect((await req("/settings/deactivate", { cookie: m.cookie, form: { confirm: "1" } })).status).toBe(302);
    expect(await left(m)).toEqual([]);
    expect(await left(other)).toHaveLength(2);
    const [acct] = await db().select({ status: accounts.status, rid: accounts.researchId }).from(accounts).where(eq(accounts.id, m.id));
    expect(acct).toEqual({ status: "deactivated", rid: null });
  });

  it("account deletion after 30 days deletes any answers still linked", async () => {
    const m = await createMember({ research: true });
    await answers(m);
    await db().update(accounts).set({ status: "deactivated", deactivatedAt: ago(31) }).where(eq(accounts.id, m.id));
    await runRetention(ENV);
    expect(await left(m)).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("the data export covers Regular Tables, Table Host requests, hangout shares, poll votes and the sign-up source", () => {
  it("includes the member's own rows and nothing private about others", async () => {
    const [m, host] = await Promise.all([createMember({ nickname: "Exporter" }), createMember({ nickname: "Hostname" })]);
    await db().update(accounts).set({ signupSource: "uni-fair" }).where(eq(accounts.id, m.id));
    const table = newId();
    const token = `tok${randomToken(10)}`;
    await db().insert(regularTables).values({ id: table, hostAccountId: host.id, name: "Sunday Runners", district: "pathum_wan", joinToken: token });
    await db().insert(regularTableMembers).values({ id: newId(), tableId: table, accountId: m.id });
    await db().insert(circleHeadRequests).values([
      { id: newId(), accountId: m.id, circleName: "Board games night", plan: "my plan", reviewedBy: host.id },
      { id: newId(), accountId: host.id, circleName: "THEIR REQUEST", plan: "their plan" },
    ]);
    const ev = await pastEvent();
    await db().insert(circleShares).values({ id: newId(), eventId: ev, fromAccount: host.id, toAccount: m.id });
    const poll = newId();
    await db().insert(chatMessages).values({ id: poll, thread: `circle:${table}`, sender: host.id, body: "THEIR POLL QUESTION", kind: "poll", pollOptions: ["Sat", "Sun"] });
    await db().insert(chatVotes).values({ messageId: poll, accountId: m.id, option: 1 });

    const text = await (await req("/settings/privacy/export", { cookie: m.cookie })).text();
    const data = JSON.parse(text);
    expect(data.account.signupSource).toBe("uni-fair");
    expect(data.regularTables.memberships[0]).toMatchObject({ table: "Sunday Runners", district: "pathum_wan", leftAt: null });
    expect(data.regularTables.tablesIHost).toEqual([]);
    expect(data.regularTables.tableHostRequests).toHaveLength(1);
    expect(data.regularTables.tableHostRequests[0]).toMatchObject({ tableName: "Board games night", plan: "my plan", status: "pending" });
    expect(data.hangoutSharesIReceived[0]).toMatchObject({ from: "Hostname" });
    expect(data.hangoutSharesISent).toEqual([]);
    expect(data.chatPollVotes).toEqual([expect.objectContaining({ thread: "circle", option: 1 })]);
    for (const bad of [token, "THEIR REQUEST", "their plan", "THEIR POLL QUESTION", host.id, m.id, table, poll]) expect(text).not.toContain(bad);
  });
});

describe.skipIf(!HAS_DB)("exit notes and unread notifications have a period", () => {
  it("blanks an exit note after a year and keeps the picked reasons", async () => {
    const [old, fresh] = [newId(), newId()];
    await db().insert(exitReasons).values([
      { id: old, reasons: ["moved"], note: "old note", createdAt: ago(366) },
      { id: fresh, reasons: ["busy"], note: "new note", createdAt: ago(364) },
    ]);
    await runRetention(ENV);
    const rows = await db().select().from(exitReasons).where(inArray(exitReasons.id, [old, fresh]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([byId.get(old)!.note, byId.get(old)!.reasons]).toEqual(["", ["moved"]]);
    expect(byId.get(fresh)!.note).toBe("new note");
  });

  it("deletes unread notifications after a year, and not newer ones", async () => {
    const m = await createMember();
    const [old, fresh, readRecent] = [newId(), newId(), newId()];
    const note = (id: string, createdAt: Date, readAt: Date | null = null) => ({ id, accountId: m.id, kind: "test", titleTh: "ทดสอบ", titleEn: "Test", createdAt, readAt });
    await db().insert(notifications).values([note(old, ago(366)), note(fresh, ago(364)), note(readRecent, ago(366), ago(10))]);
    await runRetention(ENV);
    const ids = (await db().select({ id: notifications.id }).from(notifications).where(eq(notifications.accountId, m.id))).map((r) => r.id).sort();
    expect(ids).toEqual([fresh, readRecent].sort());
  });
});
