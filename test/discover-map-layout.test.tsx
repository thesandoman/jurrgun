/**
 * The full-screen Discover map's chrome (owner report, 2026-10-26): the
 * sheet never contradicts itself when nothing is on, and the empty state
 * offers one thing to do.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { readFileSync } from "node:fs";
import { CHIPS_JS, FULLMAP_CSS, FULLMAP_JS, FullDiscover, LAPTOP_OPEN_JS, LAPTOP_OPEN_MQ, NoEventsYet, SEARCH_COUNT_JS, SIDE_PANEL_MQ, moreChipsWords, searchCountWords, sheetCopy, showAllWord } from "../src/ui/discover-map";

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
    const html = String(<NoEventsYet t={th} filtered={false} clearHref="/" />);
    expect(html).toContain('href="/host/new"');
    expect(html).toContain("เสนอกิจกรรม");
    expect(String(<NoEventsYet t={en} filtered={false} clearHref="/" />)).toContain("Suggest an event");
  });

  it("nothing matches the filters: says so, and offers to clear them", () => {
    const c = sheetCopy({ total: 0, week: 0, open: 0, filtered: true }, en);
    expect(c.empty).toBe("filtered");
    const html = String(<NoEventsYet t={en} filtered clearHref="/" />);
    expect(html).toContain("No events match these filters yet");
    expect(html).toContain('href="/"');
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
    expect(String(<NoEventsYet t={th} filtered={false} clearHref="/" />)).not.toMatch(/[–—]/);
  });
});

// The floating Key is gone (owner card 3): its legend lives in Filters.
const SRC = readFileSync("src/ui/discover-map.tsx", "utf8");
const page = (t = en) =>
  String(
    <FullDiscover t={t} lang={t === en ? "en" : "th"} points={[]} chips={[]} status={sheetCopy({ total: 0, week: 0, open: 0, filtered: false }, t)} search="" filtered={false} filters={<form class="ff" />} list={<p>list</p>} listHref="/?view=list" langHref="/lang/th" hasQuests={false} />,
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

// The chips row's helpers, run as the browser runs them.
const chipFns = new Function(`${CHIPS_JS}; return { chipOrder, hiddenPast, moreLabel };`)() as {
  chipOrder: (values: string[], on: string[]) => string[];
  hiddenPast: (rights: number[], edge: number) => number;
  moreLabel: (n: number, words: string) => string;
};

describe("Discover map chips row", () => {
  it("the +N chip speaks the full phrase, Thai first, not '+3'", () => {
    expect(moreChipsWords(th)).toBe("อีก {n} หมวด");
    expect(chipFns.moreLabel(3, moreChipsWords(th))).toBe("อีก 3 หมวด");
    expect(chipFns.moreLabel(3, moreChipsWords(en))).toBe("3 more");
    expect(chipFns.moreLabel(3, moreChipsWords(en))).not.toBe("+3");
    // The page hands the words to its script, and the script sets the label from them.
    expect(page(th)).toContain('"moreChips":"อีก {n} หมวด"');
    expect(FULLMAP_JS).toContain('moreBtn.setAttribute("aria-label", moreLabel(n, cfg.words.moreChips))');
    expect(FULLMAP_JS).toContain('moreBtn.textContent = "+" + n');
  });

  it("puts selected chips first and keeps the rest in their order", () => {
    const all = ["", "food", "walk", "art", "music", "free"];
    expect(chipFns.chipOrder(all, ["music"])).toEqual(["music", "", "food", "walk", "art", "free"]);
    expect(chipFns.chipOrder(all, ["free", "walk"])).toEqual(["walk", "free", "", "food", "art", "music"]);
    expect(chipFns.chipOrder(all, [])).toEqual(all);
  });

  it("counts the chips that end past the visible edge", () => {
    expect(chipFns.hiddenPast([80, 160, 240, 330, 420], 300)).toBe(2);
    expect(chipFns.hiddenPast([80, 160], 300)).toBe(0);
  });

  it("fades the row's right edge only while chips are hidden there, and the +N opens Filters", () => {
    expect(FULLMAP_CSS).toContain(".fullmap .svm-chips.over:not(.end){-webkit-mask-image:linear-gradient(to right");
    expect(FULLMAP_CSS).toMatch(/\.fd-more\{position:fixed;z-index:var\(--z-chips\);min-width:44px;min-height:44px;/);
    expect(FULLMAP_JS).toContain('f.open = true;');
    expect(FULLMAP_JS).toContain('bar.addEventListener("scroll", queueChips, { passive: true })');
  });

  it("every chip is a 44px target (sv-map's own chips are 40px), and the row is measured, not guessed", () => {
    expect(FULLMAP_CSS).toMatch(/\.fullmap \.svm-chip\{min-height:44px;/);
    // The free band under the chips comes from their measured bottom, so taller chips move the rail and pill with them.
    expect(FULLMAP_JS).toContain('document.querySelector(".fullmap .svm-chips")]) if (isShown(e)) top = Math.max(top, e.getBoundingClientRect().bottom)');
  });
});

const searchCount = new Function(`${SEARCH_COUNT_JS}; return searchCount;`)() as (n: number, w: ReturnType<typeof searchCountWords>) => string;

describe("Discover map live search count", () => {
  it("says how many events match, Thai first, and never 'พบ 0' or '0 matches'", () => {
    expect(searchCount(3, searchCountWords(th))).toBe("พบ 3 กิจกรรม");
    expect(searchCount(1, searchCountWords(th))).toBe("พบ 1 กิจกรรม");
    expect(searchCount(3, searchCountWords(en))).toBe("3 matches");
    expect(searchCount(1, searchCountWords(en))).toBe("1 match");
    expect(searchCount(0, searchCountWords(th))).toBe("ไม่พบกิจกรรม");
    expect(searchCount(0, searchCountWords(en))).toBe("No matches");
    for (const t of [th, en]) for (const n of [0, 1, 2, 12]) expect(searchCount(n, searchCountWords(t))).not.toMatch(/พบ 0|\b0 match|[–—]/);
  });

  it("shows it on the sheet's handle as you type, and reads it out only once typing pauses", () => {
    expect(page(th)).toContain('"found":{"one":"พบ {n} กิจกรรม","many":"พบ {n} กิจกรรม","none":"ไม่พบกิจกรรม"}');
    expect(FULLMAP_JS).toContain("statusEl.textContent = query ? searchCount(shown, cfg.words.found) : statusHome.text;");
    expect(FULLMAP_JS).toContain("clearTimeout(sayTimer);");
    expect(FULLMAP_JS).toContain("sayTimer = setTimeout(() => announce(searchCount(shown, cfg.words.found)), 600);");
    expect(page(en)).toMatch(/<p class="sr-only" id="fd-live" role="status" aria-live="polite"><\/p>/);
  });
});

describe("Discover map list on arrival", () => {
  // The script as a browser of a given size runs it.
  const opensAt = (w: number, h: number, startOpen = false) => {
    const sheet = { open: startOpen };
    const matchMedia = (q: string) => {
      const minW = Number(/min-width: (\d+)px/.exec(q)?.[1] ?? 0);
      const minH = Number(/min-height: (\d+)px/.exec(q)?.[1] ?? 0);
      return { matches: w >= minW && h >= minH };
    };
    new Function("matchMedia", "document", LAPTOP_OPEN_JS)(matchMedia, { getElementById: (id: string) => (id === "discover-sheet" ? sheet : null) });
    return sheet.open;
  };

  it("opens the side panel on laptops at least 1024px wide and 600px tall, and nowhere else", () => {
    expect(LAPTOP_OPEN_MQ).toBe("(min-width: 1024px) and (min-height: 600px)");
    expect(opensAt(1280, 800)).toBe(true);
    expect(opensAt(1024, 700)).toBe(true);
    expect(opensAt(1024, 600)).toBe(true);
    expect(opensAt(1023, 800)).toBe(false);
    expect(opensAt(1280, 599)).toBe(false);
    expect(opensAt(812, 375)).toBe(false);
    expect(opensAt(412, 908)).toBe(false);
    // Elsewhere the current behaviour stays: an empty state that started open is left alone.
    expect(opensAt(412, 908, true)).toBe(true);
  });

  it("runs right after the panel, before the map script", () => {
    const html = page(en);
    const at = html.indexOf(LAPTOP_OPEN_JS);
    expect(at).toBeGreaterThan(html.indexOf('id="discover-sheet"'));
    expect(at).toBeLessThan(html.indexOf('type="module"'));
  });
});

describe("Discover map Show all pill", () => {
  it("reads ดูทุกจุด in Thai (ดูทั้งหมด is the notifications' See all) and Show all in English", () => {
    expect(showAllWord(th)).toBe("ดูทุกจุด");
    expect(showAllWord(en)).toBe("Show all");
    const html = page(th);
    expect(html).toMatch(/<button type="button" class="fd-showall" id="fd-showall" hidden="">ดูทุกจุด<\/button>/);
    expect(html.slice(html.indexOf('id="fd-showall"'), html.indexOf("</button>", html.indexOf('id="fd-showall"')))).not.toContain("ดูทั้งหมด");
  });

  it("appears only after the member moves the map, and fits back to every pin", () => {
    expect(FULLMAP_JS).toContain("const byHand = (e) => { if (e && e.originalEvent) showPill(); };");
    expect(FULLMAP_JS).toContain('for (const ev of ["movestart", "zoomstart", "rotatestart", "pitchstart"]) map.on(ev, byHand);');
    expect(FULLMAP_JS).toMatch(/pillEl\?\.addEventListener\("click", \(\) => \{\n  refit\(lastShown\);\n  hidePill\(\);/);
    // A 44px target on the shared stacking scale, with calm motion.
    expect(FULLMAP_CSS).toMatch(/\.fd-showall\{position:fixed;z-index:var\(--z-pill\);[^}]*min-height:44px;/);
    expect(FULLMAP_CSS).toContain("@media (prefers-reduced-motion:reduce){.fd-showall{transition:none}}");
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

  it("the page script is valid JavaScript", () => {
    const body = FULLMAP_JS.replace(/^import .*$/m, "");
    expect(() => new Function(`return async () => {${body}\n}`)).not.toThrow();
  });

  it("landscape phones get the side panel: left of the rail, scrolling inside itself", () => {
    expect(SIDE_PANEL_MQ).toBe("(min-width: 900px), (max-height: 480px) and (orientation: landscape)");
    expect(FULLMAP_JS).toContain(`const SIDE = matchMedia("${SIDE_PANEL_MQ}")`);
    const css = FULLMAP_CSS.slice(FULLMAP_CSS.indexOf("@media (max-height:480px) and (orientation:landscape){"));
    expect(css).toContain(".fd-sheet{left:var(--edge-l);right:auto;width:min(360px,calc(50vw - 24px));bottom:var(--tab-h);");
    expect(css).toContain("max-height:calc(100dvh - var(--free-top) - var(--tab-h))");
    expect(css).toContain("overflow:auto");
    expect(css).toContain(".fd-sheet-body{max-height:none;overflow:visible");
    // 200% text: the credit stays right of the panel and the rail still fits above the tab bar.
    expect(css).toContain(".fullmap .maplibregl-ctrl-bottom-right{max-width:calc(100% - min(360px,50vw - 24px) - var(--edge-l) - var(--edge-r))}");
    expect(css).toContain(".fullmap .fd-rail-btn{font-size:min(.7rem,14px)}");
  });

  it("keeps the fixed chrome inside the safe areas, and the rail comes back once a pin's card closes", () => {
    for (const s of ["env(safe-area-inset-top", "env(safe-area-inset-left", "env(safe-area-inset-right", "env(safe-area-inset-bottom"]) expect(FULLMAP_CSS).toContain(s);
    expect(FULLMAP_CSS).toContain("@media (max-width:899.98px){.fullmap:has(.svm-sheet:not([hidden])) .fd-rail{visibility:hidden}}");
  });
});
