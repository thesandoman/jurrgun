/**
 * Offline next table, the pages: the pass carries the essentials the worker
 * keeps (title, time, venue and address, map link, host first name, what to
 * bring), and My events and the event page ask the worker to save only the
 * member's own confirmed, upcoming passes.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const DAY = 86_400_000;

async function mkEvent(hostId: string, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = over.startsAt ?? new Date(Date.now() + 2 * DAY);
  await db()
    .insert(events)
    .values({
      id,
      title: `OFF-${id.slice(0, 6)}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 3_600_000),
      venueName: "Kope Hya Tai",
      venueAddress: "760 Charoen Krung Rd",
      mapUrl: "https://maps.example/kope",
      district: "samphanthawong",
      capacity: 8,
      costThb: 150,
      paymentNote: "Cash at the counter",
      safetyInfo: "By the front door",
      status: "published",
      createdBy: hostId,
      hostAccountId: hostId,
      ...over,
    });
  return id;
}

const reg = (eventId: string, accountId: string, status = "confirmed") =>
  db().insert(registrations).values({ id: newId(), eventId, accountId, status, passToken: randomToken(18) });

describe.skipIf(!HAS_DB)("offline next table", () => {
  it("the pass shows the essentials, marked for the worker, with the host's first name only", async () => {
    const host = await createMember({ nickname: "Nok Chaiyo" });
    const m = await createMember();
    const id = await mkEvent(host.id);
    await reg(id, m.id);
    const html = await (await req(`/me/events/${id}/pass`, { cookie: `${m.cookie}; lang=en` })).text();
    expect(html).toContain('data-offline-saved=""');
    expect(html).toMatch(/data-ends="\d{4}-/);
    expect(html).toContain("What you need on the day");
    expect(html).toContain("Kope Hya Tai");
    expect(html).toContain("760 Charoen Krung Rd");
    expect(html).toContain('href="https://maps.example/kope"');
    expect(html).toContain("By the front door");
    expect(html).toContain("<dd>Nok</dd>");
    expect(html).not.toContain("Nok Chaiyo");
    expect(html).toContain("฿150, paid at the venue or to the host");
    expect(html).toContain("Cash at the counter");
    // The note exists but stays hidden on the live page.
    expect(html).toMatch(/<p class="offline-saved" id="offline-saved" role="status" hidden/);
    const th = await (await req(`/me/events/${id}/pass`, { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain("ข้อมูลที่ต้องใช้วันงาน");
    expect(th).toContain("บันทึกไว้ดูตอนออฟไลน์");
  });

  it("My events asks the worker to keep only confirmed, upcoming passes and drop the rest", async () => {
    const host = await createMember();
    const m = await createMember();
    const going = await mkEvent(host.id);
    const waiting = await mkEvent(host.id);
    const over = await mkEvent(host.id, { startsAt: new Date(Date.now() - 2 * DAY) });
    await reg(going, m.id);
    await reg(waiting, m.id, "waitlisted");
    await reg(over, m.id);
    const html = await (await req("/me/events", { cookie: m.cookie })).text();
    const msg = html.match(/postMessage\((\{"type":"jurrgun-save-next"[^)]*\})\)/);
    expect(msg).not.toBeNull();
    const data = JSON.parse(msg![1]) as { urls: string[]; replace: boolean };
    expect(data.replace).toBe(true);
    expect(data.urls).toEqual([`/me/events/${going}/pass`]);
  });

  it("the event page saves the pass for a confirmed member, and not for anyone else", async () => {
    const host = await createMember();
    const [m, other] = await Promise.all([createMember(), createMember()]);
    const id = await mkEvent(host.id);
    await reg(id, m.id);
    const mine = await (await req(`/events/${id}`, { cookie: m.cookie })).text();
    expect(mine).toContain(`"urls":["/me/events/${id}/pass"]`);
    const theirs = await (await req(`/events/${id}`, { cookie: other.cookie })).text();
    expect(theirs).not.toContain("jurrgun-save-next");
    // Signed-in pages never wipe the saved tables.
    expect(mine).not.toContain("jurrgun-clear-next");
  });
});
