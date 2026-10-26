/**
 * Discover as a full-screen map, modelled on the Sanroo live map
 * (floodmap.apps.sv-academy.org) and built on its template package `sv-map`
 * (github:thesandoman/sv-map; browser files bundled and served at /vendor/…).
 *
 * Sanroo → Jurrgun:
 *   scrolling ticker                          → none (calmer map chrome, owner D3)
 *   floating header (logo, search, ♿, EN)     → same, the search is one translucent
 *     pill with a Filters button (every filter, City Quests and the map style)
 *   status card ("no warnings · LIVE")        → "N events this week" on the
 *     events sheet's handle
 *   layer chips                               → category chips + Free
 *   right-hand buttons                        → two: Cards (the list) and Near me
 *   foldable legend                           → exact place · district · mine
 *   centre action in the bottom bar           → 🎟️ My events (kit.tsx TabBar)
 *   "skip the map, show the list"             → the Events sheet over the map
 *
 * Privacy: points carry only what an event card shows. Never people, never
 * who is going; your own RSVP shows only to you. Location stays on the phone.
 */
import type { Child } from "hono/jsx";
import { BrandMark } from "./brand";
import { A11yMenu } from "./a11y";
import type { Lang, T } from "../lib/i18n";
import type { Precision } from "../lib/places";
import { BKK_CENTER, BKK_PAN_LIMIT } from "../lib/places";
import { SV_MAP_VERSION } from "../vendor/sv-map.generated";

export type MapPoint = {
  id: string;
  title: string;
  when: string;
  venue: string;
  district: string;
  lat: number;
  lng: number;
  precision: Precision;
  emoji: string;
  /** The event's cover photo address, when it has one. */
  cover: string | null;
  /** Category values (EVENT_TAGS) for the chips. */
  tags: string[];
  free: boolean;
  cost: string;
  spots: string;
  full: boolean;
  /** The viewer's own registration label, if any. */
  mine: string | null;
};

export type MapChip = { value: string; label: string; emoji: string };


/** One event in sv-map's point shape. */
export function svmPoint(p: MapPoint, t: T) {
  const lines = [`🗓️ ${p.when}`, `📍 ${p.venue} · ${p.district}`];
  if (p.precision === "route") lines.push(t("จุดเริ่มเส้นทาง", "Route start"));
  return {
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    title: p.title,
    icon: p.emoji,
    image: p.cover ?? undefined,
    href: `/events/${encodeURIComponent(p.id)}`,
    lines,
    badges: [
      { text: p.spots, tone: p.full ? "warn" : "ok" },
      { text: p.cost, tone: "muted" },
      ...(p.mine ? [{ text: `✓ ${p.mine}`, tone: "accent" }] : []),
    ],
    tags: p.tags,
    precision: p.precision === "area" ? "area" : "exact",
    highlight: !!p.mine,
    muted: p.full,
    free: p.free,
    /** Lower-case text the search box matches against. */
    search: `${p.title} ${p.venue} ${p.district}`.toLowerCase(),
  };
}

/**
 * What the events sheet's handle says. Never a contradiction like "tap to see
 * all" over "All 0 events": with nothing upcoming the sheet opens on a helpful
 * empty state instead, and a quiet week points at the events further ahead.
 */
export type SheetCopy = {
  ok: boolean;
  title: string;
  /** The second line ("All N events · tap for the list"), or null when it would repeat the title. */
  sub: string | null;
  /** "none": nothing upcoming at all; "filtered": nothing matches the filters. */
  empty: "none" | "filtered" | null;
};
export function sheetCopy(n: { total: number; week: number; open: number; filtered: boolean }, t: T): SheetCopy {
  if (n.total === 0)
    return n.filtered
      ? { ok: false, title: t("ไม่พบกิจกรรมที่ตรงกับตัวกรอง", "No events match these filters"), sub: null, empty: "filtered" }
      : { ok: false, title: t("ยังไม่มีกิจกรรมเร็ว ๆ นี้", "No events coming up yet"), sub: null, empty: "none" };
  if (n.week === 0)
    return {
      ok: false,
      title: t(`ไม่มีกิจกรรมสัปดาห์นี้ · ดูอีก ${n.total} กิจกรรมที่จะมาถึง`, `No events this week · see the ${n.total} coming up later`),
      sub: null,
      empty: null,
    };
  return {
    ok: true,
    title: t(`✓ ${n.week} กิจกรรมสัปดาห์นี้ · ${n.open} ยังมีที่ว่าง`, `✓ ${n.week} event${n.week === 1 ? "" : "s"} this week · ${n.open} with spots left`),
    sub: t(`ทั้งหมด ${n.total} กิจกรรม · แตะเพื่อดูรายการ`, `All ${n.total} event${n.total === 1 ? "" : "s"} · tap for the list`),
    empty: null,
  };
}

/** The sheet's body when nothing is coming up: say so kindly, and offer one thing to do. */
export function NoEventsYet(props: { t: T; filtered: boolean; clearHref: string }) {
  const { t } = props;
  return props.filtered ? (
    <div class="fd-empty">
      <p>{t("ยังไม่มีกิจกรรมที่ตรงกับตัวกรองนี้ ลองล้างตัวกรองดูนะ", "No events match these filters yet. Try clearing them.")}</p>
      <a class="btn ghost" href={props.clearHref}>
        {t("ล้างตัวกรอง", "Clear filters")}
      </a>
    </div>
  ) : (
    <div class="fd-empty">
      <p>{t("ยังไม่มีใครนัดกันช่วงนี้ เริ่มโต๊ะแรกเองได้ หรือแวะมาดูใหม่เร็ว ๆ นี้", "Nobody has planned anything yet. Start the first table yourself, or check back soon.")}</p>
      <a class="btn primary" href="/host/new">
        {t("เสนอกิจกรรม", "Suggest an event")}
      </a>
    </div>
  );
}

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

