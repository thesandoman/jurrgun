/**
 * The empty-district alert (owner card 7): the copy, the weekly job in the
 * hourly clock (src/services/clock.ts runDistrictAlerts), and the evening
 * summary line. The job sends one in-app row per member, never again within
 * 7 days, only with a yes to notifications, only for events in the member's
 * own district that went public after they opted in (or after the last
 * alert), and only events they may see. It never names the event, and a
 * duplicate task inserts the row once.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import { auditLog, blocks, consents, events, notifications, profiles } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { runDistrictAlerts } from "../src/services/clock";
import { digestText, isDigest } from "../src/domain/digest";
import {
  DISTRICT_ALERT_ON,
  KIND_DISTRICT_ALERT,
  alertCutoff,
  alertDue,
  alertLink,
  alertText,
  needsConsentText,
  optInText,
  optedInText,
  publishedAt,
} from "../src/domain/district-alert";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const th = (a: string) => a;
const en = (_: string, b: string) => b;

// A run two days from now, 10:00 to 12:00 Bangkok (outside quiet hours), so no
// other test's events or clock runs fall after these members' opt-in.
const base = new Date();
const NOW = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 2, 3, 0, 0) + Math.floor(Math.random() * 2 * HOUR));

const made: string[] = [];
afterAll(async () => {
  // Leave nobody opted in for later runs.
  if (made.length) await db().update(profiles).set({ districtAlertOptIn: false }).where(inArray(profiles.accountId, made));
});

async function member(district: string, over: { optedInAt?: Date; consent?: boolean; gender?: string; romance?: boolean } = {}) {
  const m = await createMember({ district, romanceOn: over.romance, relationship: "single" });
  made.push(m.id);
  await db().update(profiles).set({ districtAlertOptIn: true, ...(over.gender ? { gender: over.gender } : {}) }).where(eq(profiles.accountId, m.id));
  await db().insert(auditLog).values({ id: newId(), actor: m.id, action: DISTRICT_ALERT_ON, targetType: "account", targetId: m.id, createdAt: over.optedInAt ?? new Date(NOW.getTime() - 60_000) });
  if (over.consent === false) await db().insert(consents).values({ id: newId(), accountId: m.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 5_000) });
  return m;
}

async function mkEvent(district: string, over: Partial<typeof events.$inferInsert> = {}) {
  const id = newId();
  const startsAt = new Date(NOW.getTime() + 2 * DAY);
  await db()
    .insert(events)
    .values({ id, title: `DAL-${id.slice(0, 8)}`, titleEn: `DAL-${id.slice(0, 8)}`, startsAt, endsAt: new Date(startsAt.getTime() + 2 * HOUR), venueName: "Somewhere", district, capacity: 8, status: "published", createdBy: "test", createdAt: new Date(NOW.getTime() - 30_000), ...over });
  return id;
}

const alerts = (accountId: string) => db().select().from(notifications).where(and(eq(notifications.accountId, accountId), eq(notifications.kind, KIND_DISTRICT_ALERT))).limit(10);
const lastSent = async (accountId: string) => (await db().select({ at: profiles.districtAlertLastSentAt }).from(profiles).where(eq(profiles.accountId, accountId)).limit(1))[0].at;

describe("district alert copy", () => {
  it("uses กิจกรรม and the member's own district, both languages", () => {
    expect(optInText("bang_rak", th)).toBe("แจ้งฉันเมื่อมีกิจกรรมเปิดในเขตบางรัก");
    expect(optInText("bang_rak", en)).toBe("Tell me when an event opens in Bang Rak");
    expect(optedInText("bang_rak", en)).toContain("at most once a week");
    expect(needsConsentText("bang_rak", en)).toContain("Settings");
    expect(alertText("bang_rak", "th")).toBe("มีกิจกรรมใหม่เปิดในเขตบางรัก");
    expect(alertText("bang_rak", "en")).toBe("Something new opened in Bang Rak");
    for (const s of [optInText("dusit", th), optInText("dusit", en), optedInText("dusit", th), optedInText("dusit", en), needsConsentText("dusit", th), needsConsentText("dusit", en)]) {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toContain("โต๊ะ");
    }
  });

  it("the evening summary says it without a number and without the event", () => {
    expect(isDigest(KIND_DISTRICT_ALERT, alertLink("bang_rak", "2026-10-26"))).toBe(true);
    expect(digestText([KIND_DISTRICT_ALERT], "en")).toBe("Today: something new in your district");
    expect(digestText([KIND_DISTRICT_ALERT], "th")).toBe("วันนี้: มีกิจกรรมใหม่ในเขตของคุณ");
    expect(digestText(["thanks", KIND_DISTRICT_ALERT], "en")).toBe("Today: 1 thank-you · something new in your district");
    expect(digestText([KIND_DISTRICT_ALERT], "en")).not.toMatch(/\d/);
  });

  it("weekly limit, cutoff and publish time", () => {
    const t0 = new Date("2026-10-20T03:00:00Z");
    expect(alertDue(null, t0)).toBe(true);
    expect(alertDue(t0, new Date(t0.getTime() + 6 * DAY))).toBe(false);
    expect(alertDue(t0, new Date(t0.getTime() + 7 * DAY))).toBe(true);
    const later = new Date(t0.getTime() + DAY);
    expect(alertCutoff(null, t0)).toEqual(t0);
    expect(alertCutoff(t0, later)).toEqual(later);
    expect(alertCutoff(later, t0)).toEqual(later);
    expect(alertCutoff(null, null)).toBeNull();
    // A draft made long ago and published today counts from today; a plain edit doesn't move it.
    const made = new Date("2026-10-01T00:00:00Z");
    expect(publishedAt(made, [{ action: "event.publish", detail: {}, createdAt: t0 }])).toEqual(t0);
    expect(publishedAt(made, [{ action: "event.update", detail: { status: ["draft", "published"] }, createdAt: t0 }])).toEqual(t0);
    expect(publishedAt(made, [{ action: "event.update", detail: { status: ["published", "published"] }, createdAt: t0 }])).toEqual(made);
    expect(publishedAt(made, [{ action: "event.review_approve", detail: {}, createdAt: t0 }])).toEqual(t0);
  });
});

describe.skipIf(!HAS_DB)("weekly district alert job", () => {
  it("sends one in-app alert, naming the district and not the event, and sets the last-sent time", async () => {
    const m = await member("bang_rak");
    const ev = await mkEvent("bang_rak");
    expect(await runDistrictAlerts(ENV, NOW)).toBeGreaterThanOrEqual(1);
    const got = await alerts(m.id);
    expect(got.length).toBe(1);
    expect(got[0].titleTh).toBe("มีกิจกรรมใหม่เปิดในเขตบางรัก");
    expect(got[0].titleEn).toBe("Something new opened in Bang Rak");
    expect(got[0].titleEn).not.toContain(`DAL-${ev.slice(0, 8)}`);
    expect(got[0].link).toMatch(/^\/events\?district=bang_rak&alert=\d{4}-\d{2}-\d{2}$/);
    expect((await lastSent(m.id))?.getTime()).toBe(NOW.getTime());
  });

  it("is idempotent under a duplicate task and doesn't send again within 7 days", async () => {
    const m = await member("dusit");
    await mkEvent("dusit");
    // Two runs at once (a task that arrived twice): one row.
    await Promise.all([runDistrictAlerts(ENV, NOW), runDistrictAlerts(ENV, NOW)]);
    expect((await alerts(m.id)).length).toBe(1);
    await runDistrictAlerts(ENV, new Date(NOW.getTime() + HOUR));
    expect((await alerts(m.id)).length).toBe(1);
    // A newer event three days later: still inside the week.
    await mkEvent("dusit", { createdAt: new Date(NOW.getTime() + 2 * DAY), startsAt: new Date(NOW.getTime() + 9 * DAY), endsAt: new Date(NOW.getTime() + 9 * DAY + HOUR) });
    await runDistrictAlerts(ENV, new Date(NOW.getTime() + 3 * DAY));
    expect((await alerts(m.id)).length).toBe(1);
    // A week on, that newer event is the second alert.
    await runDistrictAlerts(ENV, new Date(NOW.getTime() + 7 * DAY + HOUR));
    const got = await alerts(m.id);
    expect(got.length).toBe(2);
    expect(new Set(got.map((n) => n.link)).size).toBe(2);
  });

  it("only events that went public after the last alert or the opt-in count", async () => {
    const m = await member("bang_kapi");
    await mkEvent("bang_kapi", { createdAt: new Date(NOW.getTime() - 2 * HOUR) }); // before the opt-in
    await runDistrictAlerts(ENV, NOW);
    expect(await alerts(m.id)).toEqual([]);
    expect(await lastSent(m.id)).toBeNull();
    // A draft from before, published by staff after the opt-in, counts.
    const draft = await mkEvent("bang_kapi", { createdAt: new Date(NOW.getTime() - 3 * HOUR) });
    await db().insert(auditLog).values({ id: newId(), actor: "staff", action: "event.publish", targetType: "event", targetId: draft, createdAt: new Date(NOW.getTime() - 10_000) });
    await runDistrictAlerts(ENV, NOW);
    expect((await alerts(m.id)).length).toBe(1);
  });

  it("respects the notifications consent: a newest no means nothing, and the flag stays", async () => {
    const m = await member("pathum_wan", { consent: false });
    await mkEvent("pathum_wan");
    await runDistrictAlerts(ENV, NOW);
    expect(await alerts(m.id)).toEqual([]);
    expect(await lastSent(m.id)).toBeNull();
    const [p] = await db().select({ on: profiles.districtAlertOptIn }).from(profiles).where(eq(profiles.accountId, m.id)).limit(1);
    expect(p.on).toBe(true);
  });

  it("only the member's own district, and nothing for members who didn't opt in", async () => {
    const elsewhere = await member("nong_chok");
    const notIn = await createMember({ district: "min_buri" });
    await mkEvent("min_buri");
    await runDistrictAlerts(ENV, NOW);
    expect(await alerts(elsewhere.id)).toEqual([]);
    expect(await alerts(notIn.id)).toEqual([]);
  });

  it("respects visibility: dating, women-only, private talks, private events, blocks, own events", async () => {
    const d = "lat_krabang";
    const friends = await member(d);
    const man = await member(d, { gender: "man" });
    const host = await createMember();
    const blocker = await member(d);
    await mkEvent(d, { tags: ["open_to_more"] });
    await mkEvent(d, { tags: ["women_only"] });
    await mkEvent(d, { talkMode: true });
    await mkEvent(d, { visibility: "private" });
    await mkEvent(d, { status: "draft" });
    await mkEvent(d, { hostAccountId: host.id });
    await db().insert(blocks).values({ id: newId(), blocker: blocker.id, blocked: host.id });
    await runDistrictAlerts(ENV, NOW);
    // friends-only and the man may see the host's event; the member who blocked the host may not.
    expect((await alerts(friends.id)).length).toBe(1);
    expect((await alerts(man.id)).length).toBe(1);
    expect(await alerts(blocker.id)).toEqual([]);

    // With only events they may not see, nothing goes out.
    const d2 = "yan_nawa";
    const plain = await member(d2, { gender: "man" });
    const dater = await member(d2, { romance: true });
    await mkEvent(d2, { tags: ["open_to_more"] });
    await mkEvent(d2, { tags: ["women_only"] });
    await mkEvent(d2, { talkMode: true });
    await mkEvent(d2, { visibility: "private" });
    await mkEvent(d2, { createdBy: plain.id });
    await runDistrictAlerts(ENV, NOW);
    expect(await alerts(plain.id)).toEqual([]);
    // 💘 on: the dating event is theirs to see.
    expect((await alerts(dater.id)).length).toBe(1);
  });
});

describe.skipIf(!HAS_DB)("district alert opt-in and off", () => {
  const flag = async (id: string) => (await db().select({ on: profiles.districtAlertOptIn }).from(profiles).where(eq(profiles.accountId, id)).limit(1))[0].on;
  const optIns = (id: string) => db().select().from(auditLog).where(and(eq(auditLog.actor, id), eq(auditLog.action, DISTRICT_ALERT_ON))).limit(5);

  it("opting in needs a yes to notifications, and never says yes itself", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    await db().insert(consents).values({ id: newId(), accountId: m.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 5_000) });
    const res = await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back: "" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/settings/);
    expect(await flag(m.id)).toBe(false);
    expect(await optIns(m.id)).toEqual([]);
    const said = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "notifications"))).limit(5);
    expect(said.filter((c) => c.granted).length).toBe(1); // only createMember's original yes, no new one
  });

  it("opts in with consent, records when, and a second tap changes nothing", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    const res = await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back: "" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/events");
    expect(await flag(m.id)).toBe(true);
    expect((await optIns(m.id)).length).toBe(1);
    await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back: "" } });
    expect((await optIns(m.id)).length).toBe(1);
  });

  it("one tap off is a POST; a GET changes nothing; signed-out posts go nowhere", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back: "" } });
    expect((await req("/events/district-alert/off", { cookie: m.cookie })).status).toBe(404);
    expect(await flag(m.id)).toBe(true);
    const res = await req("/events/district-alert/off", { cookie: m.cookie, method: "POST", form: { back: "" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/notifications?notice=district_alert_off");
    expect(await flag(m.id)).toBe(false);
    const anon = await req("/events/district-alert", { method: "POST", form: { back: "" } });
    expect(anon.status).toBe(302);
    expect(anon.headers.get("location")).not.toBe("/events");
  });
});

describe.skipIf(!HAS_DB)("the alert's one-tap off in the notifications list", () => {
  it("renders a POST button under the alert while it is on, in the page and the bell", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back: "" } });
    await db().insert(notifications).values({ id: newId(), accountId: m.id, kind: KIND_DISTRICT_ALERT, titleTh: alertText("bang_rak", "th"), titleEn: alertText("bang_rak", "en"), link: alertLink("bang_rak", "2026-10-26") });
    const page = await (await req("/notifications", { cookie: `${m.cookie}; lang=en` })).text();
    expect(page).toContain("Something new opened in Bang Rak");
    expect(page).toContain('<form method="post" action="/events/district-alert/off"');
    expect(page).toContain("Turn this alert off");
    const thai = await (await req("/notifications", { cookie: `${m.cookie}; lang=th` })).text();
    expect(thai).toContain("ปิดการแจ้งเตือนนี้");
    const panel = await (await req("/notifications/panel", { cookie: `${m.cookie}; lang=en` })).text();
    expect(panel).toContain('action="/events/district-alert/off"');
    // Off: the alert stays in the list, the button goes.
    await req("/events/district-alert/off", { cookie: m.cookie, method: "POST", form: { back: "" } });
    const after = await (await req("/notifications?notice=district_alert_off", { cookie: `${m.cookie}; lang=en` })).text();
    expect(after).toContain("Something new opened in Bang Rak");
    expect(after).toContain("District alert turned off");
    expect(after).not.toContain("/events/district-alert/off");
  });
});

describe.skipIf(!HAS_DB)("district alert switch in Settings", () => {
  const flag = async (id: string) => (await db().select({ on: profiles.districtAlertOptIn }).from(profiles).where(eq(profiles.accountId, id)).limit(1))[0].on;
  const settings = async (cookie: string) => (await req("/settings", { cookie: `${cookie}; lang=en` })).text();

  it("shows while notifications are on, and switches on and off", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    const before = await settings(m.cookie);
    expect(before).toContain('name="key" value="districtAlert"');
    expect(before).toContain("Tell me when an event opens in Bang Rak");
    const on = await req("/settings/quick", { cookie: m.cookie, form: { key: "districtAlert", on: "1" } });
    expect(on.status).toBe(302);
    expect(await flag(m.id)).toBe(true);
    const opted = await db().select().from(auditLog).where(and(eq(auditLog.actor, m.id), eq(auditLog.action, DISTRICT_ALERT_ON))).limit(5);
    expect(opted.length).toBe(1);
    const form = (html: string) => html.slice(html.indexOf('value="districtAlert"')).split("</form>")[0];
    expect(form(before)).toContain('aria-pressed="false"');
    expect(form(await settings(m.cookie))).toContain('aria-pressed="true"');
    await req("/settings/quick", { cookie: m.cookie, form: { key: "districtAlert", on: "0" } });
    expect(await flag(m.id)).toBe(false);
  });

  it("is hidden without a yes to notifications, and can't be switched on then", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    await db().insert(consents).values({ id: newId(), accountId: m.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 5_000) });
    expect(await settings(m.cookie)).not.toContain('value="districtAlert"');
    await req("/settings/quick", { cookie: m.cookie, form: { key: "districtAlert", on: "1" } });
    expect(await flag(m.id)).toBe(false);
  });
});

describe.skipIf(!HAS_DB)("district alert on Discover's filtered empty state", () => {
  // A search nothing matches, so the filtered view is empty whatever other tests leave behind.
  const none = `zz-no-match-${newId().slice(0, 8)}`;
  const discover = async (cookie: string, query: string) => (await req(`/events?${query}&q=${none}`, { cookie: `${cookie}; lang=en` })).text();

  it("filtered to your own district: offered on the map and in the list, and comes back to the same filters", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    for (const view of ["map", "list"]) {
      const html = await discover(m.cookie, `view=${view}&district=bang_rak`);
      expect(html).toContain('action="/events/district-alert"');
      expect(html).toContain("Tell me when an event opens in Bang Rak");
    }
    const html = await discover(m.cookie, "view=map&district=bang_rak");
    const back = html.match(/name="back" value="([^"]+)"/)?.[1].replace(/&amp;/g, "&") ?? "";
    expect(back).toContain("district=bang_rak");
    const res = await req("/events/district-alert", { cookie: m.cookie, method: "POST", form: { back } });
    expect(res.headers.get("location")).toBe(back);
    expect(await discover(m.cookie, "view=list&district=bang_rak")).toContain("We&#39;ll tell you when an event opens in Bang Rak, at most once a week.");
  });

  it("filtered to another district, or without a district: no offer", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    for (const query of ["view=map&district=pathum_wan", "view=list&district=pathum_wan", "view=map"]) {
      expect(await discover(m.cookie, query)).not.toContain("/events/district-alert");
    }
  });

  it("filtered to your own district without a yes to notifications: the Settings link only", async () => {
    const m = await createMember({ district: "bang_rak" });
    made.push(m.id);
    await db().insert(consents).values({ id: newId(), accountId: m.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 5_000) });
    const html = await discover(m.cookie, "view=map&district=bang_rak");
    expect(html).toContain("Turn on notifications in Settings to hear about events in Bang Rak");
    expect(html).not.toContain('action="/events/district-alert"');
  });
});
