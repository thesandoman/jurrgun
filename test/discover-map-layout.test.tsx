/**
 * The full-screen Discover map's chrome (owner report, 2026-10-26): the
 * sheet never contradicts itself when nothing is on, and the empty state
 * offers one thing to do.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { readFileSync } from "node:fs";
import { FULLMAP_CSS, FULLMAP_JS, FullDiscover, NoEventsYet, sheetCopy } from "../src/ui/discover-map";

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

// The floating Key is gone (owner card 3): its legend lives in Filters.
const SRC = readFileSync("src/ui/discover-map.tsx", "utf8");
const page = (t = en) =>
  String(
    <FullDiscover t={t} lang={t === en ? "en" : "th"} points={[]} chips={[]} status={sheetCopy({ total: 0, week: 0, open: 0, filtered: false }, t)} search="" filtered={false} filters={<form class="ff" />} list={<p>list</p>} listHref="/events?view=list" langHref="/lang/th" hasQuests={false} />,
  );

describe("Discover map Key", () => {
  it("leaves no movable Key code behind, only the line that clears its old saved spot", () => {
    for (const gone of ["movableKey", "keyClamp", "keySpot", "KEY_CLAMP_JS", "svm-key-move", "placeKey", "keySave", "keyHome", "--z-key", ".svm-key"]) expect(SRC).not.toContain(gone);
    expect(SRC.match(/bkk-key-pos/g)).toHaveLength(1);
    expect(FULLMAP_JS).toContain('try{localStorage.removeItem("bkk-key-pos")}catch{}');
    expect(FULLMAP_JS).toContain("legend: false");
    expect(FULLMAP_CSS).not.toContain("svm-key");
  });

  it("puts 'What the pins mean' inside the Filters panel, Thai first", () => {
    for (const [t, word] of [[th, "หมุดหมายถึงอะไร"], [en, "What the pins mean"]] as const) {
      const html = page(t);
      const legend = html.indexOf('class="fd-legend"');
      expect(legend).toBeGreaterThan(html.indexOf('class="fd-filters-body"'));
      expect(legend).toBeLessThan(html.indexOf('class="fd-rail"'));
      expect(html).toContain(word);
      for (const k of ["svm-k exact", "svm-k area", "svm-k highlight"]) expect(html).toContain(k);
    }
    // A district-level pin still explains itself on its card.
    expect(page(en)).toContain("District area: address on the event page");
    expect(FULLMAP_CSS).toContain(".fullmap .svm-note::before{");
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
    expect(FULLMAP_CSS).toContain("--z-map:0;--z-pill:4;--z-rail:5;--z-chips:6;--z-top:8;--z-panel:9;--z-sheet:10;--z-tab:11;--z-card:12;--z-skip:30");
  });

  it("keeps the fixed chrome inside the safe areas, and the rail comes back once a pin's card closes", () => {
    for (const s of ["env(safe-area-inset-top", "env(safe-area-inset-left", "env(safe-area-inset-right", "env(safe-area-inset-bottom"]) expect(FULLMAP_CSS).toContain(s);
    expect(FULLMAP_CSS).toContain("@media (max-width:899.98px){.fullmap:has(.svm-sheet:not([hidden])) .fd-rail{visibility:hidden}}");
  });
});