export function FullDiscover(props: {
  t: T;
  lang: Lang;
  points: MapPoint[];
  chips: MapChip[];
  status: SheetCopy;
  search: string;
  filtered: boolean;
  /** The filter form (same as the list view's). */
  filters: Child;
  /** Event cards for the list sheet. */
  list: Child;
  listHref: string;
  langHref: string;
  /** Show the "Quests" button only when City Quests are on screen. */
  hasQuests: boolean;
}) {
  const { t, lang } = props;
  const cfg = {
    lang,
    points: props.points.map((p) => svmPoint(p, t)),
    chips: props.chips.map((c) => ({ value: c.value, label: c.label, icon: c.emoji })),
    free: { value: "free", label: t("ฟรี", "Free"), icon: "💸" },
    legend: [
      { kind: "exact", label: t("สถานที่จริง", "Exact place") },
      { kind: "area", label: t("ระดับเขต", "District area") },
      { kind: "highlight", label: t("นัดของฉัน", "My events") },
    ],
    messages:
      lang === "en"
        ? { none: "No events on the map yet", areaNote: "District area: address on the event page", key: "Key", keyDrag: "Drag or use the arrow keys to move. Double-tap to put it back.", keyMove: "Move the key", keyMoved: "Key moved", keyHome: "Key back in its place" }
        : { none: "ยังไม่มีกิจกรรมบนแผนที่", areaNote: "ระดับเขต ดูที่อยู่ในหน้ากิจกรรม", key: "คำอธิบาย", keyDrag: "ลากหรือกดปุ่มลูกศรเพื่อย้าย แตะสองครั้งเพื่อกลับที่เดิม", keyMove: "ย้ายคำอธิบาย", keyMoved: "ย้ายคำอธิบายแล้ว", keyHome: "คำอธิบายกลับที่เดิมแล้ว" },
    center: BKK_CENTER,
    panLimit: BKK_PAN_LIMIT,
    words: {
      light: t("แผนที่สว่าง", "Light map"),
      dark: t("แผนที่มืด", "Dark map"),
      streets: t("แผนที่ถนน", "Street map"),
      noMatch: t("ไม่พบกิจกรรมที่ค้นหา", "No events match your search"),
    },
  };
  return (
    <div class="fd">
      <link rel="stylesheet" href={`/vendor/sv-map.css?v=${SV_MAP_VERSION}`} />
      <style dangerouslySetInnerHTML={{ __html: FULLMAP_CSS }} />
      <h1 class="sr-only">{t("ค้นหากิจกรรมบนแผนที่", "Discover events on the map")}</h1>
      <a class="fd-skip" href="#discover-sheet">
        {t("ข้ามแผนที่ ดูเป็นรายการ", "Skip the map, show the list")}
      </a>

      {/* The map fills the screen behind everything. */}
      <div id="dmap" class="dmap" aria-label={t("แผนที่กิจกรรม", "Event map")}>
        <p class="dmap-loading">{t("กำลังโหลดแผนที่…", "Loading the map…")}</p>
      </div>


      {/* Floating header */}
      <header class="fd-top">
        <a href="/events" class="fd-logo" aria-label="Jurrgun">
          <BrandMark />
          <small>Jurrgun</small>
        </a>
        <div class="fd-bar">
        <form method="get" action="/events" class="fd-search" role="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            name="q"
            id="fd-q"
            value={props.search}
            placeholder={t("ค้นหา", "Search")}
            aria-label={t("ค้นหากิจกรรม", "Search events")}
            autocomplete="off"
          />
        </form>
        {/* Every filter, the City Quests switch and the map style live in this one sheet (D3). */}
        <details class={`fd-filters ${props.filtered ? "active" : ""}`} id="fd-filters">
          <summary aria-label={props.filtered ? t("ตัวกรอง (มีตัวกรองอยู่)", "Filters (on)") : t("ตัวกรอง", "Filters")}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            <span class="fd-filters-word">{t("ตัวกรอง", "Filters")}</span>
            {props.filtered ? <b class="fd-dot" aria-hidden="true" /> : null}
          </summary>
          <div class="fd-filters-body">
            <div class="fd-map-tools">
              {props.hasQuests ? (
                <button type="button" class="chip-btn" id="fd-quests" aria-pressed="false">
                  <span aria-hidden="true">🧭</span> {t("เฉพาะเควสต์เมือง", "City Quests only")}
                </button>
              ) : null}
              <button type="button" class="chip-btn" id="fd-style">
                <span aria-hidden="true">🗺️</span> {t("เปลี่ยนแบบแผนที่", "Change map style")}
              </button>
            </div>
            {props.filters}
          </div>
        </details>
        </div>
        <A11yMenu t={t} class="fd-a11y" />
        <a class="fd-round" href={props.langHref} lang={lang === "th" ? "en" : "th"}>
          {lang === "th" ? "EN" : "ไทย"}
        </a>
      </header>



      {/* Right-hand buttons */}
      <nav class="fd-rail" aria-label={t("เครื่องมือแผนที่", "Map tools")}>
        {/* The map / cards switch lives here, so nothing floats over the map. */}
        <a href={props.listHref} class="fd-rail-btn">
          <b aria-hidden="true">🃏</b>
          {t("การ์ด", "Cards")}
        </a>
        {/* City Pulse's place on the map (owner D62): the header has no room left, so it rides with the map tools. */}
        <a href="/pulse" class="fd-rail-btn fd-pulse">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
          </svg>
          Pulse
        </a>
        <button type="button" class="fd-rail-btn" id="fd-me" aria-label={t("แสดงตำแหน่งของฉัน", "Show where I am")}>
          <b aria-hidden="true">◎</b>
          {t("ใกล้ฉัน", "Locate")}
        </button>
      </nav>

      {/* The events sheet over the map */}
      {/* With nothing coming up, the sheet starts open on its empty state, so the next step is one tap away. */}
      <details class="fd-sheet" id="discover-sheet" open={props.status.empty ? true : undefined}>
        <summary>
          <span class="fd-grab" aria-hidden="true" />
          <span class={`fd-handle-title ${props.status.ok ? "ok" : ""}`} id="fd-status">{props.status.title}</span>
          {props.status.sub ? <small class="fd-handle-sub">☰ {props.status.sub}</small> : null}
        </summary>
        <section id="discover-list" class="discover-list fd-sheet-body" aria-label={t("รายการกิจกรรม", "Event list")}>
          <h2 class="sr-only">{t("รายการกิจกรรม", "Event list")}</h2>

          <p class="muted fd-nomatch" id="fd-nomatch" hidden>
            {cfg.words.noMatch}
          </p>
          {props.list}
        </section>
      </details>

      {/* Says where the Key went when it is moved without dragging. */}
      <p class="sr-only" id="fd-live" role="status" aria-live="polite" />
      <script type="application/json" id="dmap-data" dangerouslySetInnerHTML={{ __html: scriptJson(cfg) }} />
      <script type="module" dangerouslySetInnerHTML={{ __html: FULLMAP_JS.replace("__V__", SV_MAP_VERSION) }} />
    </div>
  );
}

