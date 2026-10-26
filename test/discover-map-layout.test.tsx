/**
 * The full-screen Discover map's chrome (owner report, 2026-10-26): the
 * sheet never contradicts itself when nothing is on, and the empty state
 * offers one thing to do.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { NoEventsYet, sheetCopy } from "../src/ui/discover-map";

const en = tr("en");
const th = tr("th");

describe("Discover map sheet copy", () => {
  it("no events at all: a helpful empty state, Thai first, never 'All 0 events'", () => {
    for (const t of [en, th]) {
      const c = sheetCopy({ total: 0, week: 0, open: 0, filtered: false }, t);
      expect(c.empty).toBe("none");
      expect(c.sub).toBeNull();
      expect(c.title).not.toMatch(/\b0\b|tap to see all|แตะดูทั้งหมด/);
    }
    expect(sheetCopy({ total: 0, week: 0, open: 0, filtered: false }, th).title).toBe("ยังไม่มีกิจกรรมเร็ว ๆ นี้");
    expect(sheetCopy({ total: 0, week: 0, open: 0, filtered: false }, en).title).toBe("No events coming up yet");
    const html = String(<NoEventsYet t={th} filtered={false} clearHref="/events" />);
    expect(html).toContain('href="/host/new"');
    expect(html).toContain("เสนอกิจกรรม");
    expect(String(<NoEventsYet t={en} filtered={false} clearHref="/events" />)).toContain("Suggest an event");
  });

  it("nothing matches the filters: says so, and offers to clear them", () => {
    const c = sheetCopy({ total: 0, week: 0, open: 0, filtered: true }, en);
    expect(c.empty).toBe("filtered");
    const html = String(<NoEventsYet t={en} filtered clearHref="/events" />);
    expect(html).toContain("No events match these filters yet");
    expect(html).toContain('href="/events"');
    expect(html).not.toContain("/host/new");
  });

  it("a quiet week points at the events further ahead, with the right number", () => {
    const c = sheetCopy({ total: 3, week: 0, open: 0, filtered: false }, en);
    expect(c.title).toBe("No events this week · see the 3 coming up later");
    expect(c.sub).toBeNull();
    expect(c.empty).toBeNull();
    expect(sheetCopy({ total: 3, week: 0, open: 0, filtered: false }, th).title).toBe("ไม่มีกิจกรรมสัปดาห์นี้ · ดูอีก 3 กิจกรรมที่จะมาถึง");
  });

  it("a busy week keeps the count and the list line", () => {
    const c = sheetCopy({ total: 1, week: 1, open: 1, filtered: false }, en);
    expect(c.ok).toBe(true);
    expect(c.title).toBe("✓ 1 event this week · 1 with spots left");
    expect(c.sub).toBe("All 1 event · tap for the list");
  });

  it("no em or en dashes in any of it", () => {
    for (const t of [en, th])
      for (const n of [{ total: 0, week: 0, open: 0, filtered: false }, { total: 0, week: 0, open: 0, filtered: true }, { total: 4, week: 0, open: 0, filtered: false }, { total: 4, week: 2, open: 1, filtered: false }]) {
        const c = sheetCopy(n, t);
        expect(`${c.title} ${c.sub ?? ""}`).not.toMatch(/[–—]/);
      }
    expect(String(<NoEventsYet t={th} filtered={false} clearHref="/events" />)).not.toMatch(/[–—]/);
  });
});
