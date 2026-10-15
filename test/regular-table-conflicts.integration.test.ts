/**
 * Regular tables, after the owner's review (D19): when two members block each
 * other nobody is removed and the host decides (keep both, ask one to step
 * back for 30 days, or send it to moderators); the one-time backfill that
 * opens a table for existing Table Hosts; "Regular at" on the profile card.
 */
import { describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import postgres from "postgres";
import { createMember, db, ENV, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { MIGRATIONS } from "../src/migrations";
import { auditLog, blocks, circleHeadRequests, connections, notifications, profiles, regularTableConflicts, regularTableMembers, regularTables, reports } from "../src/schema";

type Table = typeof regularTables.$inferSelect;

async function hostWithTable(opts: { name?: string; gender?: string; womenOnly?: boolean } = {}): Promise<{ host: Member; table: Table }> {
  const host = await createMember({ role: "circle_head" });
  if (opts.gender) await db().update(profiles).set({ gender: opts.gender }).where(eq(profiles.accountId, host.id));
  const id = newId();
  await db().insert(regularTables).values({ id, hostAccountId: host.id, name: opts.name ?? `Table ${randomToken(4)}`, district: "khlong_toei", joinToken: randomToken(18), womenOnly: opts.womenOnly ?? false });
  const [table] = await db().select().from(regularTables).where(eq(regularTables.id, id));
  return { host, table };
}

const join = (t: Table, m: Member) => req(`/tables/${t.id}/join`, { cookie: m.cookie, form: { t: t.joinToken } });
const isMember = async (t: Table, m: Member) =>
  (await db().select().from(regularTableMembers).where(and(eq(regularTableMembers.tableId, t.id), eq(regularTableMembers.accountId, m.id), isNull(regularTableMembers.leftAt)))).length === 1;
const en = (m: Member) => `${m.cookie}; lang=en`;
const block = (who: Member, other: Member) => req(`/block/${other.id}`, { cookie: who.cookie, method: "POST", form: {} });
const conflictsOf = (t: Table) => db().select().from(regularTableConflicts).where(eq(regularTableConflicts.tableId, t.id));
const act = (t: Table, host: Member, id: string, form: Record<string, string>) => req(`/tables/${t.id}/conflicts/${id}`, { cookie: host.cookie, form });
const auditOf = async (actor: Member, action: string) => (await db().select().from(auditLog).where(and(eq(auditLog.actor, actor.id), eq(auditLog.action, action))))[0];

describe.skipIf(!HAS_DB)("regular table conflicts", () => {
  it("two members who block each other both stay, stop seeing each other, and the host is told privately without who or why", async () => {
    const { host, table } = await hostWithTable();
    const [a, b, outsider] = await Promise.all([createMember({ nickname: `Ann${randomToken(3)}` }), createMember({ nickname: `Bee${randomToken(3)}` }), createMember()]);
    const nick = async (m: Member) => (await db().select({ n: profiles.nickname }).from(profiles).where(eq(profiles.accountId, m.id)))[0].n;
    const [nickA, nickB] = await Promise.all([nick(a), nick(b)]);
    await join(table, a);
    await join(table, b);
    await req(`/chat/table:${table.id}`, { cookie: a.cookie, form: { body: "Message from Ann" } });
    expect((await block(a, b)).status).toBe(302);

    // Nobody is removed.
    expect(await isMember(table, a)).toBe(true);
    expect(await isMember(table, b)).toBe(true);
    // They stop seeing each other on the table page and in its chat.
    expect(await (await req(`/tables/${table.id}`, { cookie: en(b) })).text()).not.toContain(nickA);
    expect(await (await req(`/chat/table:${table.id}`, { cookie: en(b) })).text()).not.toContain("Message from Ann");

    // One conflict, stored in id order, so it doesn't record direction.
    const [conflict] = await conflictsOf(table);
    expect(conflict.status).toBe("open");
    expect([conflict.aAccount, conflict.bAccount]).toEqual([a.id, b.id].sort());

    // The host's notification names both and never says who blocked whom.
    const notes = await db().select().from(notifications).where(and(eq(notifications.accountId, host.id), eq(notifications.kind, "table_conflict")));
    expect(notes).toHaveLength(1);
    expect(notes[0].titleTh).toContain("สองคนในโต๊ะประจำของคุณมีเรื่องไม่สบายใจกัน");
    expect(notes[0].titleEn).toContain("Two people at your regular table aren't comfortable with each other");
    for (const text of [notes[0].titleTh, notes[0].titleEn]) {
      expect(text).toContain(nickA);
      expect(text).toContain(nickB);
      expect(text.toLowerCase()).not.toContain("block");
      expect(text).not.toContain("บล็อก");
    }
    expect(notes[0].link).toBe(`/tables/${table.id}/conflicts`);
    // The members get no notification about it.
    for (const m of [a, b]) expect(await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, "table_conflict")))).toHaveLength(0);

    // Blocking back doesn't raise it a second time.
    await block(b, a);
    expect(await conflictsOf(table)).toHaveLength(1);

    // Only the host sees the page and can act.
    const page = await (await req(`/tables/${table.id}/conflicts`, { cookie: en(host) })).text();
    expect(page).toContain(nickA);
    expect(page).toContain(nickB);
    expect(page).toContain("We never say who blocked whom");
    expect(await (await req(`/tables/${table.id}`, { cookie: en(host) })).text()).toContain("waiting for you");
    for (const who of [a, b, outsider]) {
      expect((await req(`/tables/${table.id}/conflicts`, { cookie: who.cookie })).status).toBe(404);
      expect((await req(`/tables/${table.id}/conflicts/${conflict.id}`, { cookie: who.cookie, form: { action: "keep" } })).status).toBe(404);
    }
    expect((await conflictsOf(table))[0].status).toBe("open");

    // (a) Keep both: closed, both still members, still hidden from each other; audit has no reason.
    expect((await act(table, host, conflict.id, { action: "keep" })).status).toBe(302);
    expect((await conflictsOf(table))[0]).toMatchObject({ status: "kept" });
    expect(await isMember(table, a)).toBe(true);
    expect(await isMember(table, b)).toBe(true);
    expect(await (await req(`/tables/${table.id}`, { cookie: en(b) })).text()).not.toContain(nickA);
    const log = await auditOf(host, "regular_table.conflict_keep");
    expect(log.targetId).toBe(conflict.id);
    expect(log.detail).toEqual({});
  });

  it("(b) asking one to step back: they leave with a kind note and can't rejoin for 30 days", async () => {
    const { host, table } = await hostWithTable();
    const [a, b] = await Promise.all([createMember(), createMember()]);
    await join(table, a);
    await join(table, b);
    await block(b, a);
    const [conflict] = await conflictsOf(table);
    // Only one of the pair can be asked.
    await act(table, host, conflict.id, { action: "step_back", member: host.id });
    expect((await conflictsOf(table))[0].status).toBe("open");

    expect((await act(table, host, conflict.id, { action: "step_back", member: a.id })).status).toBe(302);
    expect((await conflictsOf(table))[0].status).toBe("stepped_back");
    expect(await isMember(table, a)).toBe(false);
    expect(await isMember(table, b)).toBe(true);
    const [row] = await db().select().from(regularTableMembers).where(and(eq(regularTableMembers.tableId, table.id), eq(regularTableMembers.accountId, a.id)));
    const days = (row.rejoinAfter!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    const [note] = await db().select().from(notifications).where(and(eq(notifications.accountId, a.id), eq(notifications.kind, "table_step_back")));
    expect(note.titleEn).toContain("Thanks for understanding");
    expect(note.titleEn.toLowerCase()).not.toContain("block");
    expect(note.titleTh).toContain("ขอบคุณที่เข้าใจนะ");

    // Even with the block gone and the invite link, not before 30 days.
    await db().delete(blocks).where(and(eq(blocks.blocker, b.id), eq(blocks.blocked, a.id)));
    expect(await (await req(`/tables/${table.id}?t=${table.joinToken}`, { cookie: en(a) })).text()).toContain("days after you stepped back");
    await join(table, a);
    expect(await isMember(table, a)).toBe(false);
    await db().update(regularTableMembers).set({ rejoinAfter: new Date(Date.now() - 1000) }).where(eq(regularTableMembers.id, row.id));
    await join(table, a);
    expect(await isMember(table, a)).toBe(true);
    expect((await auditOf(host, "regular_table.conflict_step_back")).detail).toEqual({});
  });

  it("(c) sending it to moderators makes a report in the usual queue, with no reason or direction", async () => {
    const { host, table } = await hostWithTable();
    const [a, b, mod] = await Promise.all([createMember(), createMember(), createMember({ role: "moderator" })]);
    await join(table, a);
    await join(table, b);
    await block(a, b);
    const [conflict] = await conflictsOf(table);
    expect((await act(table, host, conflict.id, { action: "report" })).status).toBe(302);
    expect((await conflictsOf(table))[0].status).toBe("reported");
    const [report] = await db().select().from(reports).where(eq(reports.reporter, host.id));
    expect(report).toMatchObject({ reason: "other", status: "open", targetAccount: conflict.aAccount });
    expect(report.details).toContain(a.username);
    expect(report.details).toContain(b.username);
    expect(report.details).toContain("No reason or direction is recorded");
    // Nobody removed by reporting.
    expect(await isMember(table, a)).toBe(true);
    expect(await isMember(table, b)).toBe(true);
    expect((await db().select().from(notifications).where(and(eq(notifications.accountId, mod.id), eq(notifications.kind, "report")))).length).toBeGreaterThan(0);
    expect((await req("/admin/moderation", { cookie: mod.cookie })).status).toBe(200);
    expect(await (await req(`/admin/moderation/${report.id}`, { cookie: en(mod) })).text()).toContain(b.username);
    expect(Object.keys((await auditOf(host, "regular_table.conflict_report")).detail)).toEqual(["report"]);
    // A closed conflict can't be acted on again.
    await act(table, host, conflict.id, { action: "step_back", member: a.id });
    expect(await isMember(table, a)).toBe(true);
  });

  it("blocking the host still hides the table from that member", async () => {
    const { host, table } = await hostWithTable();
    const m = await createMember();
    await join(table, m);
    await block(m, host);
    expect((await req(`/tables/${table.id}`, { cookie: m.cookie })).status).toBe(404);
    expect((await req(`/chat/table:${table.id}`, { cookie: m.cookie })).status).toBe(404);
    // A block with the host isn't a member conflict.
    expect(await conflictsOf(table)).toHaveLength(0);
  });
});