/**
 * Where the movable Key may sit, as plain browser JavaScript (inlined into the
 * page script below and unit-tested on its own).
 *   keyClamp: pull a spot into the free band (free = {top, left, right, bottom}).
 *   keySpot: a saved spot for this screen, or null to forget it: anything that
 *     isn't two finite numbers, lies off this viewport (saved on a bigger screen
 *     or the other way round), or has no room left for the Key.
 */
export const KEY_CLAMP_JS = `function keyClamp(x, y, w, h, free) {
  return [
    Math.round(Math.min(Math.max(free.left, x), Math.max(free.left, free.right - w))),
    Math.round(Math.min(Math.max(free.top, y), Math.max(free.top, free.bottom - h))),
  ];
}
function keySpot(saved, w, h, free, vw, vh) {
  if (!Array.isArray(saved) || saved.length !== 2) return null;
  const x = saved[0], y = saved[1];
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x + w > vw || y + h > vh) return null;
  if (free.right - free.left < w || free.bottom - free.top < h) return null;
  return keyClamp(x, y, w, h, free);
}`;

/**
 * The browser side: start sv-map full screen, wire the search box, the
 * right-hand buttons and the map style.
 * The map style is kept in localStorage on this device only.
 */
const FULLMAP_JS = `import { createMap } from "/vendor/sv-map.js?v=__V__";
const cfg = JSON.parse(document.getElementById("dmap-data").textContent);
const box = document.getElementById("dmap");
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const STYLES = ["auto", "light", "dark", "streets"];
let style = store.get("bkk-map-style") || "auto";
let query = (document.getElementById("fd-q").value || "").trim().toLowerCase();
let api = null;

const visible = () => cfg.points.filter((p) => !query || p.search.includes(query));
async function start() {
  api?.destroy();
  api = await createMap(box, {
    lang: cfg.lang, points: visible(), chips: cfg.chips, legend: cfg.legend, messages: cfg.messages,
    center: cfg.center, panLimit: cfg.panLimit, basemap: style === "auto" ? document.documentElement.dataset.theme || "auto" : style, skipHref: "#discover-sheet",
    extraChips: [{ ...cfg.free, test: (p) => p.free }],
    // sv-map fits the pins to the whole box; refit around the floating controls.
    onFilter: (shown) => setTimeout(() => refit(shown), 0),
  });
  movableKey(document.querySelector(".svm-key"));
  watchChrome();
  refit(visible(), true);
}

/*
 * One layout pass for the floating chrome (owner report, 2026-10-26). The tab
 * bar, the sheet and the header are measured rather than guessed, so the rail
 * and the Key always sit in the free band between the chips and the sheet:
 * bigger text, a two-line handle or a short landscape screen no longer push
 * them under something else. The rail turns into a row when the screen is
 * short and only steps aside when even that has no room (an open list).
 */
const root = document.querySelector(".fullmap");
const sheetEl = document.getElementById("discover-sheet");
const railEl = document.querySelector(".fd-rail");
const tabEl = document.querySelector(".tabbar");
const GAP = 8;
const isShown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";
const hits = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const px = (v) => Math.ceil(v) + "px";
const credit = () => document.querySelector(".fullmap .maplibregl-ctrl-bottom-right");
/** The sheet where it rests (its handle, or the open list), ignoring a drag or spring in progress. */
function sheetBox() {
  const r = sheetEl.getBoundingClientRect();
  const top = innerHeight - (parseFloat(getComputedStyle(sheetEl).bottom) || 0) - sheetEl.offsetHeight;
  return { left: r.left, right: r.right, top, bottom: top + sheetEl.offsetHeight, width: r.width, height: sheetEl.offsetHeight };
}
/** The top of the tab bar, its raised centre button included. */
function tabTop() {
  let top = innerHeight;
  if (isShown(tabEl)) for (const e of [tabEl, ...tabEl.children]) top = Math.min(top, e.getBoundingClientRect().top);
  return top;
}
function chromeTop() {
  let top = 0;
  for (const e of [document.querySelector(".fd-top"), document.querySelector(".fullmap .svm-chips")]) if (isShown(e)) top = Math.max(top, e.getBoundingClientRect().bottom);
  return top;
}
/** Where the Key may go: under the search and chips, above the map credit, sheet and tab bar, left of the rail. */
function freeArea() {
  const c = credit();
  const bottom = Math.min(tabTop(), sheetBox().top, c && c.offsetHeight ? c.getBoundingClientRect().top : innerHeight);
  const right = isShown(railEl) && !railEl.classList.contains("off") ? railEl.getBoundingClientRect().left : innerWidth;
  return { top: Math.ceil(chromeTop() + GAP), left: GAP, right: Math.floor(right - GAP), bottom: Math.floor(bottom - GAP) };
}
function layoutChrome() {
  if (!root || !sheetEl) return;
  root.style.setProperty("--tab-h", px(Math.max(0, innerHeight - tabTop()) + GAP));
  const handle = sheetEl.querySelector("summary").offsetHeight;
  root.style.setProperty("--sheet-h", px(handle));
  // Phones: an open sheet is taller than its handle, and the map tools wait above it.
  root.style.setProperty("--sheet-cur", px(matchMedia("(min-width: 900px)").matches ? handle : sheetEl.offsetHeight));
  const c = credit();
  root.style.setProperty("--credit-h", px(c ? c.offsetHeight : 0));
  const top = chromeTop() + GAP;
  root.style.setProperty("--free-top", px(top));
  if (railEl) {
    railEl.classList.remove("row", "off");
    const railFits = () => { const r = railEl.getBoundingClientRect(); return r.top >= top - 0.5 && !hits(r, sheetBox()); };
    if (!railFits()) { railEl.classList.add("row"); if (!railFits()) railEl.classList.add("off"); }
  }
  placeKey();
}
let chromeQueued = false;
const queueChrome = () => { if (chromeQueued) return; chromeQueued = true; requestAnimationFrame(() => { chromeQueued = false; layoutChrome(); }); };
const chromeRO = typeof ResizeObserver === "function" ? new ResizeObserver(queueChrome) : null;
function watchChrome() {
  chromeRO?.disconnect();
  for (const e of [document.querySelector(".fd-top"), document.querySelector(".fullmap .svm-chips"), sheetEl, sheetEl?.querySelector("summary"), tabEl, credit()]) if (e) chromeRO?.observe(e);
  layoutChrome();
}
addEventListener("resize", queueChrome);
sheetEl?.addEventListener("toggle", queueChrome);

/**
 * The Key can be moved by dragging its header (mouse, touch or pen), with the
 * arrow keys while its header has focus, or with its Move button (WCAG 2.5.7),
 * and stays where it was left. A short tap still opens and closes it; a drag
 * doesn't; a double-tap (or Home) puts it back. It only ever lives in the free
 * band, never over the search, the chips, the rail, the sheet or the tab bar,
 * and a saved spot that doesn't fit this screen is forgotten.
 */
${KEY_CLAMP_JS}
let keyEl = null, keyWant = null, keyListeners = null;
function setKey(x, y) { keyEl.style.left = x + "px"; keyEl.style.top = y + "px"; keyEl.classList.add("moved"); }
function announce(text) { const live = document.getElementById("fd-live"); if (!live) return; live.textContent = ""; setTimeout(() => { live.textContent = text || ""; }, 50); }
function keyHome(say) { keyWant = null; store.set("bkk-key-pos", ""); keyEl.style.left = keyEl.style.top = ""; keyEl.classList.remove("moved"); queueChrome(); if (say) announce(cfg.messages.keyHome); }
function keySave(x, y, say) { keyWant = [x, y]; store.set("bkk-key-pos", JSON.stringify(keyWant)); setKey(x, y); queueChrome(); if (say) announce(cfg.messages.keyMoved); }
function placeKey() {
  const key = keyEl;
  if (!key || key.hidden) return;
  key.classList.remove("off");
  const free = freeArea();
  // An open Key with no room for its list folds back to its header.
  if (key.open && key.scrollHeight > free.bottom - free.top) key.open = false;
  const w = key.offsetWidth, h = key.offsetHeight;
  if (free.right - free.left < w || free.bottom - free.top < h) { key.classList.add("off"); return; }
  if (keyWant) { const [x, y] = keyClamp(keyWant[0], keyWant[1], w, h, free); setKey(x, y); return; }
  const r = key.getBoundingClientRect();
  if (r.top < free.top || r.bottom > free.bottom + GAP || r.right > free.right + GAP) key.classList.add("off");
}
function movableKey(key) {
  // The map is rebuilt on theme/style changes: drop the previous Key's window listeners.
  keyListeners?.abort();
  keyEl = key;
  if (!key) return;
  keyListeners = new AbortController();
  const signal = keyListeners.signal;
  const head = key.querySelector("summary");
  // A saved spot from another screen size, or a broken value, is dropped rather than squeezed in.
  let saved = null;
  try { saved = JSON.parse(store.get("bkk-key-pos") || "null"); } catch {}
  keyWant = null;
  layoutChrome();
  keyWant = saved === null ? null : keySpot(saved, key.offsetWidth, key.offsetHeight, freeArea(), innerWidth, innerHeight);
  if (saved !== null && !keyWant) store.set("bkk-key-pos", "");
  if (keyWant) setKey(keyWant[0], keyWant[1]);
  let start = null, moved = false;
  head.title = cfg.messages.keyDrag || "";
  head.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight Home");
  head.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const r = key.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, id: e.pointerId, free: freeArea() };
    moved = false;
  });
  // On the window, not the header: a quick flick leaves the header before the first move.
  addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved) { moved = true; key.classList.add("dragging"); }
    e.preventDefault();
    const [x, y] = keyClamp(start.left + dx, start.top + dy, key.offsetWidth, key.offsetHeight, start.free);
    setKey(x, y);
  }, { signal });
  const end = () => {
    if (!start) return;
    start = null;
    key.classList.remove("dragging");
    if (moved) { const r = key.getBoundingClientRect(); keySave(Math.round(r.left), Math.round(r.top)); }
  };
  addEventListener("pointerup", end, { signal });
  addEventListener("pointercancel", end, { signal });
  // A drag ends with a click on the header: don't let it toggle the Key.
  head.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } });
  // Double-tap the header to send it home.
  head.addEventListener("dblclick", (e) => { e.preventDefault(); keyHome(true); });
  // Keyboard: the arrow keys nudge it (Shift for bigger steps), Home puts it back.
  head.addEventListener("keydown", (e) => {
    if (e.key === "Home") { e.preventDefault(); keyHome(true); return; }
    const step = e.shiftKey ? 48 : 16;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = key.getBoundingClientRect();
    const [x, y] = keyClamp(r.left + d[0], r.top + d[1], key.offsetWidth, key.offsetHeight, freeArea());
    keySave(x, y, true);
  });
  // One tap, no dragging: the Move button walks the Key round the free corners, then home.
  const body = key.querySelector(".svm-key-body");
  if (body && !body.querySelector(".svm-key-move")) {
    const mv = document.createElement("button");
    mv.type = "button";
    mv.className = "svm-key-move";
    mv.textContent = cfg.messages.keyMove || "Move";
    mv.addEventListener("click", () => {
      const f = freeArea(), w = key.offsetWidth, h = key.offsetHeight;
      const spots = [[f.left, f.top], [f.right - w, f.top], [f.right - w, f.bottom - h]].map(([x, y]) => keyClamp(x, y, w, h, f));
      const now = keyWant ? spots.findIndex(([x, y]) => Math.abs(x - keyWant[0]) < 8 && Math.abs(y - keyWant[1]) < 8) : -1;
      const next = spots[now + 1];
      if (next) keySave(next[0], next[1], true);
      else keyHome(true);
    });
    body.append(mv);
  }
  // Opening the Key makes it taller: keep it in the free band.
  key.addEventListener("toggle", queueChrome);
}
/** Keep pins clear of the header, chips, right-hand buttons and the sheet. */
function refit(points, instant = false) {
  const map = api?.map;
  if (!map || !points.length) return;
  const top = (document.querySelector(".svm-chips")?.getBoundingClientRect().bottom ?? 220) + 24;
  const rail = document.querySelector(".fd-rail")?.getBoundingClientRect();
  const sheetTop = document.getElementById("discover-sheet")?.getBoundingClientRect().top ?? innerHeight - 120;
  const keyEl = document.querySelector(".svm-key");
  // A Key the member dragged elsewhere no longer sits above the sheet.
  const keyTop = keyEl && !keyEl.classList.contains("moved") ? keyEl.getBoundingClientRect().top : sheetTop;
  const wide = innerWidth >= 900;
  const pad = { top, bottom: Math.max(40, innerHeight - (wide ? sheetTop : Math.min(sheetTop, keyTop)) + 24), left: wide ? 440 : 40, right: rail ? innerWidth - rail.left + 16 : 80 };
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); }
  try {
    map.fitBounds([[w, s], [e, n]], { padding: pad, maxZoom: 14, duration: instant || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400 });
  } catch {}
}
start();
// The Appearance menu flips <html data-theme>: an "auto" map follows it without a reload.
new MutationObserver(() => { if (style === "auto") start(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// Search: filter pins and the list as you type (the form still works without JS).
const listItems = () => Array.from(document.querySelectorAll("#discover-list .ev-item"));
function applySearch() {
  let shown = 0;
  for (const el of listItems()) { const on = !query || (el.dataset.s || "").includes(query); el.hidden = !on; if (on) shown++; }
  document.getElementById("fd-nomatch").hidden = shown > 0 || !query;
  api?.setPoints(visible());
}
document.getElementById("fd-q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); applySearch(); });
if (query) applySearch();

// Status card and "skip the map" open the events sheet.
const sheet = document.getElementById("discover-sheet");
for (const a of document.querySelectorAll('a[href="#discover-sheet"]')) a.addEventListener("click", (e) => { e.preventDefault(); openSheet(); sheet.querySelector("summary").focus(); });

/*
 * The sheet moves like a physical drawer (src/ui/spring.ts, Apple's fluid
 * interface rules): drag the handle and it follows 1:1, rubber-banding past
 * the top; let go and the flick is projected forward to choose open or
 * closed, with the finger's velocity handed to the spring. A tap springs it
 * open or shut, and a sheet in motion can be grabbed again. Phones only; on
 * a laptop it is a side panel. Reduced motion: it simply opens and closes.
 */
const M = window.jgMotion;
const sum = sheet.querySelector("summary");
const body = sheet.querySelector(".fd-sheet-body");
const wide = () => matchMedia("(min-width: 1024px)").matches;
let sy = 0, sAnim = null, sTo = 0, sDrag = null, swallow = false;
const sTr = M.tracker();
const H = () => body.offsetHeight || 1;
const sPaint = () => { sheet.style.transform = sy ? "translate3d(0," + sy + "px,0)" : ""; };
function settle(to, v, damping) {
  sTo = to;
  const done = () => { if (to > 0) { sheet.open = false; sy = 0; sPaint(); } };
  sAnim?.stop();
  if (M.still()) { sy = to; done(); return; }
  sAnim = M.spring({ from: sy, to, velocity: v, damping, response: 0.3, onUpdate: (n) => { sy = n; sPaint(); }, onDone: done });
}
function liveV() { if (sAnim?.live) { const s = sAnim.stop(); sy = s.x; return s.v; } return 0; }
function openSheet() { if (wide()) { sheet.open = true; return; } const v = liveV(); if (!sheet.open) { sheet.open = true; sy = H(); sPaint(); } settle(0, v, 1); }
function closeSheet() { const v = liveV(); settle(H(), v, 1); }
sum.addEventListener("click", (e) => {
  if (wide()) return;
  e.preventDefault();
  if (swallow) { swallow = false; return; }
  const opening = !sheet.open || (sAnim?.live && sTo > 0);
  opening ? openSheet() : closeSheet();
});
sum.addEventListener("pointerdown", (e) => {
  if (wide() || e.button > 0) return;
  liveV();
  sDrag = { id: e.pointerId, y: e.clientY, y0: sy, on: false };
  sTr.reset();
});
sum.addEventListener("pointermove", (e) => {
  if (!sDrag || e.pointerId !== sDrag.id) return;
  const dy = e.clientY - sDrag.y;
  if (!sDrag.on) {
    if (Math.abs(dy) < 8) return;
    sDrag.on = true;
    try { sum.setPointerCapture(e.pointerId); } catch {}
    if (!sheet.open) { sheet.open = true; sDrag.y0 = H(); }
  }
  let next = sDrag.y0 + dy;
  if (next < 0) next = M.rubberband(next, H());
  else if (next > H()) next = H() + M.rubberband(next - H(), 120);
  sy = next;
  sTr.add(sy);
  sPaint();
});
function sUp() {
  if (!sDrag) return;
  const was = sDrag.on;
  sDrag = null;
  if (!was) return;
  swallow = true;
  setTimeout(() => { swallow = false; }, 60);
  const v = sTr.velocity();
  const end = sy + M.project(v, 0.99);
  settle(end > H() / 2 ? H() : 0, v, 0.8);
}
sum.addEventListener("pointerup", sUp);
sum.addEventListener("pointercancel", sUp);

// Right-hand buttons.
document.getElementById("fd-me").addEventListener("click", () => box.querySelector(".svm-me")?.click());
document.getElementById("fd-style").addEventListener("click", async (e) => {
  style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
  store.set("bkk-map-style", style);
  e.currentTarget.title = cfg.words[style] || "";
  await start();
});
const quests = document.getElementById("fd-quests");
quests?.addEventListener("click", () => {
  const on = quests.getAttribute("aria-pressed") !== "true";
  quests.setAttribute("aria-pressed", String(on));
  api?.setFilter(on ? "city_quest" : "");
});

`;

