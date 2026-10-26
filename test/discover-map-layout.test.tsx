/**
 * The full-screen Discover map's chrome (owner report, 2026-10-26): the
 * sheet never contradicts itself when nothing is on, and the empty state
 * offers one thing to do.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { FULLMAP_CSS, KEY_CLAMP_JS, NoEventsYet, sheetCopy } from "../src/ui/discover-map";

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

// The page script's Key placement, run as the browser runs it.
type Free = { top: number; left: number; right: number; bottom: number };
const keyFns = new Function(`${KEY_CLAMP_JS}; return { keyClamp, keySpot };`)() as {
  keyClamp: (x: number, y: number, w: number, h: number, free: Free) => [number, number];
  keySpot: (saved: unknown, w: number, h: number, free: Free, vw: number, vh: number) => [number, number] | null;
};
// A 412x908 phone: chips end at 120, the sheet starts at 700, the rail starts at 348.
const FREE: Free = { top: 128, left: 8, right: 340, bottom: 692 };

describe("Discover map Key placement", () => {
  it("clamps a spot into the free band: never over the search or chips, the rail, or the sheet", () => {
    const { keyClamp } = keyFns;
    expect(keyClamp(10, 80, 90, 42, FREE)).toEqual([10, 128]); // the owner's case: under the chips, not on them
    expect(keyClamp(-50, -50, 90, 42, FREE)).toEqual([8, 128]);
    expect(keyClamp(400, 300, 90, 42, FREE)).toEqual([250, 300]); // left of the rail
    expect(keyClamp(20, 900, 90, 42, FREE)).toEqual([20, 650]); // above the sheet
    expect(keyClamp(100.4, 200.6, 90, 42, FREE)).toEqual([100, 201]);
  });

  it("keeps a saved spot that fits this screen", () => {
    expect(keyFns.keySpot([12, 300], 90, 42, FREE, 412, 908)).toEqual([12, 300]);
    expect(keyFns.keySpot([10, 80], 90, 42, FREE, 412, 908)).toEqual([10, 128]);
  });

  it("drops a saved spot that is broken or belongs to another screen", () => {
    const { keySpot } = keyFns;
    for (const bad of [null, "abc", [1], [1, 2, 3], ["10", "80"], [Number.NaN, 4], [Infinity, 4], { x: 1, y: 2 }]) expect(keySpot(bad, 90, 42, FREE, 412, 908)).toBeNull();
    expect(keySpot([1200, 700], 90, 42, FREE, 412, 908)).toBeNull(); // dragged there on a laptop
    expect(keySpot([10, 880], 90, 42, FREE, 412, 908)).toBeNull(); // would hang off the bottom
    expect(keySpot([-300, -50], 90, 42, FREE, 412, 908)).toBeNull();
    expect(keySpot([10, 600], 90, 42, FREE, 812, 375)).toBeNull(); // a portrait spot, now in landscape
  });

  it("drops it when the free band is too small for the Key", () => {
    expect(keyFns.keySpot([10, 140], 90, 42, { top: 128, left: 8, right: 340, bottom: 150 }, 812, 375)).toBeNull();
  });
});

describe("Discover map page CSS", () => {
  it("pins html and body to the viewport with dvh (and a vh fallback), no overflow either way", () => {
    expect(FULLMAP_CSS).toContain("html:has(>body.fullmap-body),body.fullmap-body{height:100vh;height:100dvh;max-width:100%;overflow:hidden;overscroll-behavior:none}");
    expect(FULLMAP_CSS).toContain("body.fullmap-body{position:fixed;inset:0;width:100%;margin:0;padding:0}");
    expect(FULLMAP_CSS).toMatch(/\.fullmap\{position:fixed;inset:0;overflow:hidden;/);
  });

  it("uses one z-index scale for the floating chrome", () => {
    const zs = [...FULLMAP_CSS.matchAll(/z-index:([^;}]+)/g)].map((m) => m[1].trim());
    expect(zs.length).toBeGreaterThan(8);
    // -1 is the search pill's blur layer, inside the pill's own isolated stack.
    expect(zs.filter((z) => !z.startsWith("var(--z-") && z !== "-1")).toEqual([]);
    expect(FULLMAP_CSS).toContain("--z-map:0;--z-key:4;--z-rail:5;--z-chips:6;--z-top:8;--z-panel:9;--z-sheet:10;--z-tab:11;--z-card:12;--z-skip:30");
  });

  it("keeps the fixed chrome inside the safe areas, and the rail comes back once a pin's card closes", () => {
    for (const s of ["env(safe-area-inset-top", "env(safe-area-inset-left", "env(safe-area-inset-right", "env(safe-area-inset-bottom"]) expect(FULLMAP_CSS).toContain(s);
    expect(FULLMAP_CSS).not.toContain(":is(.fd-rail,.svm-key){visibility:hidden}");
    expect(FULLMAP_CSS).toContain("@media (max-width:899.98px){.fullmap:has(.svm-sheet:not([hidden])) .fd-rail{visibility:hidden}}");
    // The details margin no longer nudges a dragged Key.
    expect(FULLMAP_CSS).toContain(".fullmap .svm-key{position:fixed;margin:0;");
  });
});