describe.skipIf(!HAS_DB)("existing Table Hosts backfill", () => {
  it("the migration opens a table for every Table Host without one, from their latest approved request, once", async () => {
    const backfill = MIGRATIONS.find((m) => m.id.startsWith("0017_"))!.statements.find((s) => s.includes('INSERT INTO "social_regular_tables"'));
    expect(backfill).toBeTruthy();
    const [old, withTable, plain] = await Promise.all([createMember({ role: "circle_head", district: "bang_na" }), hostWithTable(), createMember()]);
    await db().insert(circleHeadRequests).values([
      { id: newId(), accountId: old.id, status: "approved", circleName: "Old name", createdAt: new Date(Date.now() - 86_400_000) },
      { id: newId(), accountId: old.id, status: "approved", circleName: "Bang Na board gamers" },
      { id: newId(), accountId: old.id, status: "declined", circleName: "Declined name" },
      { id: newId(), accountId: withTable.host.id, status: "approved", circleName: "Should not duplicate" },
      { id: newId(), accountId: plain.id, status: "approved", circleName: "Not a Table Host" },
    ]);
    const sql = postgres(ENV.DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      await sql.unsafe(backfill!);
      await sql.unsafe(backfill!); // idempotent
    } finally {
      await sql.end();
    }
    const of = (id: string) => db().select().from(regularTables).where(eq(regularTables.hostAccountId, id));
    const made = await of(old.id);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ name: "Bang Na board gamers", district: "bang_na", womenOnly: false, archivedAt: null });
    expect(made[0].joinToken.length).toBeGreaterThan(30);
    expect(await of(withTable.host.id)).toHaveLength(1);
    expect(await of(plain.id)).toHaveLength(0);
    // The backfilled table works like any other.
    const guest = await createMember();
    await join(made[0], guest);
    expect(await isMember(made[0], guest)).toBe(true);
  });
});

