/**
 * Landings per campaign code (owner C3, 27 Oct 2026): a GET of a landing with
 * ?src= adds 1 to a (Bangkok day, code) counter, with nothing about the person;
 * bots and prefetches don't count; City Insight shows landings rounded to 5.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req } from "./helpers";
import app from "../src/index";
import { newId } from "../src/lib/crypto";
import { srcLandings } from "../src/schema";
import { bkkDay, looksHuman } from "../src/services/landings";
import { landingWeek, landingWeeks } from "../src/routes/admin/insights";
import { allowedCode, channelOf } from "../src/content/src-codes";

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

describe("landings (pure)", () => {
  it("drops bots, link previews and prefetches", () => {
    expect(looksHuman(BROWSER, undefined)).toBe(true);
    expect(looksHuman(undefined, undefined)).toBe(false);
    expect(looksHuman("facebookexternalhit/1.1", undefined)).toBe(false);
    expect(looksHuman("Googlebot/2.1", undefined)).toBe(false);
    expect(looksHuman(BROWSER, "prefetch")).toBe(false);
  });
  it("uses the Bangkok day", () => {
    expect(bkkDay(new Date("2026-10-26T17:30:00Z"))).toBe("2026-10-27");
    expect(bkkDay(new Date("2026-10-26T16:30:00Z"))).toBe("2026-10-26");
  });
});

describe("campaign code allow-list", () => {
  it("keeps register codes and turns anything else into other", () => {
    expect(allowedCode("poster-new")).toBe("poster-new");
    expect(allowedCode("somchai-jaidee")).toBe("other");
    expect(allowedCode("google/spring")).toBe("other");
    expect(channelOf("line-rich-quiz")).toBe("line");
    expect(channelOf("other")).toBe("other");
  });
  it("lists Bangkok weeks from Monday, newest first", () => {
    const w = landingWeeks(new Date("2026-10-30T05:00:00Z"), 3);
    expect(w).toEqual(["2026-10-26", "2026-10-19", "2026-10-12"]);
  });
});

describe.skipIf(!HAS_DB)("landings per code", () => {
  const today = () => bkkDay(new Date());
  const open = (path: string, headers: Record<string, string>) => app.request(path, { headers }, ENV);
  const count = async (code: string) =>
    (await db().select({ n: srcLandings.n }).from(srcLandings).where(and(eq(srcLandings.day, today()), eq(srcLandings.code, code))))[0]?.n ?? 0;

  it("counts every landing with a register code, per day, and nothing else", async () => {
    const before = await count("poster-cowork");
    for (let i = 0; i < 3; i++) await open("/new?src=poster-cowork", { "user-agent": BROWSER });
    await open("/new?src=poster-cowork", { "user-agent": "Googlebot/2.1" });
    await open("/new?src=poster-cowork", { "user-agent": BROWSER, "sec-purpose": "prefetch" });
    await open("/settings?src=poster-cowork", { "user-agent": BROWSER });
    expect((await count("poster-cowork")) - before).toBe(3);
  });

  it("never stores a typed-in name: an unlisted code counts as other", async () => {
    const name = `somchai-${newId().slice(0, 6)}`;
    const before = await count("other");
    await open(`/new?src=${name}`, { "user-agent": BROWSER });
    expect((await count("other")) - before).toBe(1);
    expect(await db().select().from(srcLandings).where(eq(srcLandings.code, name))).toHaveLength(0);
    const [row] = await db().select().from(srcLandings).where(eq(srcLandings.code, "other")).limit(1);
    expect(Object.keys(row).sort()).toEqual(["code", "day", "n"]);
  });

  it("shows a week with channel roll-ups, codes from 10, sign-ups per channel only", async () => {
    const monday = "2025-03-03";
    for (const d of [monday, "2025-03-05", "2025-03-06"]) await db().delete(srcLandings).where(eq(srcLandings.day, d));
    await db().insert(srcLandings).values([
      { day: monday, code: "line-rich-new", n: 23 },
      { day: "2025-03-05", code: "line-rich-quiz", n: 4 },
      { day: "2025-03-06", code: "line-voom", n: 4 },
    ]);
    const rows = await landingWeek(db(), monday);
    const line = rows.find((r) => r.kind === "channel" && r.channel === "line")!;
    expect(line.landings).toBe(30); // 31 → 30
    expect(rows.filter((r) => r.kind === "code").map((r) => r.code)).toEqual(["line-rich-new"]);
    expect(rows.find((r) => r.code === "line-rich-new")!.signups).toBeNull();
    const viewer = await createMember({ role: "insight_viewer" });
    const html = await (await req(`/admin/insights?lang=en&days=30&lweek=${landingWeeks(new Date())[0]}`, { cookie: viewer.cookie })).text();
    expect(html).toContain("Campaign landings, by week");
    expect(html).toContain("Sign-ups per 100 landings");
  });
});
