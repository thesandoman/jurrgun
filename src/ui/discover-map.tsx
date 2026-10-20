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

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

export function FullDiscover(props: {
  t: T;
  lang: Lang;
  points: MapPoint[];
  chips: MapChip[];
  status: { title: string; ok: boolean };
  search: string;
  filtered: boolean;
  /** The filter form (same as the list view's). */
  filters: Child;
  /** Event cards for the list sheet. */
  list: Child;
  count: number;
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
        ? { none: "No events on the map yet", areaNote: "District area: address on the event page", key: "Key", keyDrag: "Drag to move. Double-tap to put it back." }
        : { none: "ยังไม่มีกิจกรรมบนแผนที่", areaNote: "ระดับเขต ดูที่อยู่ในหน้ากิจกรรม", key: "คำอธิบาย", keyDrag: "ลากเพื่อย้าย แตะสองครั้งเพื่อกลับที่เดิม" },
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
      <details class="fd-sheet" id="discover-sheet">
        <summary>
          <span class="fd-grab" aria-hidden="true" />
          <span class={`fd-handle-title ${props.status.ok ? "ok" : ""}`} id="fd-status">{props.status.title}</span>
          <small class="fd-handle-sub">
            ☰ {t(`ทั้งหมด ${props.count} กิจกรรม · แตะเพื่อดูรายการ`, `All ${props.count} events · tap for the list`)}
          </small>
        </summary>
        <section id="discover-list" class="discover-list fd-sheet-body" aria-label={t("รายการกิจกรรม", "Event list")}>
          <h2 class="sr-only">{t("รายการกิจกรรม", "Event list")}</h2>

          <p class="muted fd-nomatch" id="fd-nomatch" hidden>
            {cfg.words.noMatch}
          </p>
          {props.list}
        </section>
      </details>

      <script type="application/json" id="dmap-data" dangerouslySetInnerHTML={{ __html: scriptJson(cfg) }} />
      <script type="module" dangerouslySetInnerHTML={{ __html: FULLMAP_JS.replace("__V__", SV_MAP_VERSION) }} />
    </div>
  );
}

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
  refit(visible(), true);
}

/**
 * The Key can be dragged anywhere by its header (mouse, touch or pen) and
 * stays where it was left. A short tap still opens and closes it; a drag
 * doesn't. Kept inside the screen, also after rotating or resizing.
 */
