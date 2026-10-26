/**
 * Staff and partners never see who is at a 💘 event (owner cards C1 + P1,
 * src/domain/roster.ts): counts only, frozen and rounded to 5; the host works
 * by seat code; other partner admins see counts only on any partner event.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, ENV, req } from "./helpers";
import { accounts, events, partnerOrgs, registrations, reports } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { seatCode } from "../src/domain/roster";
import { frozenCounts } from "../src/services/roster";
import { partnerCounts } from "../src/routes/partner-api";
import { bkkDayStart } from "../src/domain/pulse-heard";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(createdBy: string, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 10 * 60_000);
  await db()
    .insert(events)
    .values({
      id,
      title: "ทดสอบ",
      titleEn: "Roster test",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      venueName: "Test venue",
      district: "bang_rak",
      capacity: 40,
      status: "published",
      createdBy,
      ...over,
    });
  return id;
}

async function register(eventId: string, accountId: string, over: Partial<typeof registrations.$inferInsert> = {}) {
  const id = newId();
  const passToken = over.passToken ?? randomToken();
  await db()
    .insert(registrations)
    .values({ id, eventId, accountId, status: "confirmed", passToken, ...over });
  return { id, passToken };
}

async function partnerAdmin(orgId: string) {
  const p = await createMember({ role: "partner_admin" });
  await db().update(accounts).set({ partnerOrgId: orgId }).where(eq(accounts.id, p.id));
  return p;
}

describe.skipIf(!HAS_DB)("who staff and partners see at an event", () => {
  it("a 💘 event shows staff and the partner's admins counts only, and the host seat codes", async () => {
    const orgId = newId();
    await db().insert(partnerOrgs).values({ id: orgId, name: `Dating ${randomToken(4)}`, kind: "dating" });
    const [admin, host, partner] = await Promise.all([createMember({ role: "bma_admin" }), createMember({ role: "host" }), partnerAdmin(orgId)]);
    const nick = `Fern${randomToken(5)}`;
    const guest = await createMember({ nickname: nick, relationship: "single", romanceOn: true });
    const id = await mkEvent(admin.id, { hostAccountId: host.id, partnerOrgId: orgId, tags: ["open_to_more"] });
    const { passToken } = await register(id, guest.id);

    for (const viewer of [admin, partner]) {
      const html = await (await req(`/admin/events/${id}`, { cookie: viewer.cookie })).text();
      expect(html).not.toContain(nick);
      expect(html).not.toContain(guest.username);
      expect(html).not.toContain(seatCode(passToken));
      expect(html).toMatch(/under 10|ไม่ถึง 10/);
      // The list page too.
      const list = await (await req(`/admin/events`, { cookie: viewer.cookie })).text();
      expect(list).not.toContain(nick);
      // And no roster actions.
      expect((await req(`/admin/events/${id}/checkin`, { cookie: viewer.cookie })).status).toBe(403);
      expect((await req(`/admin/events/${id}/checkin`, { cookie: viewer.cookie, form: { token: passToken } })).status).toBe(403);
    }

    const hostHtml = await (await req(`/admin/events/${id}`, { cookie: host.cookie })).text();
    expect(hostHtml).not.toContain(nick);
    expect(hostHtml).toContain(seatCode(passToken));
    expect(hostHtml).not.toContain(guest.id);

    // Check-in tells the host the seat, never the name.
    const { default: app } = await import("../src/index");
    const res = await app.request(
      `/admin/events/${id}/checkin`,
      { method: "POST", headers: { cookie: host.cookie, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: passToken, override: "1" }).toString() },
      ENV,
    );
    const body = (await res.json()) as { ok: boolean; message: string; nickname: string };
    expect(body.ok).toBe(true);
    expect(body.message).toContain(seatCode(passToken));
    expect(JSON.stringify(body)).not.toContain(nick);

    // The member's pass shows the same seat code.
    const pass = await (await req(`/me/events/${id}/pass`, { cookie: guest.cookie })).text();
    expect(pass).toContain(seatCode(passToken));
  });

  it("the 💘 host raises a safety concern about a seat without learning who it is", async () => {
    const [admin, host] = await Promise.all([createMember({ role: "bma_admin" }), createMember({ role: "host" })]);
    const guest = await createMember({ relationship: "single", romanceOn: true });
    const id = await mkEvent(admin.id, { hostAccountId: host.id, tags: ["open_to_more"] });
    const reg = await register(id, guest.id);
    const details = `Kept pushing ${randomToken(4)}`;
    expect((await req(`/admin/events/${id}/seat-concern`, { cookie: admin.cookie, form: { registrationId: reg.id, details } })).status).toBe(403);
    const r = await req(`/admin/events/${id}/seat-concern`, { cookie: host.cookie, form: { registrationId: reg.id, details } });
    expect(r.status).toBe(302);
    const [row] = await db().select().from(reports).where(and(eq(reports.reporter, host.id), eq(reports.targetAccount, guest.id))).limit(1);
    expect(row.reason).toBe("unsafe");
    expect(row.details).toContain(details);
    // The report doesn't say it was a 💘 event.
    expect(row.targetEvent).toBeNull();
  });

  it("on a partner event only the named host sees names", async () => {
    const orgId = newId();
    await db().insert(partnerOrgs).values({ id: orgId, name: `Org ${randomToken(4)}` });
    const [admin, partner] = await Promise.all([createMember({ role: "bma_admin" }), partnerAdmin(orgId)]);
    const named = await partnerAdmin(orgId);
    const nick = `Mint${randomToken(5)}`;
    const guest = await createMember({ nickname: nick });
    const id = await mkEvent(admin.id, { hostAccountId: named.id, partnerOrgId: orgId });
    await register(id, guest.id);

    expect(await (await req(`/admin/events/${id}`, { cookie: named.cookie })).text()).toContain(nick);
    for (const viewer of [partner, admin]) {
      const html = await (await req(`/admin/events/${id}`, { cookie: viewer.cookie })).text();
      expect(html).not.toContain(nick);
      expect(html).toMatch(/under 10|ไม่ถึง 10/);
    }
    // Jurrgun's own events are unchanged: bma_admin still sees names.
    const ownId = await mkEvent(admin.id, { hostAccountId: named.id });
    await register(ownId, guest.id);
    expect(await (await req(`/admin/events/${ownId}`, { cookie: admin.cookie })).text()).toContain(nick);
  });

  it("💘 counts are frozen at 00:00 Bangkok time and rounded to 5 for partners", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const id = await mkEvent(admin.id, { tags: ["open_to_more"], startsAt: new Date(Date.now() + 3 * DAY) });
    const before = new Date(bkkDayStart(new Date()).getTime() - HOUR);
    const members = await Promise.all(Array.from({ length: 13 }, () => createMember()));
    // 12 booked before midnight, one of them cancelled before midnight; one booked today.
    for (const m of members.slice(0, 12)) await register(id, m.id, { createdAt: before });
    await db()
      .update(registrations)
      .set({ status: "cancelled", cancelledAt: before })
      .where(and(eq(registrations.eventId, id), eq(registrations.accountId, members[0].id)));
    await register(id, members[12].id);

    expect((await frozenCounts(db(), [id])).get(id)?.booked).toBe(11);
    const counts = await partnerCounts(ENV as never, [{ id, talkMode: false, tags: ["open_to_more"] }]);
    expect(counts.get(id)?.booked).toBe(10);
    expect(counts.get(id)?.checked_in).toBeNull();
  });
});
