/**
 * Discover as a full-screen map, modelled on the Sanroo live map
 * (floodmap.apps.sv-academy.org) and built on its template package `sv-map`
 * (github:thesandoman/sv-map; browser files bundled and served at /vendor/…).
 *
 * Sanroo → Jurrgun:
 *   scrolling ticker (rain, heat, PM2.5, news) → rain, heat, PM2.5 from
 *     Open-Meteo plus this week's events, the next one, what's filling up,
 *     a Learn tip and the prototype notice
 *   floating header (logo, search, Aa, EN)    → same; search filters events
 *   status card ("no warnings · LIVE")        → "N events this week", counted
 *     from the database when the page was built
 *   layer chips                               → Filters + category chips + Free
 *   right-hand buttons (Ask, Map, Routes,
 *     Saved, Me)                              → Ask (FAQ), Map style, Quests
 *     (VisitBangkok routes), Saved (My events), Me (my location)
 *   foldable legend                           → exact place · district · mine
 *   centre action in the bottom bar           → 🎟️ My events (kit.tsx TabBar)
 *   "skip the map, show the list"             → the Events sheet over the map
 *
 * Privacy: points carry only what an event card shows. Never people, never
 * who is going; your own RSVP shows only to you. Location stays on the phone.
 */
import type { Child } from "hono/jsx";
import { BrandMark } from "./brand";
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

