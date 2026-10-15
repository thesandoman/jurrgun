/**
 * Regular tables (โต๊ะประจำ) as real groups: made when a Table Host is
 * approved, joined by invite link or after a hangout, left any time; blocks
 * and women-only rules; hangouts go to members only; the table chat is for
 * members only; non-members see name, host, district and join.
 */
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createMember, db, HAS_DB, req, type Member } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, blocks, circleHeadRequests, connections, events, notifications, profiles, regularTableMembers, regularTables, registrations } from "../src/schema";

const bkk = (daysAhead: number, hour: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000 + 7 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
};
const proposal = (over: Record<string, string | string[]> = {}) => ({
  title: "Sunday picnic",
  description: "Bring a snack to share. Everyone welcome.",
  startsAt: bkk(5, 14),
  endsAt: bkk(5, 17),
  venueName: "Benjakitti Park",
  district: "khlong_toei",
  capacity: "10",
  ageMin: "18",
  ageMax: "99",
  languages: ["th", "en"],
  costThb: "0",
  intensity: "social",
  groupMin: "4",
  groupMax: "6",
  visibility: "private",
  ...over,
});

type Table = typeof regularTables.$inferSelect;

/** A Table Host with an open regular table. */
async function hostWithTable(opts: { gender?: string; womenOnly?: boolean } = {}): Promise<{ host: Member; table: Table }> {
  const host = await createMember({ role: "circle_head" });
  if (opts.gender) await db().update(profiles).set({ gender: opts.gender }).where(eq(profiles.accountId, host.id));
  const id = newId();
  await db().insert(regularTables).values({ id, hostAccountId: host.id, name: "Sunday Park Walkers", district: "khlong_toei", joinToken: randomToken(18), womenOnly: opts.womenOnly ?? false });
  const [table] = await db().select().from(regularTables).where(eq(regularTables.id, id));
  return { host, table };
}

const join = (t: Table, m: Member, token = t.joinToken) => req(`/tables/${t.id}/join`, { cookie: m.cookie, form: { t: token } });
const isMember = async (t: Table, m: Member) =>
  (await db().select().from(regularTableMembers).where(and(eq(regularTableMembers.tableId, t.id), eq(regularTableMembers.accountId, m.id), isNull(regularTableMembers.leftAt)))).length === 1;
const en = (m: Member) => `${m.cookie}; lang=en`;
const nick = (m: Member) => m.username;

