/**
 * Long staff lists (D40): the moderation queue pages and searches on the
 * server, and event tools reach every registration past 2,000.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { accounts, events, notifications, registrations, reports, strikes } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { chunks } from "../src/lib/bulk";

const HOUR = 3_600_000;
const BIG = 2050;

describe.skipIf(!HAS_DB)("moderation queue paging and search", () => {
  const tag = randomToken(5).replace(/[^A-Za-z0-9]/g, "x");
  let reporter: Member | undefined;

  afterAll(async () => {
    if (reporter) await db().delete(reports).where(eq(reports.reporter, reporter.id));
  });

  it("pages past 50 and finds a report that isn't on page 1", async () => {
    const mod = await createMember({ role: "moderator" });
    reporter = await createMember({ nickname: `Rep${tag}` });
    const target = await createMember({ nickname: `Tgt${tag}` });
    const needleTarget = await createMember({ nickname: `Needle${tag}` });
    // 54 old standard reports, then the needle: oldest first puts it after at least 54 others.
    const base = Date.UTC(2001, 0, 1);
    const rows = Array.from({ length: 55 }, (_, i) => ({
      id: newId(),
      reporter: reporter!.id,
      targetAccount: i === 54 ? needleTarget.id : target.id,
      reason: "spam_scam",
      details: "paging test",
      createdAt: new Date(base + i * 60_000),
    }));
    await db().insert(reports).values(rows);
    const needle = rows[54].id;
    const cookie = `${mod.cookie}; lang=en`;

    const p1 = await (await req("/admin/moderation?status=open", { cookie })).text();
    expect(p1).toMatch(/Showing 1–50 of [\d,]+/);
    expect(p1).toMatch(/rel="next"/);
    expect(p1).toContain("page=2");
    expect(p1).not.toContain(needle);
    expect(p1).toContain('name="q"');
    expect(p1).toContain('<input type="hidden" name="status" value="open"');
    expect(p1).not.toContain('data-filter="admin-reports"');

    const p2 = await (await req("/admin/moderation?status=open&page=2", { cookie })).text();
    expect(p2).toMatch(/Showing 51–/);
    expect(p2).toMatch(/rel="prev"/);

    // Server search reaches the needle wherever it sits in the queue.
    const found = await (await req(`/admin/moderation?status=open&q=needle${tag}`, { cookie })).text();
    expect(found).toContain(`/admin/moderation/${needle}`);
    expect(found).toContain("Showing 1–1 of 1");

    // Searching by reporter: 55 results over two pages, the search kept in the links.
    const byReporter = await (await req(`/admin/moderation?status=open&q=Rep${tag}`, { cookie })).text();
    expect(byReporter).toContain("Showing 1–50 of 55");
    expect(byReporter).toContain(`q=Rep${tag}&amp;page=2`);
    const byReporter2 = await (await req(`/admin/moderation?status=open&q=Rep${tag}&page=2`, { cookie })).text();
    expect(byReporter2).toContain("Showing 51–55 of 55");
    expect(byReporter2).toContain(needle);

    // The reason's label matches too, and LIKE wildcards are literal.
    const byLabel = await (await req(`/admin/moderation?status=open&q=${encodeURIComponent("Spam / scam")}`, { cookie })).text();
    expect(Number(byLabel.match(/Showing 1–50 of ([\d,]+)/)?.[1].replace(/,/g, ""))).toBeGreaterThanOrEqual(55);
    const wild = await (await req(`/admin/moderation?status=open&q=${encodeURIComponent(`Rep${tag}%`)}`, { cookie })).text();
    expect(wild).toContain("No reports with this status match your search");

    // Another status is searched separately.
    const other = await (await req(`/admin/moderation?status=dismissed&q=Rep${tag}`, { cookie })).text();
    expect(other).not.toContain(needle);
  });
});

describe.skipIf(!HAS_DB)("events with more than 2,000 registrations", () => {
  const ids: string[] = Array.from({ length: BIG }, () => newId());
  const eventIds: string[] = [];

  /** BIG bare accounts (no profile), inserted in bulk. */
  async function seedAccounts() {
    const salt = randomToken(4).replace(/[^a-z0-9]/gi, "x");
    for (const part of chunks(ids.map((id, i) => ({ id, i })), 1000)) {
      await db()
        .insert(accounts)
        .values(part.map(({ id, i }) => ({ id, username: `t_bulk_${salt}_${i}`, passwordHash: "x", passwordSalt: "x" })));
    }
  }

  async function mkEvent(createdBy: string, over: Partial<typeof events.$inferInsert> = {}) {
    const id = newId();
    eventIds.push(id);
    const startsAt = over.startsAt ?? new Date(Date.now() + 24 * HOUR);
    await db()
      .insert(events)
      .values({ id, title: "งานใหญ่", titleEn: "Big event", startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Hall", district: "bang_rak", capacity: 3000, status: "published", createdBy, ...over });
    for (const part of chunks(ids, 1000)) {
      await db()
        .insert(registrations)
        .values(part.map((accountId) => ({ id: newId(), eventId: id, accountId, status: "confirmed", passToken: randomToken() })));
    }
    return id;
  }

  const notesFor = async (kind: string, link: string) => {
    let n = 0;
    for (const part of chunks(ids, 1000)) {
      const [row] = await db()
        .select({ n: count() })
        .from(notifications)
        .where(and(inArray(notifications.accountId, part), eq(notifications.kind, kind), eq(notifications.link, link)));
      n += Number(row.n);
    }
    return n;
  };

  beforeAll(async () => {
    if (HAS_DB) await seedAccounts();
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    for (const part of chunks(ids, 1000)) {
      await db().delete(notifications).where(inArray(notifications.accountId, part));
      await db().delete(accounts).where(inArray(accounts.id, part));
    }
    if (eventIds.length) {
      await db().delete(strikes).where(inArray(strikes.eventId, eventIds));
      await db().delete(registrations).where(inArray(registrations.eventId, eventIds));
      await db().delete(events).where(inArray(events.id, eventIds));
    }
  });

  it("shows the real totals, pages the attendee table, and a notice and a cancellation reach everyone", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const id = await mkEvent(admin.id);
    const cookie = `${admin.cookie}; lang=en`;

    const p1 = await (await req(`/admin/events/${id}`, { cookie })).text();
    expect(p1).toContain(`${BIG} / 3000`);
    expect(p1).toContain(`Showing 1–200 of ${BIG.toLocaleString("en-US")}`);
    expect(p1).toContain(`href="/admin/events/${id}?ap=2#attendees" rel="next"`);
    expect(p1.match(/<tr>/g)?.length).toBe(201); // heading row + 200

    const last = await (await req(`/admin/events/${id}?ap=11`, { cookie })).text();
    expect(last).toContain(`Showing 2,001–2,050 of 2,050`);
    expect(last).toContain('rel="prev"');
    expect(last).not.toContain('rel="next"');
    // Past the end: back to the last page.
    const past = await req(`/admin/events/${id}?ap=99`, { cookie });
    expect(past.status).toBe(302);
    expect(past.headers.get("location")).toBe(`/admin/events/${id}?ap=11#attendees`);

    const sent = await req(`/admin/events/${id}/notice`, { cookie, form: { th: "ประกาศทดสอบ", en: "Test notice" } });
    expect(sent.status).toBe(302);
    expect(await notesFor("event_notice", `/events/${id}`)).toBe(BIG);

    const cancelled = await req(`/admin/events/${id}/cancel`, { cookie, method: "POST", form: {} });
    expect(cancelled.status).toBe(302);
    expect(await notesFor("event_cancelled", `/events/${id}`)).toBe(BIG);
  });

  it("records a no-show strike for every one of them, and says how many first", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const id = await mkEvent(admin.id, { startsAt: new Date(Date.now() - 5 * HOUR) });
    const cookie = `${admin.cookie}; lang=en`;

    const html = await (await req(`/admin/events/${id}`, { cookie })).text();
    expect(html).toContain(`Record ${BIG} people as no-shows?`);

    const r = await req(`/admin/events/${id}/noshows`, { cookie, method: "POST", form: {} });
    expect(r.status).toBe(302);
    const [row] = await db().select({ n: count() }).from(strikes).where(eq(strikes.eventId, id));
    expect(Number(row.n)).toBe(BIG);
    expect(await notesFor("strike", "/me/events")).toBe(BIG);
    const after = await (await req(`/admin/events/${id}`, { cookie })).text();
    expect(after).toContain("Record 0 people as no-shows?");
  });
});