let keyListeners = null;
function movableKey(key) {
  // The map is rebuilt on theme/style changes: drop the previous Key's window listeners.
  keyListeners?.abort();
  if (!key) return;
  keyListeners = new AbortController();
  const signal = keyListeners.signal;
  const head = key.querySelector("summary");
  const clamp = (x, y) => [Math.min(Math.max(4, x), innerWidth - key.offsetWidth - 4), Math.min(Math.max(4, y), innerHeight - key.offsetHeight - 4)];
  const place = (x, y) => { [x, y] = clamp(x, y); key.style.left = x + "px"; key.style.top = y + "px"; key.classList.add("moved"); return [x, y]; };
  try { const saved = JSON.parse(store.get("bkk-key-pos") || "null"); if (saved) place(saved[0], saved[1]); } catch {}
  let start = null, moved = false;
  head.title = cfg.messages.keyDrag || "";
  head.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const r = key.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, id: e.pointerId };
    moved = false;
  });
  // On the window, not the header: a quick flick leaves the header before the first move.
  addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved) { moved = true; key.classList.add("dragging"); }
    e.preventDefault();
    place(start.left + dx, start.top + dy);
  }, { signal });
  const end = () => {
    if (!start) return;
    start = null;
    key.classList.remove("dragging");
    if (moved) { const r = key.getBoundingClientRect(); store.set("bkk-key-pos", JSON.stringify([Math.round(r.left), Math.round(r.top)])); }
  };
  addEventListener("pointerup", end, { signal });
  addEventListener("pointercancel", end, { signal });
  // A drag ends with a click on the header: don't let it toggle the Key.
  head.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } });
  // Double-tap the header to send it home.
  head.addEventListener("dblclick", (e) => { e.preventDefault(); store.set("bkk-key-pos", ""); key.style.left = key.style.top = ""; key.classList.remove("moved"); });
  const reclamp = () => { if (key.classList.contains("moved")) place(key.getBoundingClientRect().left, key.getBoundingClientRect().top); };
  addEventListener("resize", reclamp, { signal });
  // Opening a moved Key makes it taller: keep it on screen.
  key.addEventListener("toggle", () => requestAnimationFrame(reclamp));
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
body.fullmap-body{padding:0;overflow:hidden;height:100dvh;overscroll-behavior:none}
.fullmap{position:fixed;inset:0;--tk-h:0px;--top-h:52px;--tab-h:calc(108px + env(safe-area-inset-bottom));--sheet-h:68px;--gap:8px}
.fd-skip{position:absolute;left:-9999px}
.fd-skip:focus{left:8px;top:8px;z-index:20;background:var(--surface);padding:8px 12px;border-radius:10px;border:2px solid var(--brand)}
/* map behind everything */
.fullmap .dmap{position:fixed;inset:0;--svm-height:100dvh;--svm-brand:var(--brand);--svm-highlight:var(--info);--svm-surface:var(--surface);--svm-surface-2:var(--surface-2);--svm-ink:var(--ink);--svm-muted:var(--ink-3);--svm-line:var(--line);--svm-focus:var(--mango);--svm-ok:var(--ok);--svm-ok-soft:var(--ok-soft);--svm-warn:var(--warn);--svm-warn-soft:var(--warn-soft);--svm-font:var(--font)}
.fullmap .svm-map{position:absolute;inset:0;height:100%;min-height:0;border:0;border-radius:0}
.fullmap .dmap-loading{position:absolute;inset:0;display:grid;place-items:center;margin:0;color:var(--ink-3);background:var(--surface-2)}
.fullmap .svm-count,.fullmap .svm-me,.fullmap .maplibregl-ctrl-top-right{display:none}
.fullmap .svm-chips{position:fixed;z-index:6;left:0;right:0;top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2 + 8px);padding:0 12px 4px}
.fullmap .svm-chip{box-shadow:var(--shadow)}
.fullmap .svm-key{position:fixed;left:10px;bottom:calc(var(--tab-h) + var(--sheet-h) + 14px);z-index:5;max-width:60%}
.fullmap .svm-key.moved{bottom:auto}
.fullmap .svm-key summary{touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.fullmap .svm-key summary::after{content:"⠿";margin-left:8px;opacity:.5;font-weight:400}
.fullmap .svm-key.dragging{opacity:.9;box-shadow:0 12px 30px rgba(0,0,0,.3)}
.fullmap .svm-key.dragging summary{cursor:grabbing}
.fullmap .svm-sheet{z-index:12;bottom:calc(var(--tab-h) + 8px)!important}
/* A tapped pin gets the screen to itself: the rail and the key step aside. */
.fullmap:has(.svm-sheet:not([hidden])) :is(.fd-rail,.svm-key){visibility:hidden}
.fullmap .maplibregl-ctrl-bottom-right{bottom:calc(var(--tab-h) + var(--sheet-h) + 6px)}
/* floating header */
.fd-rail-btn.fd-pulse{color:var(--brand)}
.fd-top{position:fixed;z-index:8;top:calc(var(--tk-h) + var(--gap));left:10px;right:10px;height:var(--top-h);display:flex;gap:8px;align-items:center}
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
.fd-filters-body{position:fixed;z-index:9;left:10px;right:10px;top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2);max-height:calc(100dvh - var(--tk-h) - var(--top-h) - var(--gap) * 4 - var(--tab-h) - var(--sheet-h));overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:6px 14px 12px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
/* right rail */
.fd-rail{position:fixed;z-index:6;right:10px;bottom:calc(var(--tab-h) + var(--sheet-h) + 14px);display:flex;flex-direction:column;gap:8px}
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
.fd-sheet{margin:0;padding:0;position:fixed;z-index:10;left:0;right:0;bottom:var(--tab-h);background:color-mix(in srgb,var(--surface) 84%,transparent);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);border-top:1px solid color-mix(in srgb,#fff 18%,var(--line));border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.18);will-change:transform}
.fd-sheet>summary{touch-action:none}
@media (prefers-reduced-transparency:reduce){.fd-sheet{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none}}
html.a11y-contrast .fd-sheet{background:var(--surface);backdrop-filter:none;-webkit-backdrop-filter:none}
.fd-sheet>summary{list-style:none;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:var(--sheet-h);padding:8px 16px;cursor:pointer;font-weight:600}
.fd-sheet>summary::-webkit-details-marker{display:none}
.fd-grab{width:40px;height:4px;border-radius:2px;background:var(--line)}
/* The handle carries this week's count (it was a green banner over the map). */
.fd-handle-title{font-size:.98rem;font-weight:700;color:var(--ink);text-align:center;line-height:1.3}
.fd-handle-title.ok{color:var(--brand)}
.fd-handle-sub{font-size:.8rem;font-weight:600;color:var(--ink-2);text-align:center}
.fd-sheet-body{max-height:58dvh;overflow:auto;padding:0 14px 14px;overscroll-behavior:contain}
.fd-sheet-links{margin:0 0 4px;text-align:right;font-size:.85rem}
/* tab bar floats over the map */
body.fullmap-body .tabbar{z-index:11}
@media (min-width:900px){
  .fd-top{right:auto;width:520px}
  .fullmap .svm-chips{right:auto;max-width:720px}
  .fd-filters-body{right:auto;width:420px}
  .fd-sheet{left:12px;right:auto;width:400px;bottom:calc(var(--tab-h) + 12px);border-radius:18px;border:1px solid var(--line)}
  .fd-sheet-body{max-height:calc(100dvh - 300px - var(--tab-h))}
  /* Laptops: the key and a tapped pin's card sit in the left column, above the events list. */
  .fullmap .svm-key{left:12px;bottom:calc(var(--tab-h) + var(--sheet-h) + 26px)}
  .fullmap .svm-sheet{left:12px!important;right:auto!important;top:auto!important;width:400px;max-height:calc(100dvh - var(--tk-h) - var(--top-h) - 220px)}
}
`;