export type TickerItem = { icon: string; text: string; href?: string; tone?: "ok" | "warn" | "bad" };

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
  ticker: TickerItem[];
  status: { title: string; sub: string; ok: boolean };
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
      { kind: "highlight", label: t("กิจกรรมของฉัน", "My events") },
    ],
    messages:
      lang === "en"
        ? { none: "No events on the map yet", areaNote: "District area: address on the event page", key: "Key" }
        : { none: "ยังไม่มีกิจกรรมบนแผนที่", areaNote: "ระดับเขต ดูที่อยู่ในหน้ากิจกรรม", key: "คำอธิบาย" },
    center: BKK_CENTER,
    panLimit: BKK_PAN_LIMIT,
    words: {
      light: t("แผนที่สว่าง", "Light map"),
      dark: t("แผนที่มืด", "Dark map"),
      streets: t("แผนที่ถนน", "Street map"),
      noMatch: t("ไม่พบกิจกรรมที่ค้นหา", "No events match your search"),
    },
  };
  const tickerRow = (hidden: boolean) => (
    <span class="tk-row" aria-hidden={hidden ? "true" : undefined}>
      {props.ticker.map((i) => (
        <>
          <span class="tk-dot" aria-hidden="true">•</span>
          {i.href ? (
            <a href={i.href} class={`tk-item ${i.tone ?? ""}`} tabindex={hidden ? -1 : undefined}>
              {i.icon} {i.text}
            </a>
          ) : (
            <span class={`tk-item ${i.tone ?? ""}`}>
              {i.icon} {i.text}
            </span>
          )}
        </>
      ))}
    </span>
  );
  return (
    <div class="fd">
      <link rel="stylesheet" href={`/vendor/sv-map.css?v=${SV_MAP_VERSION}`} />
      <style dangerouslySetInnerHTML={{ __html: FULLMAP_CSS }} />
      <a class="fd-skip" href="#discover-sheet">
        {t("ข้ามแผนที่ ดูเป็นรายการ", "Skip the map, show the list")}
      </a>

      {/* The map fills the screen behind everything. */}
      <div id="dmap" class="dmap" aria-label={t("แผนที่กิจกรรม", "Event map")}>
        <p class="dmap-loading">{t("กำลังโหลดแผนที่…", "Loading the map…")}</p>
      </div>

      {/* Ticker */}
      <div class="fd-ticker" role="region" aria-label={t("ข่าวสารวันนี้", "Today in Bangkok")}>
        <div class="tk-track">
          {tickerRow(false)}
          {tickerRow(true)}
        </div>
        <button type="button" class="tk-pause" id="tk-pause" aria-pressed="false" aria-label={t("หยุดเลื่อน", "Pause the ticker")}>
          ❚❚
        </button>
      </div>

      {/* Floating header */}
      <header class="fd-top">
        <a href="/events" class="fd-logo" aria-label="Jurrgun">
          <BrandMark />
          <small>Jurrgun</small>
        </a>
        <form method="get" action="/events" class="fd-search" role="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            name="q"
            id="fd-q"
            value={props.search}
            placeholder={t("ค้นหา กิจกรรม สถานที่ เขต…", "Search events, places, districts…")}
            aria-label={t("ค้นหากิจกรรม", "Search events")}
            autocomplete="off"
          />
        </form>
        <button type="button" class="fd-round" id="fd-text" aria-pressed="false" title={t("ขนาดตัวอักษร", "Text size")} aria-label={t("ขนาดตัวอักษร", "Text size")}>
          Aa
        </button>
        <a class="fd-round" href={props.langHref} lang={lang === "th" ? "en" : "th"}>
          {lang === "th" ? "EN" : "ไทย"}
        </a>
      </header>

      {/* Status card */}
      <a class={`fd-status ${props.status.ok ? "ok" : "calm"}`} href="#discover-sheet" id="fd-status">
        <strong>{props.status.title}</strong>
        <small>
          <i class="fd-live" aria-hidden="true" /> {props.status.sub}
        </small>
      </a>

      {/* Filters: a chip that opens the full filter form */}
      <details class={`fd-filters ${props.filtered ? "active" : ""}`} id="fd-filters">
        <summary>
          ⚙️ {t("ตัวกรอง", "Filters")}
          {props.filtered ? <b class="fd-dot" aria-label={t("มีตัวกรองอยู่", "Filters on")} /> : null}
        </summary>
        <div class="fd-filters-body">{props.filters}</div>
      </details>

      {/* Right-hand buttons */}
      <nav class="fd-rail" aria-label={t("เครื่องมือแผนที่", "Map tools")}>
        <a href="/faq" class="fd-rail-btn">
          <b aria-hidden="true">💬</b>
          {t("ถาม", "Ask")}
        </a>
        <button type="button" class="fd-rail-btn" id="fd-style">
          <b aria-hidden="true">🗺️</b>
          {t("แผนที่", "Map")}
        </button>
        {props.hasQuests ? (
          <button type="button" class="fd-rail-btn" id="fd-quests" aria-pressed="false">
            <b aria-hidden="true">🧭</b>
            {t("เส้นทาง", "Quests")}
          </button>
        ) : null}
        <a href="/me/events" class="fd-rail-btn">
          <b aria-hidden="true">⭐</b>
          {t("ของฉัน", "Saved")}
        </a>
        <button type="button" class="fd-rail-btn" id="fd-me">
          <b aria-hidden="true">◎</b>
          {t("ฉัน", "Me")}
        </button>
      </nav>

      {/* The events sheet over the map */}
      <details class="fd-sheet" id="discover-sheet">
        <summary>
          <span class="fd-grab" aria-hidden="true" />
          <span>
            ☰ {t(`กิจกรรม (${props.count})`, `Events (${props.count})`)}
            <small class="muted"> · {t("แตะเพื่อดูรายการ", "tap for the list")}</small>
          </span>
        </summary>
        <section id="discover-list" class="discover-list fd-sheet-body" aria-label={t("รายการกิจกรรม", "Event list")}>
          <p class="fd-sheet-links">
            <a href={props.listHref}>{t("เปิดเป็นหน้ารายการ →", "Open as a full list →")}</a>
          </p>
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
 * right-hand buttons, map style, text size and the ticker pause.
 * Choices (map style, text size) are kept in localStorage on this device only.
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
    center: cfg.center, panLimit: cfg.panLimit, basemap: style, skipHref: "#discover-sheet",
    extraChips: [{ ...cfg.free, test: (p) => p.free }],
    // sv-map fits the pins to the whole box; refit around the floating controls.
    onFilter: (shown) => setTimeout(() => refit(shown), 0),
  });
  refit(visible(), true);
}
/** Keep pins clear of the header, chips, right-hand buttons and the sheet. */
function refit(points, instant = false) {
  const map = api?.map;
  if (!map || !points.length) return;
  const top = (document.querySelector(".svm-chips")?.getBoundingClientRect().bottom ?? 220) + 24;
  const rail = document.querySelector(".fd-rail")?.getBoundingClientRect();
  const sheetTop = document.getElementById("discover-sheet")?.getBoundingClientRect().top ?? innerHeight - 120;
  const keyTop = document.querySelector(".svm-key")?.getBoundingClientRect().top ?? sheetTop;
  const wide = innerWidth >= 900;
  const pad = { top, bottom: Math.max(40, innerHeight - (wide ? sheetTop : Math.min(sheetTop, keyTop)) + 24), left: wide ? 440 : 40, right: rail ? innerWidth - rail.left + 16 : 80 };
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of points) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); }
  try {
    map.fitBounds([[w, s], [e, n]], { padding: pad, maxZoom: 14, duration: instant || matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400 });
  } catch {}
}
start();

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
for (const a of document.querySelectorAll('a[href="#discover-sheet"]')) a.addEventListener("click", (e) => { e.preventDefault(); sheet.open = true; sheet.querySelector("summary").focus(); });

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

