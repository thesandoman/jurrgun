/**
 * City Pulse: consent gate, segments, answer validation, follow-up eligibility.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { pulseQuestions, pulseResponses, registrations, wellbeing } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";

const created: string[] = [];

async function question(q: Partial<typeof pulseQuestions.$inferInsert> & { kind: string }): Promise<string> {
  const id = newId();
  created.push(id);
  await db()
    .insert(pulseQuestions)
    .values({ id, promptTh: `คำถาม ${id}`, promptEn: `Question ${id}`, status: "active", createdBy: "test", ...q });
  return id;
}

const opts = [
  { value: "traffic", th: "รถติด", en: "Traffic" },
  { value: "heat", th: "ร้อน", en: "Heat" },
  { value: "cost", th: "ค่าใช้จ่าย", en: "Cost" },
];

const shows = (html: string, id: string) => html.includes(`action="/pulse/${id}"`);

describe.skipIf(!HAS_DB)("City Pulse", () => {
  afterAll(async () => {
    if (created.length) await db().update(pulseQuestions).set({ status: "archived" }).where(inArray(pulseQuestions.id, created));
  });

  it("redirects signed-out visitors to login", async () => {
    const r = await req("/pulse");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^\/login/);
    expect((await req("/pulse/x", { form: { answer: "1" } })).headers.get("location")).toMatch(/^\/login/);
  });

  it("is hidden without research consent", async () => {
    const q = await question({ kind: "single", options: opts });
    const m = await createMember({ research: false });
    const r = await req("/pulse", { cookie: m.cookie });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(shows(html, q)).toBe(false);
    expect(html).toContain("/settings/privacy");
    const post = await req(`/pulse/${q}`, { cookie: m.cookie, form: { answer: "heat" } });
    expect(post.status).toBe(403);
  });

  it("filters by segment, schedule and status", async () => {
    const everyone = await question({ kind: "single", options: opts });
    const myDistrict = await question({ kind: "single", options: opts, segment: { districts: ["nong_chok"] } });
    const otherDistrict = await question({ kind: "single", options: opts, segment: { districts: ["bang_na"] } });
    const myBand = await question({ kind: "single", options: opts, segment: { ageBands: ["25-29"] } });
    const otherBand = await question({ kind: "single", options: opts, segment: { ageBands: ["60+"] } });
    const future = await question({ kind: "single", options: opts, activeFrom: new Date(Date.now() + 86_400_000) });
    const expired = await question({ kind: "single", options: opts, activeTo: new Date(Date.now() - 1000) });
    const draft = await question({ kind: "single", options: opts, status: "draft" });
    // Born on 1 January, 27 years ago → age band "25-29"
    const birthDate = `${new Date().getUTCFullYear() - 27}-01-01`;
    const m = await createMember({ research: true, district: "nong_chok", birthDate });
    const html = await (await req("/pulse", { cookie: m.cookie })).text();
    expect(shows(html, everyone)).toBe(true);
    expect(shows(html, myDistrict)).toBe(true);
    expect(shows(html, myBand)).toBe(true);
    for (const id of [otherDistrict, otherBand, future, expired, draft]) expect(shows(html, id)).toBe(false);
    // Out-of-segment answers are refused too.
    expect((await req(`/pulse/${otherDistrict}`, { cookie: m.cookie, form: { answer: "heat" } })).status).toBe(404);
    expect((await req(`/pulse/${draft}`, { cookie: m.cookie, form: { answer: "heat" } })).status).toBe(404);
  });

  it("validates answers by kind and stores them under researchId only", async () => {
    const single = await question({ kind: "single", options: opts });
    const multi = await question({ kind: "multi", options: opts });
    const scale = await question({ kind: "scale", options: [{ value: "1", th: "ไม่เลย", en: "Not at all" }, { value: "5", th: "มาก", en: "Very" }] });
    const text = await question({ kind: "text" });
    const area = await question({ kind: "area" });
    const m = await createMember({ research: true, district: "sathon", birthDate: "1990-01-01" });
    const post = (id: string, answer: string | string[]) => req(`/pulse/${id}`, { cookie: m.cookie, form: { answer } });

    expect((await post(single, "flying-cars")).status).toBe(400);
    expect((await post(multi, ["heat", "nope"])).status).toBe(400);
    expect((await post(scale, "6")).status).toBe(400);
    expect((await post(scale, "0")).status).toBe(400);
    expect((await post(scale, "2.5")).status).toBe(400);
    expect((await post(text, "x".repeat(281))).status).toBe(400);
    expect((await post(text, "   ")).status).toBe(400);
    expect((await post(area, "atlantis")).status).toBe(400);

    for (const [id, answer] of [
      [single, "heat"],
      [multi, ["heat", "cost"]],
      [scale, "4"],
      [text, "More shade on sidewalks"],
      [area, "bang_rak"],
    ] as [string, string | string[]][]) {
      const r = await post(id, answer);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/pulse?notice=answered");
    }

    const rows = await db().select().from(pulseResponses).where(eq(pulseResponses.researchId, m.researchId));
    const by = new Map(rows.map((r) => [r.questionId, r]));
    expect(by.get(single)!.answer).toBe("heat");
    expect(by.get(multi)!.answer).toEqual(["heat", "cost"]);
    expect(by.get(scale)!.answer).toBe(4);
    expect(by.get(area)!.answer).toBe("bang_rak");
    expect(by.get(single)!.district).toBe("sathon");
    expect(by.get(single)!.ageBand).toBe("35-44");
    expect(JSON.stringify(rows)).not.toContain(m.id);

    // Answered questions disappear; answering again is refused.
    const html = await (await req("/pulse", { cookie: m.cookie })).text();
    for (const id of [single, multi, scale, text, area]) expect(shows(html, id)).toBe(false);
    const again = await post(single, "cost");
    expect(again.status).toBe(409);
    expect(by.get(single)!.answer).toBe("heat");
  });

  it("refuses answers after research consent is withdrawn", async () => {
    const q = await question({ kind: "single", options: opts });
    const m = await createMember({ research: true });
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1" } });
    expect((await req(`/pulse/${q}`, { cookie: m.cookie, form: { answer: "heat" } })).status).toBe(403);
    expect(await db().select().from(pulseResponses).where(eq(pulseResponses.researchId, m.researchId))).toHaveLength(0);
  });

  describe("UCLA-3 follow-up", () => {
    const followupShown = async (cookie: string) => (await (await req("/pulse", { cookie })).text()).includes('action="/pulse/wellbeing"');
    const answers = { q1: "2", q2: "2", q3: "1" };

    it("is not offered without a baseline, or with a fresh baseline and few events", async () => {
      const m = await createMember({ research: true });
      expect(await followupShown(m.cookie)).toBe(false);
      expect((await req("/pulse/wellbeing", { cookie: m.cookie, form: answers })).status).toBe(403);
      await db().insert(wellbeing).values({ id: newId(), researchId: m.researchId, phase: "baseline", q1: 3, q2: 3, q3: 3 });
      expect(await followupShown(m.cookie)).toBe(false);
    });

    it("is offered after 3 checked-in events, once", async () => {
      const m = await createMember({ research: true });
      await db().insert(wellbeing).values({ id: newId(), researchId: m.researchId, phase: "baseline", q1: 3, q2: 3, q3: 3 });
      await db()
        .insert(registrations)
        .values(
          [1, 2, 3].map(() => ({ id: newId(), eventId: newId(), accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: new Date() })),
        );
      expect(await followupShown(m.cookie)).toBe(true);
      expect((await req("/pulse/wellbeing", { cookie: m.cookie, form: { q1: "4", q2: "1", q3: "1" } })).status).toBe(400);
      const r = await req("/pulse/wellbeing", { cookie: m.cookie, form: answers });
      expect(r.headers.get("location")).toBe("/pulse?notice=answered");
      const rows = await db().select().from(wellbeing).where(and(eq(wellbeing.researchId, m.researchId), eq(wellbeing.phase, "followup")));
      expect(rows).toHaveLength(1);
      expect(rows[0].q1).toBe(2);
      expect(await followupShown(m.cookie)).toBe(false);
      expect((await req("/pulse/wellbeing", { cookie: m.cookie, form: answers })).status).toBe(403);
    });

    it("is offered 60 days after the baseline", async () => {
      const m = await createMember({ research: true });
      await db()
        .insert(wellbeing)
        .values({ id: newId(), researchId: m.researchId, phase: "baseline", q1: 3, q2: 3, q3: 3, createdAt: new Date(Date.now() - 61 * 86_400_000) });
      expect(await followupShown(m.cookie)).toBe(true);
    });
  });
});