/** Layout for the full-screen map. Uses the app's tokens; dark mode follows the device. */
export const FULLMAP_CSS = `
/* The page never scrolls: html and body are pinned to the viewport on both axes (100vh first, 100dvh where supported). */
html:has(>body.fullmap-body),body.fullmap-body{height:100vh;height:100dvh;max-width:100%;overflow:hidden;overscroll-behavior:none}
body.fullmap-body{position:fixed;inset:0;width:100%;margin:0;padding:0}
/* One stacking scale for everything floating over the map (z-index-management). */
body.fullmap-body{--z-map:0;--z-key:4;--z-rail:5;--z-chips:6;--z-top:8;--z-panel:9;--z-sheet:10;--z-tab:11;--z-card:12;--z-skip:30}
/* --tab-h, --sheet-h, --sheet-cur, --credit-h and --free-top are measured by the page script; these are the fallbacks. */
.fullmap{position:fixed;inset:0;overflow:hidden;--tk-h:0px;--top-h:52px;--tab-h:calc(108px + env(safe-area-inset-bottom,0px));--sheet-h:68px;--sheet-cur:var(--sheet-h);--credit-h:24px;--free-top:136px;--gap:8px;--safe-t:env(safe-area-inset-top,0px);--safe-l:env(safe-area-inset-left,0px);--safe-r:env(safe-area-inset-right,0px);--edge-l:max(10px,calc(var(--safe-l) + 10px));--edge-r:max(10px,calc(var(--safe-r) + 10px))}
.fd-skip{position:absolute;left:-9999px}
.fd-skip:focus{left:8px;top:calc(8px + var(--safe-t));z-index:var(--z-skip);background:var(--surface);padding:8px 12px;border-radius:10px;border:2px solid var(--brand)}
/* map behind everything */
.fullmap .dmap{position:fixed;inset:0;--svm-height:100dvh;--svm-brand:var(--brand);--svm-highlight:var(--info);--svm-surface:var(--surface);--svm-surface-2:var(--surface-2);--svm-ink:var(--ink);--svm-muted:var(--ink-3);--svm-line:var(--line);--svm-focus:var(--mango);--svm-ok:var(--ok);--svm-ok-soft:var(--ok-soft);--svm-warn:var(--warn);--svm-warn-soft:var(--warn-soft);--svm-font:var(--font)}
.fullmap .svm-map{position:absolute;inset:0;height:100%;min-height:0;border:0;border-radius:0}
.fullmap .dmap-loading{position:absolute;inset:0;display:grid;place-items:center;margin:0;color:var(--ink-3);background:var(--surface-2)}
.fullmap .svm-count,.fullmap .svm-me,.fullmap .maplibregl-ctrl-top-right{display:none}
.fullmap .svm-chips{position:fixed;z-index:var(--z-chips);left:0;right:0;top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2 + 8px + var(--safe-t));padding:0 max(12px,calc(var(--safe-r) + 12px)) 4px max(12px,calc(var(--safe-l) + 12px))}
.fullmap .svm-chip{box-shadow:var(--shadow)}
/* The Key lives in the free band above the sheet; details' default margin made a dragged Key creep 10px on every save. */
.fullmap .svm-key{position:fixed;margin:0;left:var(--edge-l);bottom:calc(var(--tab-h) + var(--sheet-cur) + var(--credit-h) + 12px);z-index:var(--z-key);max-width:min(60%,280px);max-height:max(44px,calc(100vh - var(--free-top) - var(--tab-h) - var(--sheet-cur) - var(--credit-h) - 20px));overflow:auto}
@supports (height:100dvh){.fullmap .svm-key{max-height:max(44px,calc(100dvh - var(--free-top) - var(--tab-h) - var(--sheet-cur) - var(--credit-h) - 20px))}}
.fullmap .svm-key.moved{bottom:auto;max-height:none}
.fullmap .svm-key.off,.fd-rail.off{visibility:hidden}
.fullmap .svm-key{padding-block:0}.fullmap .svm-key[open]{padding-bottom:6px}
.fullmap .svm-key summary{display:flex;align-items:center;min-height:44px}
.fullmap .svm-key-move{display:block;width:100%;min-height:44px;margin:6px 0 2px;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:inherit;font-weight:600;cursor:pointer}
.fullmap .svm-key summary{touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.fullmap .svm-key summary::after{content:"⠿";margin-left:8px;opacity:.5;font-weight:400}
.fullmap .svm-key.dragging{opacity:.9;box-shadow:0 12px 30px rgba(0,0,0,.3)}
.fullmap .svm-key.dragging summary{cursor:grabbing}
.fullmap .svm-sheet{z-index:var(--z-card);bottom:calc(var(--tab-h) + 8px)!important}
/* A tapped pin's card gets its column to itself: the Key steps aside, and on phones the rail too (it is back as soon as the card closes). */
.fullmap:has(.svm-sheet:not([hidden])) .svm-key{visibility:hidden}
@media (max-width:899.98px){.fullmap:has(.svm-sheet:not([hidden])) .fd-rail{visibility:hidden}}
/* The map credit sits on its own line just above the sheet, clear of the rail and the Key. */
.fullmap .maplibregl-ctrl-bottom-right{bottom:calc(var(--tab-h) + var(--sheet-cur) + 4px);right:var(--edge-r);max-width:calc(100% - var(--edge-l) - var(--edge-r))}
.fullmap .maplibregl-ctrl-bottom-right .maplibregl-ctrl{margin:0}
/* floating header */
.fd-rail-btn.fd-pulse{color:var(--brand)}
.fd-top{position:fixed;z-index:var(--z-top);top:calc(var(--tk-h) + var(--gap) + var(--safe-t));left:var(--edge-l);right:var(--edge-r);height:var(--top-h);display:flex;gap:8px;align-items:center;min-width:0}
/* The header row fits down to 320px: the search pill shrinks, the round buttons never do (44px or more). */
.fd-top>*{flex:none}
.fd-top>.fd-bar{flex:1 1 auto;min-width:0}
.fd-top>.a11y{margin:0}
.fd-top .a11y-panel{top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2 + var(--safe-t));right:var(--edge-r);max-width:calc(100vw - var(--edge-l) - var(--edge-r))}
@media (max-width:399.98px){.fullmap{--top-h:48px}.fd-top{gap:6px}.fd-search{padding-left:12px}}
.fd-logo,.fd-round{flex:none;display:grid;place-items:center;width:var(--top-h);height:var(--top-h);border-radius:16px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;color:var(--ink);font-weight:700;cursor:pointer;font-size:1rem}
.fd-logo{line-height:1;color:var(--brand);gap:2px;padding-top:4px}.fd-logo svg{width:24px;height:24px}.fd-logo small{font-size:.75rem;color:var(--ink-2);font-weight:700}
.fd-round[aria-pressed="true"]{background:var(--sel);color:var(--sel-ink)}
/* One translucent pill: the search box, then the filter button. The blur sits on a pseudo-element so the fixed filter sheet inside is not trapped by it. */
.fd-bar{position:relative;isolation:isolate;flex:1;min-width:0;display:flex;align-items:center;height:var(--top-h);border-radius:999px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);box-shadow:0 4px 18px rgba(0,0,0,.12)}
.fd-bar::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:color-mix(in srgb,var(--surface) 78%,transparent);-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%)}
@media (prefers-reduced-transparency:reduce){.fd-bar::before{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}}
html.a11y-contrast .fd-bar::before{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}
.fd-search{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:100%;padding:0 4px 0 16px;border-radius:999px 0 0 999px;color:var(--ink-2)}
.fd-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:inherit;min-height:0;padding:0;outline:none}
.fd-search:focus-within{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
/* filters chip + panel */
.fd-filters{flex:none;background:none;border:0;padding:0 4px 0 0;margin:0;border-radius:0;box-shadow:none}
.fd-filters>summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;padding:0 10px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-weight:600;font-size:.88rem;cursor:pointer;position:relative}
.fd-filters-word{display:none}
@media (min-width:430px){.fd-filters-word{display:inline}}
.fd-filters>summary::-webkit-details-marker{display:none}
.fd-dot{position:absolute;top:4px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--info)}
.fd-filters[open]>summary{background:var(--sel);color:var(--sel-ink)}
.fd-filters-body{position:fixed;z-index:var(--z-panel);left:var(--edge-l);right:var(--edge-r);top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2 + var(--safe-t));max-height:calc(100dvh - var(--tk-h) - var(--top-h) - var(--gap) * 4 - var(--tab-h) - var(--sheet-h));overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:6px 14px 12px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
/* right rail */
.fd-rail{position:fixed;z-index:var(--z-rail);right:var(--edge-r);bottom:calc(var(--tab-h) + var(--sheet-cur) + var(--credit-h) + 12px);display:flex;flex-direction:column;gap:8px}
/* Short screens (landscape phones): the rail lies down as a row, so it never reaches the chips. */
.fd-rail.row{flex-direction:row}
@media (max-height:480px){.fd-rail{flex-direction:row}.fullmap .fd-rail-btn{min-height:48px}.fd-handle-sub{display:none}.fullmap .fd-sheet>summary{min-height:48px;padding-block:6px}.fullmap .fd-grab{display:none}}
.fd-rail-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:58px;min-height:58px;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:.7rem;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:var(--shadow)}
.fd-rail-btn b{font-size:1.2rem;line-height:1.1}
.fd-map-tools{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 4px}
.fd-map-tools .chip-btn{min-height:44px}
.fd-map-tools .chip-btn[aria-pressed="true"]{background:var(--sel);color:var(--sel-ink);border-color:var(--sel)}
@media (max-width:520px){.fd-rail{gap:6px}.fd-rail-btn{width:54px;min-height:52px}}
/* Very narrow phones: the search pill gets the logo's room (Discover is the current tab anyway). */
@media (max-width:359px){.fd-logo{display:none}}
.fd-rail-btn[aria-pressed="true"]{background:var(--sel);color:var(--sel-ink);border-color:var(--sel)}
/* events sheet */
.fd-sheet{margin:0;padding:0;position:fixed;z-index:var(--z-sheet);left:0;right:0;bottom:var(--tab-h);background:color-mix(in srgb,var(--surface) 84%,transparent);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);border-top:1px solid color-mix(in srgb,#fff 18%,var(--line));border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.18);will-change:transform}
.fd-sheet>summary{touch-action:none}
@media (prefers-reduced-transparency:reduce){.fd-sheet{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}}
html.a11y-contrast .fd-sheet{background:var(--surface);backdrop-filter:none;-webkit-backdrop-filter:none}
.fd-sheet>summary{list-style:none;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:68px;padding:8px max(16px,calc(var(--safe-r) + 12px)) 8px max(16px,calc(var(--safe-l) + 12px));cursor:pointer;font-weight:600}
.fd-sheet>summary::-webkit-details-marker{display:none}
.fd-grab{width:40px;height:4px;border-radius:2px;background:var(--line)}
/* The handle carries this week's count (it was a green banner over the map). */
.fd-handle-title{font-size:.98rem;font-weight:700;color:var(--ink);text-align:center;line-height:1.3}
.fd-handle-title.ok{color:var(--brand)}
.fd-handle-sub{font-size:.8rem;font-weight:600;color:var(--ink-2);text-align:center}
.fd-sheet-body{max-height:58dvh;overflow:auto;padding:0 14px 14px;overscroll-behavior:contain}
.fd-sheet-links{margin:0 0 4px;text-align:right;font-size:.85rem}
/* Nothing coming up: one kind line and one action, centred under the handle. */
.fd-empty{display:grid;justify-items:center;gap:12px;padding:4px 8px 12px;text-align:center}
.fd-empty p{margin:0;color:var(--ink-2);max-width:36ch;line-height:1.5}
.fd-empty .btn{min-height:44px}
/* tab bar floats over the map */
body.fullmap-body .tabbar{z-index:var(--z-tab)}
@media (min-width:900px){
  .fd-top{right:auto;width:520px}
  .fullmap .svm-chips{right:auto;max-width:720px}
  .fd-filters-body{right:auto;width:420px}
  .fd-sheet{left:12px;right:auto;width:400px;bottom:calc(var(--tab-h) + 12px);border-radius:18px;border:1px solid var(--line)}
  .fd-sheet-body{max-height:calc(100dvh - 300px - var(--tab-h))}
  /* Laptops: the key and a tapped pin's card sit in the left column, above the events list. */
  .fullmap .svm-key{left:max(12px,calc(var(--safe-l) + 12px));bottom:calc(var(--tab-h) + var(--sheet-h) + var(--credit-h) + 24px)}
  .fullmap .svm-sheet{left:12px!important;right:auto!important;top:auto!important;width:400px;max-height:calc(100dvh - var(--tk-h) - var(--top-h) - 220px)}
}
`;