describe.skipIf(!HAS_DB)("Regular at on the profile card", () => {
  it("shows to self and connected viewers, never a women-only table the viewer couldn't join", async () => {
    const open = (await hostWithTable({ name: `Open table ${randomToken(3)}` })).table;
    const womenOnly = (await hostWithTable({ name: `Women table ${randomToken(3)}`, gender: "woman", womenOnly: true })).table;
    const [member, man, woman, unsaid, stranger] = await Promise.all([createMember(), createMember(), createMember(), createMember(), createMember()]);
    await db().update(profiles).set({ gender: "woman" }).where(inArray(profiles.accountId, [member.id, woman.id]));
    await db().update(profiles).set({ gender: "man" }).where(eq(profiles.accountId, man.id));
    await join(open, member);
    await join(womenOnly, member);
    for (const viewer of [man, woman, unsaid]) {
      const [x, y] = [member.id, viewer.id].sort();
      await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "friend", eventId: newId() });
    }
    const self = await (await req("/me/profile", { cookie: en(member) })).text();
    expect(self).toContain("Regular at");
    expect(self).toContain(open.name);
    expect(self).toContain(womenOnly.name);
    const asWoman = await (await req(`/people/${member.id}`, { cookie: en(woman) })).text();
    expect(asWoman).toContain(open.name);
    expect(asWoman).toContain(womenOnly.name);
    for (const viewer of [man, unsaid]) {
      const html = await (await req(`/people/${member.id}`, { cookie: en(viewer) })).text();
      expect(html).toContain("Regular at");
      expect(html).toContain(open.name);
      expect(html).not.toContain(womenOnly.name);
    }
    // Thai label.
    expect(await (await req(`/people/${member.id}`, { cookie: `${woman.cookie}; lang=th` })).text()).toContain("ขาประจำที่");
    // Not connected: no card at all.
    expect((await req(`/people/${member.id}`, { cookie: stranger.cookie })).status).toBe(404);
  });
});
