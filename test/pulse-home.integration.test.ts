/**
 * City Pulse home (owner decisions D62 to D66): the top-bar place, one question
 * at a time, what the city heard (k ≥ 10), my answers and taking one back,
 * suggestions sorted by moderators, and the after-table place check.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import { events, feedback, placeChecks, pulseQuestions, pulseResponses, pulseSuggestions } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { heardShares, bkkWeekKey, bkkWeekStart, bkkMonth } from "../src/domain/pulse-heard";

const created: string[] = [];
const opts = [
  { value: "shade", th: "ร่มเงา", en: "More shade" },
  { value: "seats", th: "ที่นั่ง", en: "Benches please" },
  { value: "rare", th: "หายาก", en: "Rare answer" },
];

async function question(q: Partial<typeof pulseQuestions.$inferInsert> & { kind?: string } = {}): Promise<string> {
  const id = newId();
  created.push(id);
  await db()
    .insert(pulseQuestions)
    .values({ id, promptTh: `ถาม ${id}`, promptEn: `Question ${id}`, kind: "single", options: opts, status: "active", createdBy: "test", ...q });
  return id;
}

async function answers(questionId: string, rows: [district: string, answer: string, times: number][]) {
  const values = rows.flatMap(([district, answer, times]) =>
    Array.from({ length: times }, () => ({ id: newId(), questionId, researchId: newId(), answer, district, ageBand: "25-29" })),
  );
  await db().insert(pulseResponses).values(values);
}

const form = (id: string) => `action="/pulse/${id}"`;

describe("City Pulse shares and weeks (pure)", () => {
  it("hides everything under 10 and any answer picked by fewer than 10", () => {
    expect(heardShares(9, new Map([["a", 9]]))).toBeNull();
    expect(heardShares(12, new Map([["a", 11], ["b", 1]]))).toEqual([{ value: "a", tenths: 9 }]);
    expect(heardShares(200, new Map([["a", 190], ["b", 10]]))).toEqual([
      { value: "a", tenths: 10 },
      { value: "b", tenths: 1 },
    ]);
    expect(heardShares(400, new Map([["a", 390], ["b", 10]]))![1]).toEqual({ value: "b", tenths: 0 });
  });

  it("counts Bangkok weeks from Monday and months in Bangkok time", () => {
    // Sunday 23:30 in Bangkok is still the week that began the Monday before.
    const sunNight = new Date("2026-10-25T16:30:00Z");
    expect(bkkWeekKey(sunNight)).toBe("2026-10-19");
    expect(bkkWeekStart(sunNight).toISOString()).toBe("2026-10-18T17:00:00.000Z");
    // Monday 00:30 in Bangkok starts a new one.
    expect(bkkWeekKey(new Date("2026-10-25T17:30:00Z"))).toBe("2026-10-26");
    expect(bkkMonth(new Date("2026-10-31T18:00:00Z"))).toBe("2026-11");
  });
});

describe.skipIf(!HAS_DB)("City Pulse home", () => {
  afterAll(async () => {
    if (created.length) await db().update(pulseQuestions).set({ status: "archived", heardNoteAt: null }).where(inArray(pulseQuestions.id, created));
  });

  it("has its own place in the top bar on member pages, and no tab lights up on /pulse", async () => {
    const m = await createMember();
    const settings = await (await req("/settings", { cookie: m.cookie })).text();
    expect(settings).toContain('class="pulse-btn"');
    expect(settings).not.toContain('class="pulse-btn on"');
    const html = await (await req("/pulse", { cookie: m.cookie })).text();
    expect(html).toContain('class="pulse-btn on" aria-current="page"');
    // The bottom bar and laptop nav have no tab marked as the current page.
    const navs = html.match(/<nav class="(?:tabbar|top-nav)"[\s\S]*?<\/nav>/g) ?? [];
    expect(navs.length).toBe(2);
    for (const n of navs) expect(n).not.toContain('aria-current="page"');
  });

  it("Discover carries one City Pulse line, and says a question is waiting only when one is", async () => {
    const id = await question({ sortOrder: -2_000_000, segment: { districts: ["thung_khru"] } });
    const m = await createMember({ research: true, district: "thung_khru" });
    const html = await (await req("/events?view=list&lang=en", { cookie: m.cookie })).text();
    expect(html).toContain('class="cp-line"');
    expect(html).toContain("this week&#39;s question is waiting");
    const off = await createMember({ research: false, district: "thung_khru" });
    const offHtml = await (await req("/events?view=list&lang=en", { cookie: off.cookie })).text();
    expect(offHtml).toContain('class="cp-line"');
    expect(offHtml).not.toContain("question is waiting");
    await db().update(pulseQuestions).set({ status: "archived" }).where(eq(pulseQuestions.id, id));
  });

  it("shows one question at a time, and the next waits behind a tap after answering", async () => {
    const first = await question({ sortOrder: -1_000_002, segment: { districts: ["lak_si"] } });
    const second = await question({ sortOrder: -1_000_001, segment: { districts: ["lak_si"] } });
    const m = await createMember({ research: true, district: "lak_si" });
    let html = await (await req("/pulse", { cookie: m.cookie })).text();
    expect(html).toContain(form(first));
    expect(html).not.toContain(form(second));

    const r = await req(`/pulse/${first}`, { cookie: m.cookie, form: { answer: "shade" } });
    expect(r.headers.get("location")).toBe("/pulse?notice=answered");
    html = await (await req("/pulse?notice=answered", { cookie: m.cookie })).text();
    const more = html.match(/<details class="cp-more">[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(more).toContain(form(second));
    // Without the just-answered state the next one is simply there.
    html = await (await req("/pulse", { cookie: m.cookie })).text();
    expect(html).toContain(form(second));
    expect(html).not.toContain('class="cp-more"');
  });

  it("stops at 3 answers a Bangkok week, with no count or streak", async () => {
    const qs = [];
    for (let i = 0; i < 4; i++) qs.push(await question({ sortOrder: -900_000 + i, segment: { districts: ["bang_bon"] } }));
    const m = await createMember({ research: true, district: "bang_bon" });
    for (const id of qs.slice(0, 3)) expect((await req(`/pulse/${id}`, { cookie: m.cookie, form: { answer: "seats" } })).status).toBe(302);
    const html = await (await req("/pulse?lang=en", { cookie: m.cookie })).text();
    expect(html).not.toContain(form(qs[3]!));
    expect(html).toContain("That&#39;s this week&#39;s 3");
    expect((await req(`/pulse/${qs[3]}`, { cookie: m.cookie, form: { answer: "seats" } })).status).toBe(409);
    expect(html).not.toMatch(/streak/i);
  });

  it("shows what the city heard only from 10+, hides small answers, and the district only when it has 10+", async () => {
    const big = await question({ status: "archived", heardNoteAt: new Date(), heardNoteEn: "Benches went in at Lumphini.", heardNoteTh: "ติดม้านั่งที่ลุมพินีแล้ว" });
    const small = await question({ status: "archived", heardNoteAt: new Date() });
    await answers(big, [
      ["bang_rak", "seats", 11],
      ["sathon", "rare", 1],
    ]);
    await answers(small, [["bang_rak", "shade", 9]]);

    const inBangRak = await createMember({ research: true, district: "bang_rak" });
    const html = await (await req("/pulse?lang=en", { cookie: inBangRak.cookie })).text();
    expect(html).toContain(`Question ${big}`);
    expect(html).toContain("Benches please");
    expect(html).toContain("about 9 in 10");
    expect(html).not.toContain("Rare answer");
    expect(html).not.toContain(`Question ${small}`);
    expect(html).toContain("Benches went in at Lumphini.");
    expect(html).toContain("In Bang Rak: most said");

    const inSathon = await createMember({ research: true, district: "sathon" });
    const other = await (await req("/pulse?lang=en", { cookie: inSathon.cookie })).text();
    expect(other).toContain(`Question ${big}`);
    expect(other).not.toContain("In Sathon: most said");
  });

  it("lists my own answers and lets me take one back", async () => {
    const id = await question({ sortOrder: -800_000, segment: { districts: ["sai_mai"] } });
    const m = await createMember({ research: true, district: "sai_mai" });
    await req(`/pulse/${id}`, { cookie: m.cookie, form: { answer: "shade" } });
    const html = await (await req("/pulse?lang=en", { cookie: m.cookie })).text();
    const mine = html.match(/<details class="cp-mine">[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(mine).toContain(`Question ${id}`);
    expect(mine).toContain("More shade");
    expect(mine).toContain(`action="/pulse/${id}/withdraw"`);
    // Someone else can't take my answer back: it only ever deletes under your own research code.
    const other = await createMember({ research: true, district: "sai_mai" });
    await req(`/pulse/${id}/withdraw`, { cookie: other.cookie, form: { go: "1" } });
    expect(await db().select().from(pulseResponses).where(and(eq(pulseResponses.questionId, id), eq(pulseResponses.researchId, m.researchId)))).toHaveLength(1);
    const r = await req(`/pulse/${id}/withdraw`, { cookie: m.cookie, form: { go: "1" } });
    expect(r.status).toBe(302);
    expect(await db().select().from(pulseResponses).where(and(eq(pulseResponses.questionId, id), eq(pulseResponses.researchId, m.researchId)))).toHaveLength(0);
  });

  it("takes a suggested question once a week with no person attached; only moderators read and sort it", async () => {
    const m = await createMember({ research: true });
    const words = `Ask about night buses ${newId()}`;
    expect((await req("/pulse/suggest", { cookie: m.cookie, form: { body: words } })).status).toBe(302);
    const [row] = await db().select().from(pulseSuggestions).where(eq(pulseSuggestions.body, words));
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(m.id);
    expect(JSON.stringify(row)).not.toContain(m.researchId);
    expect((await req("/pulse/suggest", { cookie: m.cookie, form: { body: "Another one" } })).status).toBe(409);
    expect((await req("/pulse/suggest", { cookie: (await createMember({ research: false })).cookie, form: { body: "x" } })).status).toBe(403);

    const admin = await createMember({ role: "bma_admin" });
    expect((await req("/admin/pulse-suggestions", { cookie: admin.cookie })).status).toBe(403);
    const mod = await createMember({ role: "moderator" });
    expect(await (await req("/admin/pulse-suggestions", { cookie: mod.cookie })).text()).toContain(words);
    expect((await req(`/admin/pulse-suggestions/${row!.id}`, { cookie: mod.cookie, form: { do: "sort", topic: "getting_around" } })).status).toBe(302);
    const [sorted] = await db().select().from(pulseSuggestions).where(eq(pulseSuggestions.id, row!.id));
    expect(sorted).toMatchObject({ status: "sorted", topic: "getting_around", body: "" });
    // The BMA sees the topics page, never the words.
    const topics = await req("/admin/pulse/topics", { cookie: admin.cookie });
    expect(topics.status).toBe(200);
    expect(await topics.text()).not.toContain(words);
  });

  it("offers the place check with the first feedback only, and stores it with the place and month alone", async () => {
    const m = await createMember({ research: true });
    const ev = await attendedOnce(m.id);
    const venue = `Test Garden ${newId().slice(0, 8)}`;
    await db().update(events).set({ venueName: venue }).where(eq(events.id, ev));
    expect(await (await req(`/events/${ev}/feedback`, { cookie: m.cookie })).text()).toContain('name="placeReach"');
    const base = { metNewPerson: "yes", wouldMeetAgain: "yes", feltSafe: "5", groupRating: "4", comment: "" };
    expect((await req(`/events/${ev}/feedback`, { cookie: m.cookie, form: { ...base, placeReach: "easy", placeComfort: "no" } })).status).toBe(302);
    const rows = await db().select().from(placeChecks).where(eq(placeChecks.venue, venue));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ district: "pathum_wan", reach: "easy", comfort: "no", month: bkkMonth(new Date()) });
    expect(Object.keys(rows[0]!).sort()).toEqual(["comfort", "district", "id", "month", "reach", "venue"]);
    // Editing feedback later doesn't offer or store it again.
    expect(await (await req(`/events/${ev}/feedback`, { cookie: m.cookie })).text()).not.toContain('name="placeReach"');
    await req(`/events/${ev}/feedback`, { cookie: m.cookie, form: { ...base, placeReach: "hard" } });
    expect(await db().select().from(placeChecks).where(eq(placeChecks.venue, venue))).toHaveLength(1);
    const [fb] = await db().select().from(feedback).where(and(eq(feedback.eventId, ev), eq(feedback.accountId, m.id)));
    expect(fb).toBeTruthy();

    // Without research consent: not offered, and a posted answer is ignored.
    const off = await createMember({ research: false });
    const ev2 = await attendedOnce(off.id);
    await db().update(events).set({ venueName: `${venue} 2` }).where(eq(events.id, ev2));
    expect(await (await req(`/events/${ev2}/feedback`, { cookie: off.cookie })).text()).not.toContain('name="placeReach"');
    await req(`/events/${ev2}/feedback`, { cookie: off.cookie, form: { ...base, placeReach: "easy" } });
    expect(await db().select().from(placeChecks).where(eq(placeChecks.venue, `${venue} 2`))).toHaveLength(0);
  });

  it("shows the BMA place totals only for months that have ended, rounded to 5", async () => {
    const venue = `Round Park ${newId().slice(0, 8)}`;
    const row = (month: string, reach: string) => ({ id: newId(), venue, district: "dusit", reach, comfort: "yes", month });
    await db().insert(placeChecks).values([
      ...Array.from({ length: 12 }, () => row("2026-01", "easy")),
      ...Array.from({ length: 2 }, () => row("2026-01", "hard")),
      ...Array.from({ length: 20 }, () => row(bkkMonth(new Date()), "easy")),
    ]);
    const admin = await createMember({ role: "bma_admin" });
    const html = await (await req("/admin/pulse/places?lang=en", { cookie: admin.cookie })).text();
    const tr = html.match(new RegExp(`<tr><td>${venue}</td>[\\s\\S]*?</tr>`))?.[0] ?? "";
    // 14 from January only (this month's 20 wait): 14 → 15, easy 12 → 10, hard 2 hidden.
    expect(tr).toContain("<td>15</td>");
    expect(tr).toContain("<td>10</td>");
    expect(tr).toContain("<td>&lt;10</td>");
    expect(tr).not.toContain("<td>14</td>");
    expect(tr).not.toContain("<td>12</td>");
  });
});
