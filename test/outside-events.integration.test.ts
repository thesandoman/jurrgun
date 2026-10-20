/**
 * Owner decisions D45 to D50: outside events as go-together tables, the host
 * inbox (pasted links and daily feeds), verified partners with Jurrgun-issued
 * keys, calendars out, and the online warm-up link.
 */
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, ENV, req } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import app from "../src/index";
import { accounts, auditLog, calendarTokens, eventFeeds, eventInbox, events, partnerApplications, partnerKeys, registrations } from "../src/schema";
import { setOutsideFetch } from "../src/services/outside-fetch";
import { readDueFeeds, readFeed } from "../src/services/outside-events";

afterEach(() => setOutsideFetch(null));

const bkk = (daysAhead: number, hour: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000 + 7 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
};
const isoIn = (days: number, hour: number) => new Date(`${bkk(days, hour)}:00+07:00`).toISOString();
const icalStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A fake web: robots.txt allows everything, pages and feeds as given. Counts every request. */
function fakeWeb(pages: Record<string, { body: string; type?: string; status?: number }>) {
  const seen: string[] = [];
  setOutsideFetch(async (r) => {
    seen.push(r.url);
    if (r.url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
    const p = pages[r.url];
    if (!p) return new Response("nope", { status: 404 });
    return new Response(p.body, { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/html; charset=utf-8" } });
  });
  return seen;
}

const goForm = (inbox: string, over: Record<string, string | string[]> = {}) => ({
  inbox,
  goTogether: "1",
  title: "Jazz by the river, together",
  description: "We meet for a drink first, then go in together. First-timers very welcome.",
  startsAt: bkk(6, 18),
  endsAt: bkk(6, 22),
  venueName: "Café near the hall",
  venueAddress: "12 Charoen Krung Road, Bang Rak",
  district: "bang_rak",
  capacity: "8",
  ageMin: "18",
  ageMax: "99",
  languages: ["th", "en"],
  costThb: "0",
  intensity: "social",
  groupMin: "4",
  groupMax: "6",
  visibility: "public",
  sourceUrl: "https://riverhall.example.org/jazz",
  ...over,
});

describe.skipIf(!HAS_DB)("D45/D46: pasted links into the host inbox, then a go-together table", () => {
  it("reads the page's own event description, prefills the form, and the event keeps its source", async () => {
    const host = await createMember({ role: "circle_head" });
    const url = `https://riverhall.example.org/jazz-${randomToken(4)}`;
    const startIso = isoIn(6, 19);
    fakeWeb({
      [url]: {
        body: `<script type="application/ld+json">${JSON.stringify({ "@type": "MusicEvent", name: "River Jazz Night", description: "Live jazz by the river.", startDate: startIso, location: { name: "River Hall", address: "1 Charoen Krung" }, organizer: { name: "River Hall" } })}</script>`,
      },
    });
    const r = await req("/host/import", { cookie: host.cookie, form: { url } });
    const loc = r.headers.get("location") ?? "";
    expect(loc).toMatch(/^\/host\/new\?inbox=.+&read=1$/);
    const inboxId = new URL(loc, "https://x").searchParams.get("inbox")!;
    const [item] = await db().select().from(eventInbox).where(eq(eventInbox.id, inboxId));
    expect(item).toMatchObject({ title: "River Jazz Night", sourceName: "riverhall.example.org", venueName: "River Hall", credit: "River Hall", status: "new" });

    // Nothing waiting in the inbox reaches Discover.
    const other = await createMember();
    expect(await (await req("/events?view=list", { cookie: other.cookie })).text()).not.toContain("River Jazz Night");

    const form = await (await req(loc, { cookie: host.cookie })).text();
    expect(form).toContain("River Jazz Night");
    expect(form).toContain('name="goTogether"');
    expect(form).toContain(url);

    // A go-together table needs a public meeting point with an address.
    const bad = await req("/host/new", { cookie: host.cookie, form: goForm(inboxId, { venueAddress: "" }) });
    expect(bad.status).toBe(400);

    const ok = await req("/host/new", { cookie: host.cookie, form: goForm(inboxId) });
    expect(ok.headers.get("location")).toBe("/host?notice=submitted");
    const [e] = await db().select().from(events).where(eq(events.inboxId, inboxId));
    expect(e).toMatchObject({ sourceName: "riverhall.example.org", sourceUrl: "https://riverhall.example.org/jazz", sourceCredit: "River Hall", sourceVenue: "River Hall", status: "pending" });
    expect(e.sourceStartsAt?.toISOString()).toBe(startIso);
    const [after] = await db().select().from(eventInbox).where(eq(eventInbox.id, inboxId));
    expect(after).toMatchObject({ status: "attached", attachedEventId: e.id });

    // Pasting the same link again reuses the item and reads nothing.
    const again = await req("/host/import", { cookie: host.cookie, form: { url } });
    expect(again.headers.get("location")).toContain(`inbox=${inboxId}`);
  });

  it("never reads a platform whose terms we couldn't confirm; keeps the link and credit only", async () => {
    const host = await createMember({ role: "circle_head" });
    const seen = fakeWeb({});
    const url = `https://www.ticketmelon.com/riverhall/jazz-${randomToken(4)}`;
    const r = await req("/host/import", { cookie: host.cookie, form: { url } });
    expect(r.headers.get("location")).toMatch(/read=0$/);
    expect(seen).toEqual([]);
    const [item] = await db().select().from(eventInbox).where(eq(eventInbox.sourceUrl, url));
    expect(item.sourceName).toBe("Ticketmelon");
  });

  it("refuses internal and non-https links", async () => {
    const host = await createMember({ role: "circle_head" });
    const seen = fakeWeb({});
    for (const url of ["http://example.com/e", "https://127.0.0.1/admin", "https://localhost/x", "https://jurrgun.apps.sv-academy.org/admin"]) {
      expect((await req("/host/import", { cookie: host.cookie, form: { url } })).headers.get("location")).toBe("/host?notice=bad_link");
    }
    expect(seen).toEqual([]);
  });

  it("members who can't host can't paste or see the inbox", async () => {
    const m = await createMember();
    expect((await req("/host/inbox", { cookie: m.cookie })).status).toBe(302);
    expect((await req("/host/import", { cookie: m.cookie, form: { url: "https://example.com/e" } })).status).toBe(302);
  });
});

describe.skipIf(!HAS_DB)("D46: calendar feeds, read daily into the inbox", () => {
  const feedText = (uid: string, title: string, iso: string) =>
    ["BEGIN:VCALENDAR", "BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${title}`, `DTSTART:${icalStamp(iso)}`, "LOCATION:Lumphini Park\\, Gate 1", "URL:https://lu.ma/x", "END:VEVENT", "BEGIN:VEVENT", "UID:online-1", "SUMMARY:Webinar", `DTSTART:${icalStamp(iso)}`, "LOCATION:https://zoom.us/j/1", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

  it("admins add a feed with a terms note; the read is de-duplicated, updates waiting items, and skips online-only", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const url = `https://api.lu.ma/ics/get?entity=calendar&id=${randomToken(6)}`;
    expect((await req("/admin/feeds", { cookie: admin.cookie, form: { url, sourceName: "Luma", termsNote: "" } })).status).toBe(400);
    expect((await req("/admin/feeds", { cookie: admin.cookie, form: { url, sourceName: "Luma", termsNote: "Luma publishes iCal for public calendars; checked 2026-10-20" } })).headers.get("location")).toBe(
      "/admin/feeds?notice=saved",
    );
    const [feed] = await db().select().from(eventFeeds).where(eq(eventFeeds.url, url));
    const uid = `${randomToken(6)}@luma`;
    fakeWeb({ [url]: { body: feedText(uid, "Board games in the park", isoIn(4, 17)), type: "text/calendar" } });
    expect(await readFeed(ENV, feed)).toEqual({ result: "ok", count: 1 });
    fakeWeb({ [url]: { body: feedText(uid, "Board games in the park (new time)", isoIn(5, 17)), type: "text/calendar" } });
    await readFeed(ENV, feed);
    const items = await db().select().from(eventInbox).where(eq(eventInbox.feedId, feed.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Board games in the park (new time)", sourceName: "Luma", venueName: "Lumphini Park", status: "new" });
    const [read] = await db().select().from(eventFeeds).where(eq(eventFeeds.id, feed.id));
    expect(read).toMatchObject({ lastResult: "ok", lastCount: 1 });
    // Read again only after a day.
    const before = (await db().select().from(eventFeeds).where(eq(eventFeeds.id, feed.id)))[0].lastReadAt;
    await readDueFeeds(ENV);
    expect((await db().select().from(eventFeeds).where(eq(eventFeeds.id, feed.id)))[0].lastReadAt?.getTime()).toBe(before?.getTime());
  });

  it("only BMA admins manage feeds", async () => {
    const mod = await createMember({ role: "moderator" });
    expect((await req("/admin/feeds", { cookie: mod.cookie })).status).toBe(403);
  });
});

describe.skipIf(!HAS_DB)("D47: partners apply, get verified, post with their own key", () => {
  async function verifiedPartner(kind: "events" | "dating" = "events") {
    const [applicant, mod] = await Promise.all([createMember(), createMember({ role: "moderator" })]);
    const orgName = `Soi Social ${randomToken(4)}`;
    expect((await req("/partner/apply", { cookie: applicant.cookie, form: { orgName, kind, contact: "hello@soi.example", about: "Live music nights" } })).headers.get("location")).toBe("/partner/apply?notice=done");
    const [app] = await db().select().from(partnerApplications).where(eq(partnerApplications.accountId, applicant.id));
    expect(await (await req("/admin/partner-review", { cookie: mod.cookie })).text()).toContain(orgName);
    await req(`/admin/partner-review/${app.id}/approve`, { cookie: mod.cookie, method: "POST" });
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, applicant.id));
    expect(acct.role).toBe("partner_admin");
    const page = await req("/partner/keys", { cookie: applicant.cookie, method: "POST", form: { label: "ticketing" } });
    const key = /value="(jgk_[A-Za-z0-9_-]+)"/.exec(await page.text())?.[1];
    expect(key).toBeTruthy();
    // Only the hash is kept.
    const [k] = await db().select().from(partnerKeys).where(eq(partnerKeys.partnerOrgId, acct.partnerOrgId!));
    expect(k.keyHash).not.toContain(key!.slice(4, 20));
    return { admin: applicant, orgId: acct.partnerOrgId!, key: key!, keyId: k.id, mod };
  }

  const body = (host: string, over: Record<string, unknown> = {}) => ({
    title: "Concert night, go together",
    description: "Meet the table at the café, then walk to the hall together.",
    starts_at: isoIn(7, 18),
    ends_at: isoIn(7, 22),
    host,
    capacity: 10,
    ticket_url: "https://www.ticketmelon.com/soi/concert",
    meeting_point: { name: "Café by the hall", address: "5 Rama IV Road", district: "bang_rak" },
    ...over,
  });
  const api = (key: string | null, method: string, payload?: unknown) =>
    app.request("/api/partner/events", { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined }, ENV);

  it("a verified partner posts live, with a named host and a public meeting point; counts only come back", async () => {
    const p = await verifiedPartner();
    const admin = (await db().select().from(accounts).where(eq(accounts.id, p.admin.id)))[0];
    expect((await api(null, "POST", body(admin.username))).status).toBe(401);
    const noHost = await api(p.key, "POST", body("someone_else"));
    expect(noHost.status).toBe(400);
    const noMeet = await api(p.key, "POST", body(admin.username, { meeting_point: { name: "Somewhere", district: "bang_rak" } }));
    expect(noMeet.status).toBe(400);
    const res = await api(p.key, "POST", body(admin.username));
    expect(res.status).toBe(201);
    const out = (await res.json()) as { id: string; status: string; referral_code: string; url: string };
    expect(out.status).toBe("published");
    const [e] = await db().select().from(events).where(eq(events.id, out.id));
    expect(e).toMatchObject({ partnerOrgId: p.orgId, hostAccountId: p.admin.id, sourceName: "Ticketmelon", sourceUrl: "https://www.ticketmelon.com/soi/concert", referralCode: out.referral_code });

    // A member books; the partner sees a count, never who.
    const m = await createMember({ nickname: "SecretNick" });
    await db().insert(registrations).values({ id: newId(), eventId: e.id, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
    const list = await api(p.key, "GET");
    const json = JSON.stringify(await list.json());
    expect(json).toContain('"booked":1');
    expect(json).not.toContain(m.id);
    expect(json).not.toContain("SecretNick");
    const area = await (await req("/partner", { cookie: p.admin.cookie })).text();
    expect(area).not.toContain("SecretNick");

    // Revoked keys stop at once.
    await req(`/partner/keys/${p.keyId}/revoke`, { cookie: p.admin.cookie, method: "POST" });
    expect((await api(p.key, "GET")).status).toBe(401);
  });

  it("a dating partner's events are always behind 💘", async () => {
    const p = await verifiedPartner("dating");
    const admin = (await db().select().from(accounts).where(eq(accounts.id, p.admin.id)))[0];
    const out = (await (await api(p.key, "POST", body(admin.username))).json()) as { id: string; status: string };
    const [e] = await db().select().from(events).where(eq(events.id, out.id));
    expect(e.tags).toContain("open_to_more");
    // 💘 events show their tag on staff pages another file checks (staff-privacy): clear it at once.
    await db().delete(events).where(eq(events.partnerOrgId, p.orgId));
  });

  it("a partner sent back to review posts pending; moderators pull events off Discover", async () => {
    const p = await verifiedPartner();
    const admin = (await db().select().from(accounts).where(eq(accounts.id, p.admin.id)))[0];
    const out = (await (await api(p.key, "POST", body(admin.username))).json()) as { id: string };
    await req(`/admin/partner-review/org/${p.orgId}/review`, { cookie: p.mod.cookie, method: "POST" });
    const later = (await (await api(p.key, "POST", body(admin.username, { title: "Second night" }))).json()) as { status: string };
    expect(later.status).toBe("pending");

    await req(`/admin/partner-review/event/${out.id}/pull`, { cookie: p.mod.cookie, method: "POST", form: { note: "Reports about this night" } });
    const [pulled] = await db().select().from(events).where(eq(events.id, out.id));
    expect(pulled).toMatchObject({ status: "pending", reviewNote: "Reports about this night" });
    const [a] = await db().select().from(auditLog).where(and(eq(auditLog.action, "event.pull"), eq(auditLog.targetId, out.id)));
    expect(a).toBeTruthy();
  });

  it("members can't open the partner area or verify applications", async () => {
    const m = await createMember();
    expect((await req("/partner", { cookie: m.cookie })).status).toBe(403);
    expect((await req("/admin/partner-review", { cookie: m.cookie })).status).toBe(403);
  });
});

describe.skipIf(!HAS_DB)("D48: calendars out", () => {
  async function eventWith(over: Partial<typeof events.$inferInsert> = {}) {
    const id = newId();
    const startsAt = new Date(Date.now() + 5 * 86_400_000);
    await db()
      .insert(events)
      .values({ id, title: `CAL-${id.slice(0, 6)}`, startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), venueName: "Kafe, Meeple; Bang Rak", district: "bang_rak", capacity: 10, status: "published", createdBy: "test", ...over });
    return id;
  }

  it("a member's private link lists their bookings and resets; 💘 events show plainly", async () => {
    const m = await createMember({ romanceOn: true });
    const booked = await eventWith();
    const love = await eventWith({ tags: ["open_to_more"], title: "Secret dating night" });
    await db()
      .insert(registrations)
      .values([booked, love].map((eventId) => ({ id: newId(), eventId, accountId: m.id, status: "confirmed", passToken: randomToken(18) })));
    expect((await req("/settings/calendar", { cookie: m.cookie, method: "POST" })).headers.get("location")).toBe("/settings/calendar");
    const [tok] = await db().select().from(calendarTokens).where(eq(calendarTokens.accountId, m.id));
    expect(await (await req("/settings/calendar", { cookie: m.cookie })).text()).toContain(`/cal/${tok.token}.ics`);
    const ics = await req(`/cal/${tok.token}.ics`);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const text = await ics.text();
    expect(text).toContain(`UID:${booked}@jurrgun`);
    expect(text).toContain("Kafe\\, Meeple\\; Bang Rak");
    expect(text).not.toContain("Secret dating night");

    await req("/settings/calendar", { cookie: m.cookie, method: "POST" });
    expect((await req(`/cal/${tok.token}.ics`)).status).toBe(404);
    await db().delete(events).where(eq(events.id, love));
  });

  it("the public feed has public events only, never 💘, private or Regular Table ones", async () => {
    const pub = await eventWith({ title: "PUBLIC board games" });
    await eventWith({ title: "PRIVATE hangout", visibility: "private" });
    await eventWith({ title: "LOVE night", tags: ["open_to_more"] });
    await eventWith({ title: "TABLE hangout", regularTableId: newId() });
    const ics = await (await req("/feeds/events.ics")).text();
    expect(ics).toContain(`UID:${pub}@jurrgun`);
    for (const hidden of ["PRIVATE hangout", "LOVE night", "TABLE hangout"]) expect(ics).not.toContain(hidden);
    const ld = (await (await req("/feeds/events.json")).json()) as { "@type": string; itemListElement: { item: { name: string; eventAttendanceMode: string } }[] };
    expect(ld["@type"]).toBe("ItemList");
    const names = ld.itemListElement.map((x) => x.item.name);
    expect(names).toContain("PUBLIC board games");
    expect(names).not.toContain("LOVE night");
    await db().delete(events).where(eq(events.title, "LOVE night"));
  });
});

describe.skipIf(!HAS_DB)("D50: the online warm-up link", () => {
  it("is optional, https only", async () => {
    const host = await createMember({ role: "circle_head" });
    const base = { ...goForm(""), goTogether: "", sourceUrl: "", venueAddress: "", inbox: "" };
    expect((await req("/host/new", { cookie: host.cookie, form: { ...base, warmupUrl: "http://zoom.example/j/1" } })).status).toBe(400);
    expect((await req("/host/new", { cookie: host.cookie, form: { ...base, title: "Warm-up test table", warmupUrl: "https://meet.example.com/abc" } })).headers.get("location")).toBe("/host?notice=submitted");
    const [e] = await db().select().from(events).where(and(eq(events.createdBy, host.id), eq(events.title, "Warm-up test table")));
    expect(e).toMatchObject({ warmupUrl: "https://meet.example.com/abc", sourceName: null });
  });
});

describe.skipIf(!HAS_DB)("owner cards 2026-10-20: go-together on Discover and the event page, warm-up, entry points", () => {
  it("Discover shows Via and the meeting point; the page has the ticket link; only confirmed seats see the online hello", async () => {
    const id = newId();
    const startsAt = new Date(Date.now() + 4 * 86_400_000);
    await db()
      .insert(events)
      .values({
        id,
        title: `GO-${id.slice(0, 6)}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 4 * 3_600_000),
        venueName: "Café by the hall",
        venueAddress: "12 Charoen Krung Road",
        district: "bang_rak",
        capacity: 8,
        status: "published",
        createdBy: "test",
        sourceName: "Ticketmelon",
        sourceUrl: "https://www.ticketmelon.com/x/jazz",
        sourceVenue: "River Hall",
        sourceStartsAt: new Date(startsAt.getTime() + 90 * 60_000),
        warmupUrl: "https://meet.example.com/hello",
      });
    const [going, looking] = await Promise.all([createMember(), createMember()]);
    await db().insert(registrations).values({ id: newId(), eventId: id, accountId: going.id, status: "confirmed", passToken: randomToken(18) });

    const list = await (await req("/events?view=list&lang=en", { cookie: looking.cookie })).text();
    expect(list).toContain("Via Ticketmelon · meet at Café by the hall");

    const page = await (await req(`/events/${id}?lang=en`, { cookie: looking.cookie })).text();
    expect(page).toContain('href="https://www.ticketmelon.com/x/jazz"');
    expect(page).toContain("Ticket on Ticketmelon ↗");
    expect(page).toContain("The show:");
    expect(page).toContain("Table free, ticket on Ticketmelon");
    expect(page).not.toContain("meet.example.com");

    const mine = await (await req(`/events/${id}?lang=en`, { cookie: going.cookie })).text();
    expect(mine).toContain('href="https://meet.example.com/hello"');
    const pass = await (await req(`/me/events/${id}/pass?lang=en`, { cookie: going.cookie })).text();
    expect(pass).toContain('href="https://meet.example.com/hello"');
  });

  it("Settings and My events link to the calendar; the landing and host page link to partner applications", async () => {
    const [m, host] = await Promise.all([createMember(), createMember({ role: "circle_head" })]);
    expect(await (await req("/settings", { cookie: m.cookie })).text()).toContain('href="/settings/calendar"');
    expect(await (await req("/me/events", { cookie: m.cookie })).text()).toContain('href="/settings/calendar"');
    expect(await (await req("/", { cookie: "jg_intro=seen" })).text()).toContain('href="/partner/apply"');
    expect(await (await req("/host", { cookie: host.cookie })).text()).toContain('href="/partner/apply"');
  });
});
