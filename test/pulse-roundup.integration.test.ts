/**
 * The BMA's monthly City Pulse round-up (owner C4, 26 Oct 2026): one ended
 * month, groups of 10 or more, counts rounded to 5, every CSV download audited.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { auditLog, placeChecks, pulseQuestions, pulseResponses, pulseSuggestions } from "../src/schema";
import { endedMonths, roundupMonth } from "../src/routes/admin/pulse";

describe("round-up months (pure)", () => {
  const now = new Date("2026-10-26T05:00:00Z");
  it("defaults to the month just ended and refuses this month or later", () => {
    expect(roundupMonth(undefined, now)).toBe("2026-09");
    expect(roundupMonth("2026-03", now)).toBe("2026-03");
    expect(roundupMonth("2026-10", now)).toBeNull();
    expect(roundupMonth("2026-13", now)).toBeNull();
    expect(roundupMonth("x", now)).toBeNull();
  });
  it("lists the last 12 ended months, newest first, across a year", () => {
    const m = endedMonths(new Date("2026-01-15T05:00:00Z"));
    expect(m[0]).toBe("2025-12");
    expect(m[11]).toBe("2025-01");
    expect(m).toHaveLength(12);
  });
});

describe.skipIf(!HAS_DB)("monthly round-up", () => {
  it("shows one ended month rounded to 5, logs every CSV, and is for BMA admins only", async () => {
    const month = roundupMonth(undefined, new Date())!;
    const [y, mm] = month.split("-").map(Number);
    const mid = new Date(Date.UTC(y, mm - 1, 15, 5));
    const admin = await createMember({ role: "bma_admin" });
    const tag = newId().slice(0, 8);

    const qid = newId();
    await db().insert(pulseQuestions).values({
      id: qid,
      promptTh: `คำถาม ${tag}`,
      promptEn: `Roundup question ${tag}`,
      kind: "single",
      options: [
        { value: "seats", th: "ที่นั่ง", en: "More seats" },
        { value: "shade", th: "ร่มเงา", en: "More shade" },
      ],
      status: "archived",
      activeFrom: new Date(mid.getTime() - 5 * 86_400_000),
      activeTo: mid,
      createdBy: admin.id,
    });
    await db().insert(pulseResponses).values(
      Array.from({ length: 25 }, (_, i) => ({ id: newId(), questionId: qid, researchId: newId(), answer: i < 13 ? "seats" : "shade", district: "dusit", ageBand: "25-29", createdAt: mid })),
    );
    await db().insert(pulseSuggestions).values(Array.from({ length: 12 }, () => ({ id: newId(), body: "", topic: "getting_around", status: "sorted", month })));
    const venue = `Roundup Park ${tag}`;
    await db().insert(placeChecks).values(Array.from({ length: 11 }, () => ({ id: newId(), venue, district: "dusit", reach: "easy", comfort: "yes", month })));

    const html = await (await req(`/admin/pulse/roundup?lang=en&month=${month}`, { cookie: admin.cookie })).text();
    expect(html).toContain(`Roundup question ${tag}`);
    // 13 seats, 12 shade: both shown, rounded to 15 and 10 of 25; % from the rounded counts.
    expect(html).toContain("Respondents: 25");
    expect(html).toContain("15 · 60%");
    expect(html).toContain("10 · 40%");
    expect(html).toContain("Topic totals count only suggestions a moderator has sorted");
    expect(html).toContain(venue);
    expect(html).toContain("<td>10</td>");

    const csv = await req(`/admin/pulse/roundup.csv?month=${month}`, { cookie: admin.cookie });
    expect(csv.status).toBe(200);
    const text = await csv.text();
    expect(text).toContain(`${month},question,${qid},seats,More seats,15`);
    expect(text).toContain(`${month},question,${qid},shade,More shade,10`);
    expect(text).toContain(`${month},topic,getting_around,_sorted,Sorted suggestions,10`);
    const logged = await db().select().from(auditLog).where(and(eq(auditLog.actor, admin.id), eq(auditLog.action, "pulse.roundup_export")));
    expect(logged).toHaveLength(1);

    const thisMonth = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
    expect((await req(`/admin/pulse/roundup?month=${thisMonth}`, { cookie: admin.cookie })).status).toBe(400);
    const viewer = await createMember({ role: "insight_viewer" });
    expect((await req("/admin/pulse/roundup", { cookie: viewer.cookie })).status).toBe(403);
  });
});