describe.skipIf(!HAS_DB)("regular tables", () => {
  it("approving a Table Host request opens their regular table with the requested name", async () => {
    const [member, admin] = await Promise.all([createMember({ district: "bang_rak" }), createMember({ role: "bma_admin" })]);
    expect((await req("/circles/lead", { cookie: member.cookie, form: { circleName: "Lumphini morning runners", plan: "Easy 5k on Saturdays", agree: "1" } })).status).toBe(302);
    const [request] = await db().select().from(circleHeadRequests).where(eq(circleHeadRequests.accountId, member.id));
    expect((await req(`/admin/review/circle/${request.id}/approve`, { cookie: admin.cookie, method: "POST", form: {} })).status).toBe(302);
    const [account] = await db().select().from(accounts).where(eq(accounts.id, member.id));
    expect(account.role).toBe("circle_head");
    const tables = await db().select().from(regularTables).where(eq(regularTables.hostAccountId, member.id));
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ name: "Lumphini morning runners", district: "bang_rak", requestId: request.id, archivedAt: null });
    const [note] = await db().select().from(notifications).where(and(eq(notifications.accountId, member.id), eq(notifications.kind, "circle_head")));
    expect(note.link).toBe(`/tables/${tables[0].id}`);
    // The host's own page shows the invite link and edit form.
    const html = await (await req(`/tables/${tables[0].id}`, { cookie: en(member) })).text();
    expect(html).toContain("Invite link");
    expect(html).toContain(tables[0].joinToken);
    // And it's listed under My regular tables, on My people and on /tables.
    expect(await (await req("/tables", { cookie: en(member) })).text()).toContain("Lumphini morning runners");
    expect(await (await req("/connections", { cookie: en(member) })).text()).toContain("Lumphini morning runners");
  });

  it("non-members see only name, host, district and join; joining needs the invite link; members can leave and come back", async () => {
    const { host, table } = await hostWithTable();
    const [a, b] = await Promise.all([createMember(), createMember()]);
    expect((await join(table, a)).status).toBe(302);
    expect(await isMember(table, a)).toBe(true);
    await req(`/chat/table:${table.id}`, { cookie: a.cookie, form: { body: "Hello table" } });

    // b has no invite: sees the basics only, no members, no chat, no hangouts, no join button.
    const outside = await req(`/tables/${table.id}`, { cookie: en(b) });
    expect(outside.status).toBe(200);
    const html = await outside.text();
    expect(html).toContain("Sunday Park Walkers");
    expect(html).toContain(nick(host));
    expect(html).toContain("Khlong Toei");
    expect(html).not.toContain(nick(a));
    expect(html).not.toContain("Table chat");
    expect(html).not.toContain("Join this regular table");
    expect(html).not.toContain(table.joinToken);
    await join(table, b, "wrong-token");
    expect(await isMember(table, b)).toBe(false);

    // With the link: the join button, then the member view.
    expect(await (await req(`/tables/${table.id}?t=${table.joinToken}`, { cookie: en(b) })).text()).toContain("Join this regular table");
    await join(table, b);
    expect(await isMember(table, b)).toBe(true);
    const inside = await (await req(`/tables/${table.id}`, { cookie: en(b) })).text();
    expect(inside).toContain(nick(a));
    expect(inside).toContain("Table chat");
    expect(inside).toContain("Leave the table");

    // Leave: out of the table and its chat at once. Come back with the link.
    expect((await req(`/tables/${table.id}/leave`, { cookie: b.cookie, method: "POST", form: {} })).status).toBe(302);
    expect(await isMember(table, b)).toBe(false);
    expect((await req(`/chat/table:${table.id}`, { cookie: b.cookie })).status).toBe(404);
    await join(table, b);
    expect(await isMember(table, b)).toBe(true);

    // A reset link stops the old one working.
    const c = await createMember();
    await req(`/tables/${table.id}/link/reset`, { cookie: host.cookie, method: "POST", form: {} });
    await join(table, c);
    expect(await isMember(table, c)).toBe(false);
    // Only the host can reset or edit.
    const before = (await db().select().from(regularTables).where(eq(regularTables.id, table.id)))[0];
    await req(`/tables/${table.id}/link/reset`, { cookie: a.cookie, method: "POST", form: {} });
    await req(`/tables/${table.id}/edit`, { cookie: a.cookie, form: { name: "Taken over" } });
    const after = (await db().select().from(regularTables).where(eq(regularTables.id, table.id)))[0];
    expect(after.joinToken).toBe(before.joinToken);
    expect(after.name).toBe("Sunday Park Walkers");
  });

  it("someone who went to a hangout with the host can join from the event page", async () => {
    const { host, table } = await hostWithTable();
    const [guest, notThere] = await Promise.all([createMember(), createMember()]);
    const id = newId();
    const startsAt = new Date(Date.now() - 2 * 3600_000);
    await db().insert(events).values({ id, title: "Picnic", startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), venueName: "Park", district: "khlong_toei", capacity: 8, status: "published", createdBy: host.id, hostAccountId: host.id });
    await db().insert(registrations).values({ id: newId(), eventId: id, accountId: guest.id, status: "confirmed", passToken: randomToken(16) });
    const page = await (await req(`/events/${id}`, { cookie: en(guest) })).text();
    expect(page).toContain("Join this regular table");
    expect(page).toContain(`/tables/${table.id}/join`);
    // No invite token needed: the hangout is the invitation.
    expect((await req(`/tables/${table.id}/join`, { cookie: guest.cookie, method: "POST", form: {} })).status).toBe(302);
    expect(await isMember(table, guest)).toBe(true);
    expect(await (await req(`/events/${id}`, { cookie: en(guest) })).text()).toContain("Go to the regular table");
    // Someone who wasn't there can't join that way.
    await req(`/tables/${table.id}/join`, { cookie: notThere.cookie, method: "POST", form: {} });
    expect(await isMember(table, notThere)).toBe(false);
  });

  it("a blocked pair never sits at the same table, and the table hides from someone blocked with the host", async () => {
    const { host, table } = await hostWithTable();
    const [member, blockedByHost, blockedByMember] = await Promise.all([createMember(), createMember(), createMember()]);
    await join(table, member);
    await db().insert(blocks).values([
      { id: newId(), blocker: host.id, blocked: blockedByHost.id },
      { id: newId(), blocker: member.id, blocked: blockedByMember.id },
    ]);
    // Blocked with the host: the table is hidden and can't be joined.
    expect((await req(`/tables/${table.id}?t=${table.joinToken}`, { cookie: blockedByHost.cookie })).status).toBe(404);
    await join(table, blockedByHost);
    expect(await isMember(table, blockedByHost)).toBe(false);
    // Blocked with a member: can't join even with the link.
    const html = await (await req(`/tables/${table.id}?t=${table.joinToken}`, { cookie: en(blockedByMember) })).text();
    expect(html).toContain("t join this regular table.");
    expect(html).not.toContain("Join this regular table");
    await join(table, blockedByMember);
    expect(await isMember(table, blockedByMember)).toBe(false);
    // A member who blocks the host afterwards is outside the table and its chat.
    await db().insert(blocks).values({ id: newId(), blocker: member.id, blocked: host.id });
    expect((await req(`/tables/${table.id}`, { cookie: member.cookie })).status).toBe(404);
    expect((await req(`/chat/table:${table.id}`, { cookie: member.cookie })).status).toBe(404);
    expect(await (await req("/tables", { cookie: en(member) })).text()).not.toContain("Sunday Park Walkers");
  });

  it("women-only tables: only a woman or non-binary host can set it, and only women and non-binary members join", async () => {
    const { host: manHost, table: manTable } = await hostWithTable({ gender: "man" });
    await req(`/tables/${manTable.id}/edit`, { cookie: manHost.cookie, form: { name: manTable.name, district: "khlong_toei", womenOnly: "1" } });
    expect((await db().select().from(regularTables).where(eq(regularTables.id, manTable.id)))[0].womenOnly).toBe(false);

    const { host, table } = await hostWithTable({ gender: "woman" });
    await req(`/tables/${table.id}/edit`, { cookie: host.cookie, form: { name: table.name, district: "khlong_toei", description: "Slow walks and good coffee", womenOnly: "1" } });
    const [saved] = await db().select().from(regularTables).where(eq(regularTables.id, table.id));
    expect(saved).toMatchObject({ womenOnly: true, description: "Slow walks and good coffee" });

    const [man, woman, unsaid] = await Promise.all([createMember(), createMember(), createMember()]);
    await db().update(profiles).set({ gender: "man" }).where(eq(profiles.accountId, man.id));
    await db().update(profiles).set({ gender: "woman" }).where(eq(profiles.accountId, woman.id));
    expect((await req(`/tables/${table.id}?t=${table.joinToken}`, { cookie: man.cookie })).status).toBe(404);
    await join(saved, man);
    expect(await isMember(table, man)).toBe(false);
    await join(saved, unsaid);
    expect(await isMember(table, unsaid)).toBe(false);
    await join(saved, woman);
    expect(await isMember(table, woman)).toBe(true);
  });

  it("a Table Host's hangout goes to the table's members, not their connections; send to my people still works", async () => {
    const { host, table } = await hostWithTable();
    const [member, connection, stranger] = await Promise.all([createMember(), createMember(), createMember()]);
    await join(table, member);
    const [a, b] = [host.id, connection.id].sort();
    await db().insert(connections).values({ id: newId(), aAccount: a, bAccount: b, level: "friend", eventId: newId() });

    // The form defaults to the table for a Table Host.
    expect(await (await req("/host/new?table=1", { cookie: en(host) })).text()).toContain('value="table" selected');
    expect((await req("/host/new", { cookie: host.cookie, form: proposal({ audience: "table" }) })).status).toBe(302);
    const [e] = await db().select().from(events).where(eq(events.hostAccountId, host.id));
    expect(e).toMatchObject({ regularTableId: table.id, visibility: "private", status: "published" });

    const notes = async (m: Member) => db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.link, `/events/${e.id}`)));
    expect(await notes(member)).toHaveLength(1);
    expect(await notes(connection)).toHaveLength(0);
    // Members open it without the private link; others can't.
    expect((await req(`/events/${e.id}`, { cookie: member.cookie })).status).toBe(200);
    expect((await req(`/events/${e.id}`, { cookie: connection.cookie })).status).toBe(404);
    expect((await req(`/events/${e.id}`, { cookie: stranger.cookie })).status).toBe(404);
    // It's on the table page, for members.
    expect(await (await req(`/tables/${table.id}`, { cookie: en(member) })).text()).toContain("Sunday picnic");
    // Sending again reaches only new members.
    const late = await createMember();
    await join(table, late);
    expect((await req(`/host/${e.id}/table`, { cookie: host.cookie, method: "POST", form: {} })).status).toBe(302);
    expect(await notes(member)).toHaveLength(1);
    expect(await notes(late)).toHaveLength(1);
    // "Send to my people" is still there for hosts who want it.
    await req(`/host/${e.id}/circle`, { cookie: host.cookie, method: "POST", form: {} });
    const sent = await db().select().from(notifications).where(and(eq(notifications.accountId, connection.id), eq(notifications.kind, "circle_hangout")));
    expect(sent).toHaveLength(1);

    // Choosing "not for the table" keeps the old private-link behaviour.
    await req("/host/new", { cookie: host.cookie, form: proposal({ audience: "none", title: "Just for friends" }) });
    const [other] = await db().select().from(events).where(and(eq(events.hostAccountId, host.id), eq(events.title, "Just for friends")));
    expect(other.regularTableId).toBeNull();
    expect((await req(`/events/${other.id}`, { cookie: member.cookie })).status).toBe(404);
  });

  it("the table chat is for the host and current members only, with polls", async () => {
    const { host, table } = await hostWithTable();
    const [member, outsider, staff] = await Promise.all([createMember(), createMember(), createMember({ role: "bma_admin" })]);
    await join(table, member);
    const key = `table:${table.id}`;
    expect((await req(`/chat/${key}`, { cookie: member.cookie, form: { body: "See you Sunday" } })).status).toBe(302);
    const hostView = await (await req(`/chat/${key}`, { cookie: en(host) })).text();
    expect(hostView).toContain("See you Sunday");
    expect((await req(`/chat/${key}/poll`, { cookie: host.cookie, form: { question: "Which park?", options: ["Lumphini", "Benjakitti"] } })).status).toBe(302);
    expect(await (await req(`/chat/${key}`, { cookie: en(member) })).text()).toContain("Which park?");
    expect(await (await req("/chat", { cookie: en(member) })).text()).toContain("Sunday Park Walkers");
    for (const who of [outsider, staff]) {
      expect((await req(`/chat/${key}`, { cookie: who.cookie })).status).toBe(404);
      expect((await req(`/chat/${key}`, { cookie: who.cookie, form: { body: "hi" } })).status).toBe(404);
    }
    expect((await req("/tables/nope", { cookie: member.cookie })).status).toBe(404);
  });
});