// Text size (Aa), kept on this device.
const textBtn = document.getElementById("fd-text");
const big = () => document.documentElement.classList.contains("big-text");
textBtn.setAttribute("aria-pressed", String(big()));
textBtn.addEventListener("click", () => {
  document.documentElement.classList.toggle("big-text");
  store.set("bkk-text", big() ? "big" : "normal");
  textBtn.setAttribute("aria-pressed", String(big()));
});

// Ticker pause.
const pause = document.getElementById("tk-pause");
pause.addEventListener("click", () => {
  const t = document.querySelector(".fd-ticker");
  const on = !t.classList.toggle("paused");
  pause.setAttribute("aria-pressed", String(!on));
  pause.textContent = on ? "❚❚" : "▶";
});
`;

/** Layout for the full-screen map. Uses the app's tokens; dark mode follows the device. */
export const FULLMAP_CSS = `
body.fullmap-body{padding:0;overflow:hidden;height:100dvh;overscroll-behavior:none}
.fullmap{position:fixed;inset:0;--tk-h:30px;--top-h:52px;--tab-h:calc(64px + env(safe-area-inset-bottom));--sheet-h:56px;--gap:8px}
.fd-skip{position:absolute;left:-9999px}
.fd-skip:focus{left:8px;top:8px;z-index:20;background:var(--surface);padding:8px 12px;border-radius:10px;border:2px solid var(--brand)}
/* map behind everything */
.fullmap .dmap{position:fixed;inset:0;z-index:0;--svm-height:100dvh;--svm-brand:var(--brand);--svm-highlight:var(--gold);--svm-surface:var(--surface);--svm-surface-2:var(--surface-2);--svm-ink:var(--ink);--svm-muted:var(--ink-3);--svm-line:var(--line);--svm-focus:var(--gold);--svm-ok:var(--ok);--svm-ok-soft:var(--ok-soft);--svm-warn:var(--warn);--svm-warn-soft:var(--warn-soft);--svm-font:var(--font)}
.fullmap .svm-map{position:absolute;inset:0;height:100%;min-height:0;border:0;border-radius:0}
.fullmap .dmap-loading{position:absolute;inset:0;display:grid;place-items:center;margin:0;color:var(--ink-3);background:var(--surface-2)}
.fullmap .svm-count,.fullmap .svm-me,.fullmap .maplibregl-ctrl-top-right{display:none}
.fullmap .svm-chips{position:fixed;z-index:6;left:0;right:0;top:calc(var(--tk-h) + var(--top-h) + 64px + var(--gap) * 3);padding:0 12px 4px 118px;scroll-padding-left:118px}
.fullmap .svm-chip{box-shadow:var(--shadow)}
.fullmap .svm-key{position:fixed;left:10px;bottom:calc(var(--tab-h) + var(--sheet-h) + 14px);z-index:5;max-width:60%}
.fullmap .svm-sheet{z-index:12;bottom:calc(var(--tab-h) + 8px)!important}
.fullmap .maplibregl-ctrl-bottom-right{bottom:calc(var(--tab-h) + var(--sheet-h) + 6px)}
/* ticker */
.fd-ticker{position:fixed;z-index:8;top:0;left:0;right:0;height:var(--tk-h);display:flex;align-items:center;background:color-mix(in srgb,var(--surface) 92%,transparent);border-bottom:1px solid var(--line);backdrop-filter:blur(8px);overflow:hidden;font-size:.82rem}
.tk-track{display:flex;width:max-content;animation:tk 60s linear infinite;padding-left:8px}
.fd-ticker.paused .tk-track,.fd-ticker:hover .tk-track,.fd-ticker:focus-within .tk-track{animation-play-state:paused}
.tk-row{display:flex;align-items:center;white-space:nowrap}
.tk-dot{color:var(--ink-3);margin:0 10px}
.tk-item{color:var(--ink);text-decoration:none}
.tk-item.warn{color:var(--warn)}.tk-item.bad{color:var(--err)}.tk-item.ok{color:var(--ok)}
.tk-pause{flex:none;margin-left:auto;position:relative;z-index:1;height:100%;min-width:40px;border:0;border-left:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;font-size:.75rem}
@keyframes tk{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.tk-track{animation:none}.fd-ticker{overflow-x:auto}}
/* floating header */
.fd-top{position:fixed;z-index:8;top:calc(var(--tk-h) + var(--gap));left:10px;right:10px;height:var(--top-h);display:flex;gap:8px;align-items:center}
.fd-logo,.fd-round{flex:none;display:grid;place-items:center;width:var(--top-h);height:var(--top-h);border-radius:16px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;color:var(--ink);font-weight:700;cursor:pointer;font-size:1rem}
.fd-logo{line-height:1;color:var(--brand);gap:2px;padding-top:4px}.fd-logo svg{width:26px;height:26px}.fd-logo small{font-size:.56rem;color:var(--ink-2);font-weight:700}
.fd-round[aria-pressed="true"]{background:var(--brand);color:var(--brand-ink)}
.fd-search{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:var(--top-h);padding:0 14px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);color:var(--ink-3)}
.fd-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:inherit;min-height:0;padding:0;outline:none}
.fd-search:focus-within{outline:3px solid color-mix(in srgb,var(--brand) 45%,transparent)}
/* status card */
.fd-status{position:fixed;z-index:7;top:calc(var(--tk-h) + var(--top-h) + var(--gap) * 2);left:10px;right:10px;display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:16px;text-decoration:none;color:#fff;box-shadow:var(--shadow)}
.fd-status.ok{background:linear-gradient(135deg,#0a7a3d,#0f9a4c 60%,#16a34a)}
.fd-status.calm{background:linear-gradient(135deg,#3d5a49,#5f7a69)}
.fd-status{height:64px;justify-content:center;overflow:hidden}
.fd-status strong{font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fd-status small{opacity:.92;font-size:.76rem;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fd-status small>i{flex:none}
.fd-live{width:8px;height:8px;border-radius:50%;background:#b7f7cf;box-shadow:0 0 0 0 rgba(183,247,207,.7);animation:pulse 2.4s ease-out infinite}
@keyframes pulse{70%{box-shadow:0 0 0 7px rgba(183,247,207,0)}100%{box-shadow:0 0 0 0 rgba(183,247,207,0)}}
/* filters chip + panel */
.fd-filters{background:none;border:0;padding:0;margin:0;border-radius:0;position:fixed;z-index:9;left:12px;top:calc(var(--tk-h) + var(--top-h) + 64px + var(--gap) * 3)}
.fd-filters>summary{list-style:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-weight:600;font-size:.88rem;cursor:pointer;box-shadow:var(--shadow);position:relative}
.fd-filters>summary::-webkit-details-marker{display:none}
.fd-dot{position:absolute;top:4px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--gold)}
.fd-filters[open]>summary{background:var(--fresh);color:#04210f}
.fd-filters-body{position:fixed;left:10px;right:10px;top:calc(var(--tk-h) + var(--top-h) + 116px + var(--gap) * 3);max-height:calc(100dvh - var(--tk-h) - var(--top-h) - 140px - var(--tab-h));overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:6px 14px 12px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
/* right rail */
.fd-rail{position:fixed;z-index:6;right:10px;bottom:calc(var(--tab-h) + var(--sheet-h) + 14px);display:flex;flex-direction:column;gap:8px}
.fd-rail-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:58px;min-height:58px;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:.7rem;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:var(--shadow)}
.fd-rail-btn b{font-size:1.2rem;line-height:1.1}
.fd-rail-btn[aria-pressed="true"]{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
/* events sheet */
.fd-sheet{margin:0;padding:0;position:fixed;z-index:10;left:0;right:0;bottom:var(--tab-h);background:var(--surface);border-top:1px solid var(--line);border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.18)}
.fd-sheet>summary{list-style:none;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:var(--sheet-h);padding:8px 16px;cursor:pointer;font-weight:600}
.fd-sheet>summary::-webkit-details-marker{display:none}
.fd-grab{width:40px;height:4px;border-radius:2px;background:var(--line)}
.fd-sheet-body{max-height:58dvh;overflow:auto;padding:0 14px 14px;overscroll-behavior:contain}
.fd-sheet-links{margin:0 0 4px;text-align:right;font-size:.85rem}
/* tab bar floats over the map */
body.fullmap-body .tabbar{z-index:11}
html.big-text{font-size:18px}
@media (min-width:900px){
  .fd-top{right:auto;width:520px}
  .fd-status{right:auto;width:520px}
  .fullmap .svm-chips{right:auto;max-width:720px}
  .fd-filters-body{right:auto;width:420px}
  .fd-sheet{left:12px;right:auto;width:400px;bottom:calc(var(--tab-h) + 12px);border-radius:18px;border:1px solid var(--line)}
  .fd-sheet-body{max-height:calc(100dvh - 300px - var(--tab-h))}
  .fullmap .svm-key{left:424px}
}
`;
