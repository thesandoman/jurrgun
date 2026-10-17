/**
 * Day-of status (host) and running late / on my way (attendees), plus venue
 * notes and the nearest station. Owner-approved 10-16, migration 0020.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events, notifications, registrations } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { dayOfOpen, shownDayStatus, shownEta, DAY_OF_LEAD_HOURS } from "../src/domain/day-of";
import { stationLine, STATIONS, isStationKey } from "../src/content/stations";
import { checkVenueExtras } from "../src/domain/hosting";
import { toBangkokInput } from "../src/domain/hosting";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mkEvent(hostId: string, startsIn: number, extra: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = new Date(Date.now() + startsIn);
  await db()
    .insert(events)
    .values({ id, title: `DAY-${id.slice(0, 6)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Soi Social Club", district: "watthana", capacity: 8, status: "published", createdBy: hostId, hostAccountId: hostId, visibility: "private", privateToken: randomToken(12), ...extra });
  return id;
}
// Private, so these near-future tables never crowd other tests' events off Discover.
const reg = async (eventId: string, accountId: string, status = "confirmed") => {
  const id = newId();
  await db().insert(registrations).values({ id, eventId, accountId, status, passToken: randomToken(18) });
  return id;
};

describe("day-of window (pure)", () => {
  const startsAt = new Date("2026-10-20T12:00:00Z");
  const endsAt = new Date("2026-10-20T15:00:00Z");
  const e = { startsAt, endsAt };
  it(`opens ${DAY_OF_LEAD_HOURS} hours before the start and closes at the end`, () => {
    expect(dayOfOpen(e, new Date(startsAt.getTime() - DAY_OF_LEAD_HOURS * HOUR - 1))).toBe(false);
    expect(dayOfOpen(e, new Date(startsAt.getTime() - DAY_OF_LEAD_HOURS * HOUR))).toBe(true);
    expect(dayOfOpen(e, new Date(endsAt.getTime() - 1))).toBe(true);
    expect(dayOfOpen(e, endsAt)).toBe(false);
  });
  it("never shows a status set before the window, or once the table has ended", () => {
    const inWindow = new Date(startsAt.getTime() - HOUR);
    const base = { ...e, dayStatus: "running_late", dayStatusNote: " 10 min ", dayStatusAt: inWindow };
    expect(shownDayStatus(base, inWindow)).toEqual({ status: "running_late", note: "10 min", at: inWindow });
    expect(shownDayStatus({ ...base, dayStatusAt: new Date(startsAt.getTime() - DAY) }, inWindow)).toBeNull();
    expect(shownDayStatus(base, endsAt)).toBeNull();
    expect(shownDayStatus({ ...base, dayStatus: "party" }, inWindow)).toBeNull();
    expect(shownEta(e, { etaStatus: "on_my_way", etaAt: inWindow }, inWindow)).toBe("on_my_way");
    expect(shownEta(e, { etaStatus: "on_my_way", etaAt: new Date(startsAt.getTime() - DAY) }, inWindow)).toBeNull();
  });
});

describe("stations (pure)", () => {
  it("says the station and the walk in both languages", () => {
    expect(stationLine("bts_asok", 5, "th")).toBe("BTS อโศก เดิน 5 นาที");
    expect(stationLine("bts_asok", 5, "en")).toBe("BTS Asok, 5 min walk");
    expect(stationLine("mrt_sukhumvit", null, "en")).toBe("MRT Sukhumvit");
    expect(stationLine("arl_makkasan", 0, "en")).toBe("ARL Makkasan, right outside");
    expect(stationLine("nope", 5, "en")).toBeNull();
  });
  it("has unique keys, an interchange once per system, and no dashes", () => {
    const keys = STATIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(STATIONS.find((s) => s.key === "bts_siam")!.lines).toEqual(["bts_sukhumvit", "bts_silom"]);
    expect(STATIONS.find((s) => s.key === "mrt_tao_poon")!.lines).toEqual(["mrt_blue", "mrt_purple"]);
    expect(isStationKey("mrt_bang_wa") && isStationKey("bts_bang_wa")).toBe(true);
    for (const s of STATIONS) expect(`${s.th} ${s.en}`).not.toMatch(/[\u2013\u2014]/);
  });

  it("keeps stored keys when only the English name changed (checked against official names, 2026-10-16)", () => {
    expect(stationLine("mrt_ram_inthra_km_4", 3, "en")).toBe("MRT Ram Inthra Kor Mor 4, 3 min walk");
    expect(stationLine("mrt_ram_inthra_km_9", null, "th")).toBe("MRT รามอินทรา กม.9");
    expect(isStationKey("mrt_ram_inthra_kor_mor_4")).toBe(false);
    expect(stationLine("mrt_chaeng_watthana_pak_kret_28", null, "en")).toBe("MRT Chaeng Watthana-Pak Kret 28");
    expect(stationLine("mrt_outer_ring_road_ram_inthra", null, "en")).toBe("MRT Outer Ring Road-Ram Inthra");
  });
  it("checks the host's fields", () => {
    const keys = STATIONS.map((s) => s.key);
    expect(checkVenueExtras({ venueNotes: " ชั้น 2 ", nearestStation: "bts_asok", walkMinutes: "5" }, keys)).toEqual({
      errors: [],
      values: { venueNotes: "ชั้น 2", venueNotesEn: null, nearestStation: "bts_asok", walkMinutes: 5 },
    });
    expect(checkVenueExtras({ nearestStation: "bts_nowhere" }, keys).errors.length).toBe(1);
    expect(checkVenueExtras({ walkMinutes: "5" }, keys).errors.length).toBe(1);
    expect(checkVenueExtras({ nearestStation: "bts_asok", walkMinutes: "90" }, keys).errors.length).toBe(1);
    expect(checkVenueExtras({}, keys).values).toEqual({ venueNotes: null, venueNotesEn: null, nearestStation: null, walkMinutes: null });
  });
});

describe.skipIf(!HAS_DB)("day-of status", () => {
  it("the host can set it only inside the window", async () => {
    const host = await createMember({ role: "host" });
    const id = await mkEvent(host.id, DAY);
    const early = await req(`/admin/events/${id}/day-status`, { cookie: host.cookie, form: { status: "running_late" } });
    expect(early.status).toBe(409);
    const [row] = await db().select().from(events).where(eq(events.id, id));
    expect(row.dayStatus).toBeNull();
    // The host tools say when it opens instead of showing the form.
    const ops = await (await req(`/admin/events/${id}`, { cookie: `${host.cookie}; lang=en` })).text();
    expect(ops).toContain("You can set a day-of status from");
  });

  it("people going see one line on the event page, the pass and the hangout chat; others don't", async () => {
    const host = await createMember({ role: "host" });
    const [going, other] = await Promise.all([createMember(), createMember()]);
    const id = await mkEvent(host.id, 2 * HOUR, { visibility: "private", privateToken: randomToken(12) });
    await reg(id, going.id);
    const set = await req(`/admin/events/${id}/day-status`, { cookie: host.cookie, form: { status: "moved", note: "Upstairs, 3rd floor" } });
    expect(set.status).toBe(302);
    const [row] = await db().select().from(events).where(eq(events.id, id));
    expect(row.dayStatus).toBe("moved");
    expect(row.dayStatusNote).toBe("Upstairs, 3rd floor");

    const page = await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=en` })).text();
    // Once for phones (at the top) and once for the laptop rail.
    expect(page).toContain('class="day-status ds-moved ev-phone"');
    expect(page).toContain('class="day-status ds-moved ev-lap"');
    expect(page).toContain("The meeting point has moved");
    expect(page).toContain("Upstairs, 3rd floor");
    const th = await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=th` })).text();
    expect(th).toContain("ย้ายจุดนัดพบ");
    const pass = await (await req(`/me/events/${id}/pass`, { cookie: `${going.cookie}; lang=en` })).text();
    expect(pass).toContain("The meeting point has moved");
    const chat = await (await req(`/chat/circle:${id}`, { cookie: `${going.cookie}; lang=en` })).text();
    expect(chat).toContain("The meeting point has moved");
    // Someone not going doesn't get the line.
    const theirs = await (await req(`/events/${id}?t=${row.privateToken}`, { cookie: `${other.cookie}; lang=en` })).text();
    expect(theirs).not.toContain("day-status ds-");
    // Going members heard about it; the note travels with it, never the event title.
    const notes = await db().select().from(notifications).where(and(eq(notifications.accountId, going.id), eq(notifications.kind, "event_notice")));
    expect(notes.map((n) => n.titleEn)).toEqual(["Host update: The meeting point has moved. Upstairs, 3rd floor"]);
    expect(notes[0].titleTh).not.toContain(row.title);
  });

  it("a move needs a note, and on time stays quiet", async () => {
    const host = await createMember({ role: "host" });
    const going = await createMember();
    const id = await mkEvent(host.id, HOUR);
    await reg(id, going.id);
    expect((await req(`/admin/events/${id}/day-status`, { cookie: host.cookie, form: { status: "moved" } })).status).toBe(400);
    expect((await req(`/admin/events/${id}/day-status`, { cookie: host.cookie, form: { status: "on_time" } })).status).toBe(302);
    const notes = await db().select().from(notifications).where(eq(notifications.accountId, going.id));
    expect(notes).toEqual([]);
    expect(await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=en` })).text()).toContain("On time. See you as planned");
    // Clearing removes the line.
    expect((await req(`/admin/events/${id}/day-status`, { cookie: host.cookie, form: { clear: "1" } })).status).toBe(302);
    expect(await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=en` })).text()).not.toContain("day-status ds-");
  });

  it("only the event's own host can set it", async () => {
    const host = await createMember({ role: "host" });
    const otherHost = await createMember({ role: "host" });
    const id = await mkEvent(host.id, HOUR);
    const res = await req(`/admin/events/${id}/day-status`, { cookie: otherHost.cookie, form: { status: "cancelled" } });
    expect(res.status).toBe(404);
    const [row] = await db().select().from(events).where(eq(events.id, id));
    expect(row.dayStatus).toBeNull();
  });

  it("a status left over from before the window is not shown on the day", async () => {
    const host = await createMember({ role: "host" });
    const going = await createMember();
    const id = await mkEvent(host.id, HOUR, { dayStatus: "cancelled", dayStatusAt: new Date(Date.now() - 2 * DAY) });
    await reg(id, going.id);
    expect(await (await req(`/events/${id}`, { cookie: `${going.cookie}; lang=en` })).text()).not.toContain("Called off for today");
  });
});

describe.skipIf(!HAS_DB)("running late / on my way", () => {
  it("a confirmed attendee tells the host on the day; the host sees names, other attendees don't", async () => {
    const host = await createMember({ role: "host" });
    const [late, onWay, quiet] = await Promise.all([createMember({ nickname: "Ploy K" }), createMember({ nickname: "Ken" }), createMember({ nickname: "Quiet" })]);
    const id = await mkEvent(host.id, HOUR);
    for (const m of [late, onWay, quiet]) await reg(id, m.id);
    const page = await (await req(`/events/${id}`, { cookie: `${late.cookie}; lang=en` })).text();
    expect(page).toContain(`action="/events/${id}/eta"`);
    expect((await req(`/events/${id}/eta`, { cookie: late.cookie, form: { eta: "running_late" } })).status).toBe(302);
    expect((await req(`/events/${id}/eta`, { cookie: onWay.cookie, form: { eta: "on_my_way", next: `/me/events/${id}/pass` } })).headers.get("location")).toBe(`/me/events/${id}/pass`);
    // A forged value changes nothing.
    await req(`/events/${id}/eta`, { cookie: quiet.cookie, form: { eta: "teleporting" } });

    const ops = await (await req(`/admin/events/${id}`, { cookie: `${host.cookie}; lang=en` })).text();
    expect(ops).toContain("Running late (1)</b>: Ploy");
    expect(ops).toContain("On the way (1)</b>: Ken");
    const sum = ops.slice(ops.indexOf('<ul class="eta-sum">'), ops.indexOf("</ul>", ops.indexOf('<ul class="eta-sum">')));
    expect(sum).not.toContain("Quiet");
    const hostPage = await (await req(`/events/${id}`, { cookie: `${host.cookie}; lang=en` })).text();
    expect(hostPage).toContain("Running late (1)</b>: Ploy");
    // Attendees only see their own state.
    const mine = await (await req(`/events/${id}`, { cookie: `${late.cookie}; lang=en` })).text();
    expect(mine).toContain("Your host knows you&#39;re running a little late.");
    const theirs = await (await req(`/events/${id}`, { cookie: `${quiet.cookie}; lang=en` })).text();
    expect(theirs).not.toContain("Ploy");
    expect(theirs).not.toContain("Running late (");
    // Undo.
    await req(`/events/${id}/eta`, { cookie: late.cookie, form: { eta: "clear" } });
    const [r] = await db().select().from(registrations).where(and(eq(registrations.eventId, id), eq(registrations.accountId, late.id)));
    expect(r.etaStatus).toBeNull();
  });

  it("only on the day, and only with a confirmed seat", async () => {
    const host = await createMember({ role: "host" });
    const [m, waiting] = await Promise.all([createMember(), createMember()]);
    const tomorrow = await mkEvent(host.id, DAY);
    await reg(tomorrow, m.id);
    const early = await req(`/events/${tomorrow}/eta`, { cookie: m.cookie, form: { eta: "on_my_way" } });
    expect(early.status).toBe(403);
    expect(await (await req(`/events/${tomorrow}`, { cookie: m.cookie })).text()).not.toContain(`/events/${tomorrow}/eta`);
    const today = await mkEvent(host.id, HOUR);
    await reg(today, waiting.id, "waitlisted");
    expect((await req(`/events/${today}/eta`, { cookie: waiting.cookie, form: { eta: "on_my_way" } })).status).toBe(404);
    const rows = await db().select().from(registrations).where(eq(registrations.accountId, waiting.id));
    expect(rows[0].etaStatus).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("running late tells the host", () => {
  const hostNotes = (hostId: string) => db().select().from(notifications).where(and(eq(notifications.accountId, hostId), eq(notifications.kind, "eta_late")));

  it("one quiet notification with the first name, to the host only, never the event title", async () => {
    const host = await createMember({ role: "host" });
    const [late, other] = await Promise.all([createMember({ nickname: "Ploy K" }), createMember({ nickname: "Other" })]);
    const id = await mkEvent(host.id, HOUR);
    await reg(id, late.id);
    await reg(id, other.id);
    expect((await req(`/events/${id}/eta`, { cookie: late.cookie, form: { eta: "running_late" } })).status).toBe(302);
    const notes = await hostNotes(host.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].titleTh).toBe("Ploy จะไปสายนิดหน่อย");
    expect(notes[0].titleEn).toBe("Ploy is running a little late");
    expect(notes[0].link).toBe(`/admin/events/${id}#day-of`);
    const [ev] = await db().select().from(events).where(eq(events.id, id));
    for (const text of [notes[0].titleTh, notes[0].titleEn]) {
      expect(text).not.toContain(ev.title);
      expect(text).not.toContain("K");
    }
    // Nobody but the host hears about it.
    for (const m of [late, other]) {
      expect(await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, "eta_late")))).toEqual([]);
    }
  });

  it("on my way sends nothing", async () => {
    const host = await createMember({ role: "host" });
    const m = await createMember({ nickname: "Ken" });
    const id = await mkEvent(host.id, HOUR);
    await reg(id, m.id);
    expect((await req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "on_my_way" } })).status).toBe(302);
    expect(await hostNotes(host.id)).toEqual([]);
    expect(await db().select().from(notifications).where(eq(notifications.accountId, host.id))).toEqual([]);
  });

  it("an undo and a second tap, or two taps at once, never send it twice", async () => {
    const host = await createMember({ role: "host" });
    const m = await createMember({ nickname: "Mai" });
    const id = await mkEvent(host.id, HOUR);
    await reg(id, m.id);
    await req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "running_late" } });
    await req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "running_late" } });
    await req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "clear" } });
    await req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "on_my_way" } });
    await Promise.all([1, 2].map(() => req(`/events/${id}/eta`, { cookie: m.cookie, form: { eta: "running_late" } })));
    expect(await hostNotes(host.id)).toHaveLength(1);
    // A second attendee running late is a second notification.
    const m2 = await createMember({ nickname: "Nok" });
    await reg(id, m2.id);
    await req(`/events/${id}/eta`, { cookie: m2.cookie, form: { eta: "running_late" } });
    expect((await hostNotes(host.id)).map((n) => n.titleEn).sort()).toEqual(["Mai is running a little late", "Nok is running a little late"]);
  });

  it("outside the day, or without a confirmed seat, nothing is sent", async () => {
    const host = await createMember({ role: "host" });
    const [m, waiting] = await Promise.all([createMember(), createMember()]);
    const tomorrow = await mkEvent(host.id, DAY);
    await reg(tomorrow, m.id);
    await req(`/events/${tomorrow}/eta`, { cookie: m.cookie, form: { eta: "running_late" } });
    const today = await mkEvent(host.id, HOUR);
    await reg(today, waiting.id, "waitlisted");
    await req(`/events/${today}/eta`, { cookie: waiting.cookie, form: { eta: "running_late" } });
    expect(await hostNotes(host.id)).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("venue notes and nearest station", () => {
  it("a host adds them on the form; the event page and the pass show them", async () => {
    const host = await createMember({ role: "host" });
    // A daytime slot 3 days out (14:00 Bangkok), so a run late in the evening doesn't make a late-night event that goes to review.
    const start = new Date(Date.now() + 3 * DAY);
    start.setUTCHours(7, 0, 0, 0);
    const form = {
      title: "Board games at Soi Social Club",
      titleEn: "",
      description: "A relaxed evening of board games for new friends in Bangkok.",
      startsAt: toBangkokInput(start),
      endsAt: toBangkokInput(new Date(start.getTime() + 2 * HOUR)),
      venueName: "Soi Social Club",
      venueAddress: "Sukhumvit 21",
      mapUrl: "",
      district: "watthana",
      capacity: "8",
      ageMin: "18",
      ageMax: "99",
      languages: "th",
      costThb: "0",
      intensity: "social",
      groupMin: "4",
      groupMax: "6",
      visibility: "private",
      accessibility: "",
      safetyInfo: "",
      venueNotes: "ชั้น 2 โต๊ะยาวข้างหน้าต่าง",
      venueNotesEn: "2nd floor, the long table by the window",
      nearestStation: "bts_asok",
      walkMinutes: "5",
    };
    const bad = await req("/host/new", { cookie: host.cookie, form: { ...form, nearestStation: "bts_atlantis" } });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("เลือกสถานีจากรายการ");
    const ok = await req("/host/new", { cookie: host.cookie, form });
    expect(ok.status).toBe(302);
    const [e] = await db().select().from(events).where(and(eq(events.createdBy, host.id), eq(events.title, form.title)));
    expect([e.nearestStation, e.walkMinutes, e.venueNotes, e.venueNotesEn]).toEqual(["bts_asok", 5, form.venueNotes, form.venueNotesEn]);

    const member = await createMember();
    const th = await (await req(`/events/${e.id}?t=${e.privateToken}`, { cookie: `${member.cookie}; lang=th` })).text();
    expect(th).toContain("BTS อโศก เดิน 5 นาที");
    expect(th).toContain("ชั้น 2 โต๊ะยาวข้างหน้าต่าง");
    expect(th).toContain('class="fact-ico"');
    const en = await (await req(`/events/${e.id}?t=${e.privateToken}`, { cookie: `${member.cookie}; lang=en` })).text();
    expect(en).toContain("BTS Asok, 5 min walk");
    expect(en).toContain("2nd floor, the long table by the window");

    await reg(e.id, member.id);
    const pass = await (await req(`/me/events/${e.id}/pass`, { cookie: `${member.cookie}; lang=en` })).text();
    const card = pass.slice(pass.indexOf('class="card essentials"'));
    expect(card).toContain("Finding the table");
    expect(card).toContain("BTS Asok, 5 min walk");
  });

  it("the host's edit form keeps them", async () => {
    const host = await createMember({ role: "circle_head" });
    const id = await mkEvent(host.id, 3 * DAY, { status: "pending", nearestStation: "mrt_sukhumvit", walkMinutes: 3, venueNotes: "ชั้นล่าง" });
    const html = await (await req(`/host/${id}/edit`, { cookie: `${host.cookie}; lang=en` })).text();
    expect(html).toContain('<option value="mrt_sukhumvit" selected="">');
    expect(html).toContain('name="walkMinutes" type="number" value="3"');
    expect(html).toContain("ชั้นล่าง");
  });
});
