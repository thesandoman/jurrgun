/**
 * SV Map: a ready-made map for any app's UI. Pins, one-tap filter chips, a key,
 * a sheet with cards for what you tapped, "my location", and the keyboard and
 * screen-reader care, all from settings. Comes from the Sanroo live map and the
 * BKK Social Discover map.
 *
 *   import { createMap } from "./sv-map.js";
 *   const m = await createMap(document.getElementById("map"), {
 *     points: [{ id: "1", lat: 13.73, lng: 100.54, title: "Lumphini Park walk", icon: "🚶", tags: ["walk"] }],
 *   });
 *
 * The look comes from CSS variables (see sv-map.css), the words from `messages`,
 * the cards from `renderCard`. MapLibre GL is loaded from a CDN on first use
 * unless you pass your own copy as `maplibregl`.
 */

const MAPLIBRE_VERSION = "6.11.2";
const CDN = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist`;

/** Words the map shows. Pass `messages` to change any of them, or `lang` to pick a set. */
export const MESSAGES = {
  th: {
    all: "ทั้งหมด", map: "แผนที่", filters: "ตัวกรอง", key: "คำอธิบาย", close: "ปิด",
    shown: (n) => `${n} รายการบนแผนที่`, none: "ไม่มีรายการในหมวดนี้บนแผนที่",
    here: (n) => `${n} รายการที่นี่`, myLocation: "ตำแหน่งของฉัน",
    me: "คุณอยู่ที่นี่ (เก็บไว้ในเครื่องนี้เท่านั้น)", noGeo: "หาตำแหน่งไม่ได้ ลองเปิดสิทธิ์ตำแหน่งในเบราว์เซอร์",
    km: "กม.", open: "ดูรายละเอียด", skip: "ข้ามแผนที่", loadFail: "โหลดแผนที่ไม่ได้",
    exact: "ตำแหน่งจริง", area: "ระดับพื้นที่", highlight: "ของฉัน", areaNote: "ตำแหน่งโดยประมาณ (ระดับพื้นที่)",
  },
  en: {
    all: "All", map: "Map", filters: "Filters", key: "Key", close: "Close",
    shown: (n) => `${n} on the map`, none: "Nothing in this category on the map",
    here: (n) => `${n} here`, myLocation: "My location",
    me: "You are here (kept on this device only)", noGeo: "Couldn't find your location. Check the browser's location permission.",
    km: "km", open: "See details", skip: "Skip the map", loadFail: "The map couldn't load",
    exact: "Exact place", area: "Approximate area", highlight: "Mine", areaNote: "Approximate location (area)",
  },
};

/** Basemaps. "auto" follows the device's light/dark setting. */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_";
const ESRI_CREDIT = "© Esri, HERE, Garmin, © OpenStreetMap contributors";
export const BASEMAPS = {
  light: [`${ESRI}Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
  dark: [`${ESRI}Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
  streets: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kmBetween = (a, b) => {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

/**
 * One thing on the map. Only `id`, `lat`, `lng` and `title` are required.
 * @typedef {object} Point
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {string} title
 * @property {string} [icon]       emoji or 1–3 characters drawn in the pin
 * @property {string} [image]      picture for the card
 * @property {string} [href]       where the card links to
 * @property {string[]} [lines]    short lines under the title in the card
 * @property {{text: string, tone?: "ok"|"warn"|"accent"|"muted"}[]} [badges]
 * @property {string[]} [tags]     values the chips filter on
 * @property {"exact"|"area"} [precision]  "area" draws a dashed pin and says so
 * @property {boolean} [highlight] e.g. "you're going": gold pin with a tick
 * @property {boolean} [muted]     e.g. full or closed: a faded pin
 * @property {string} [label]      what a screen reader says for the pin (default: title + first line)
 */

/**
 * @param {HTMLElement} el  where the map goes (it fills the element's width)
 * @param {object} opts
 * @param {Point[]} [opts.points]
 * @param {"th"|"en"} [opts.lang]
 * @param {Partial<typeof MESSAGES.en>} [opts.messages]
 * @param {[number, number]} [opts.center]  [lat, lng] before points arrive
 * @param {number} [opts.zoom]
 * @param {{south:number,west:number,north:number,east:number}} [opts.panLimit]  keep the map inside this box
 * @param {number} [opts.fitMaxZoom]  closest zoom when fitting the points (default 14)
 * @param {"auto"|"light"|"dark"|"streets"|{tiles: string[], attribution?: string}} [opts.basemap]
 * @param {"auto"|{value: string, label: string, icon?: string}[]|false} [opts.chips]  "auto" = from the points' tags
 * @param {Record<string, {label: string, icon?: string}>} [opts.tagLabels]  how "auto" chips name tags
 * @param {{value: string, label: string, icon?: string, test: (p: Point) => boolean}[]} [opts.extraChips]  e.g. "Free"
 * @param {number} [opts.chipLimit]  most "auto" chips shown (default 8)
 * @param {{kind: "exact"|"area"|"highlight"|"swatch", label?: string, color?: string}[]|false} [opts.legend]
 * @param {boolean} [opts.nearMe]  show the "my location" button (default true)
 * @param {(p: Point, ctx: {km: number|null, single: boolean, esc: typeof esc, msgs: object}) => string} [opts.renderCard]  card HTML; escape your values with ctx.esc; `single` = the sheet heading already shows the title
 * @param {(items: Point[]) => string} [opts.groupTitle]  sheet title when several share a spot
 * @param {(items: Point[]) => void} [opts.onSelect]
 * @param {(visible: Point[]) => void} [opts.onFilter]
 * @param {string} [opts.skipHref]  "skip the map" link target (e.g. your list view)
 * @param {{id: string, type: "circle"|"line"|"fill", data: object, paint?: object, before?: string}[]} [opts.overlays]  extra GeoJSON layers
 * @param {any} [opts.maplibregl]  your own MapLibre GL module
 */
export async function createMap(el, opts = {}) {
  const lang = opts.lang ?? (document.documentElement.lang === "en" ? "en" : "th");
  const M = { ...MESSAGES[lang] ?? MESSAGES.en, ...opts.messages };
  const reduce = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("reduce-motion");
  let points = opts.points ?? [];
  let chip = "";
  let me = null;
  let opener = null;
  let markers = [];
  let meMarker = null;
  let ro = null;

  // A newer createMap on the same element wins (e.g. React mounting twice):
  // an older one that finishes loading later stands down without touching the page.
  const token = Symbol("svm");
  el.__svm = token;
  const stale = () => el.__svm !== token;

  // ---- the frame (plain HTML first, so it reads well before the map loads)
  el.classList.add("svm");
  el.innerHTML = `
    ${opts.skipHref ? `<a class="svm-skip" href="${esc(opts.skipHref)}">${esc(M.skip)}</a>` : ""}
    <div class="svm-chips" role="toolbar" aria-label="${esc(M.filters)}" hidden></div>
    <div class="svm-map" role="region" aria-label="${esc(M.map)}">
      <div class="svm-canvas"></div>
      <p class="svm-fallback" hidden>${esc(M.loadFail)}</p>
      ${opts.nearMe === false ? "" : `<button type="button" class="svm-me" aria-label="${esc(M.myLocation)}" title="${esc(M.myLocation)}">◎</button>`}
      <details class="svm-key" hidden><summary>${esc(M.key)}</summary><div class="svm-key-body"></div></details>
      <div class="svm-sheet" role="dialog" aria-labelledby="" hidden>
        <button type="button" class="svm-x" aria-label="${esc(M.close)}">✕</button>
        <h2 class="svm-sheet-h" tabindex="-1"></h2>
        <div class="svm-sheet-body"></div>
      </div>
    </div>
    <p class="svm-count" aria-live="polite"></p>`;
  const $ = (sel) => el.querySelector(sel);
  const sheet = $(".svm-sheet");
  const sheetId = `svm-h-${Math.random().toString(36).slice(2, 8)}`;
  $(".svm-sheet-h").id = sheetId;
  sheet.setAttribute("aria-labelledby", sheetId);

  // ---- the key
  const legend = opts.legend === undefined ? [{ kind: "exact" }, { kind: "area" }, { kind: "highlight" }] : opts.legend;
  if (legend && legend.length) {
    $(".svm-key-body").innerHTML = legend.map((k) => `<p><i class="svm-k ${esc(k.kind)}" aria-hidden="true"${k.color ? ` style="background:${esc(k.color)}"` : ""}>${k.kind === "highlight" ? "✓" : ""}</i> ${esc(k.label ?? M[k.kind] ?? "")}</p>`).join("");
    $(".svm-key").hidden = false;
    $(".svm-key").open = el.clientWidth >= 500;
  }

  // ---- chips
  function chipList() {
    if (opts.chips === false) return [];
    let list = Array.isArray(opts.chips) ? opts.chips : [];
    if (!Array.isArray(opts.chips)) {
      const n = new Map();
      for (const p of points) for (const tag of p.tags ?? []) n.set(tag, (n.get(tag) ?? 0) + 1);
      list = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.chipLimit ?? 8)
        .map(([value]) => ({ value, label: opts.tagLabels?.[value]?.label ?? value, icon: opts.tagLabels?.[value]?.icon }));
    }
    return [...list, ...(opts.extraChips ?? [])];
  }
  function renderChips() {
    const list = chipList();
    const bar = $(".svm-chips");
    bar.hidden = !list.length;
    if (chip && !list.some((c) => c.value === chip)) chip = "";
    bar.innerHTML = [{ value: "", label: M.all, icon: "✨" }, ...list].map((c) =>
      `<button type="button" class="svm-chip${chip === c.value ? " on" : ""}" data-chip="${esc(c.value)}" aria-pressed="${chip === c.value}">${c.icon ? `<span aria-hidden="true">${esc(c.icon)}</span> ` : ""}${esc(c.label)}</button>`).join("");
  }
  const matches = (p) => {
    if (!chip) return true;
    const extra = (opts.extraChips ?? []).find((c) => c.value === chip);
    return extra ? extra.test(p) : (p.tags ?? []).includes(chip);
  };
  $(".svm-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (!b) return;
    chip = b.dataset.chip;
    renderChips();
    closeSheet();
    fit(draw());
  });

  // ---- cards and the sheet
  function defaultCard(p, ctx) {
    const media = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : esc(p.icon ?? "📍");
    const lines = [...(p.lines ?? [])];
    if (ctx.km != null) lines.push(`${ctx.km.toFixed(1)} ${M.km}`);
    const body = `<span class="svm-card-media" aria-hidden="true">${media}</span><span class="svm-card-text">${ctx.single ? "" : `<b>${esc(p.title)}</b>`}
      ${lines.map((l) => `<small>${esc(l)}</small>`).join("")}
      ${p.badges?.length ? `<small class="svm-badges">${p.badges.map((b) => `<em class="${esc(b.tone ?? "")}">${esc(b.text)}</em>`).join(" ")}</small>` : ""}
      ${p.precision === "area" ? `<small class="svm-note">${esc(M.areaNote)}</small>` : ""}</span>`;
    return p.href ? `<a class="svm-card" href="${esc(p.href)}">${body}</a>` : `<div class="svm-card">${body}</div>`;
  }
  const renderCard = opts.renderCard ?? defaultCard;
  function openSheet(group, from) {
    opener = from ?? null;
    const items = group.items.slice();
    if (me) items.sort((a, b) => kmBetween(me, a) - kmBetween(me, b));
    $(".svm-sheet-h").textContent = items.length === 1 ? items[0].title : (opts.groupTitle?.(items) ?? M.here(items.length));
    $(".svm-sheet-body").innerHTML = items.map((p) => renderCard(p, { km: me ? kmBetween(me, p) : null, single: items.length === 1, esc, msgs: M })).join("");
    sheet.hidden = false;
    $(".svm-sheet-h").focus({ preventScroll: true });
    const wide = el.clientWidth >= 600;
    map?.easeTo({ center: [group.lng, group.lat], offset: wide ? [-180, 0] : [0, -90], duration: reduce() ? 0 : 500 });
    opts.onSelect?.(items);
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  $(".svm-x").addEventListener("click", closeSheet);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---- MapLibre
  let ml;
  let map = null;
  try {
    ml = opts.maplibregl ?? (await import(/* @vite-ignore */ `${CDN}/maplibre-gl.mjs`));
    if (!opts.maplibregl && !document.querySelector(`link[href^="${CDN}/maplibre-gl.css"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${CDN}/maplibre-gl.css`;
      document.head.appendChild(css);
    }
  } catch {
    if (!stale()) $(".svm-fallback").hidden = false;
    return api();
  }
  if (stale()) return api();
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const base = opts.basemap ?? "auto";
  const tiles = typeof base === "object" ? base.tiles : BASEMAPS[base === "auto" ? (dark ? "dark" : "light") : base] ?? BASEMAPS.light;
  const credit = typeof base === "object" ? base.attribution ?? "" : base === "streets" ? "© OpenStreetMap contributors" : ESRI_CREDIT;
  const center = opts.center ?? [13.7563, 100.5018];
  const lim = opts.panLimit;
  map = new ml.Map({
    container: $(".svm-canvas"),
    center: [center[1], center[0]],
    zoom: opts.zoom ?? 10.6,
    maxZoom: 18,
    ...(lim ? { maxBounds: [[lim.west, lim.south], [lim.east, lim.north]] } : {}),
    attributionControl: { compact: true },
    style: {
      version: 8,
      sources: Object.fromEntries(tiles.map((t, i) => [`b${i}`, { type: "raster", tiles: [t], tileSize: 256, maxzoom: t.includes("openstreetmap") ? 19 : 16, ...(i === 0 ? { attribution: credit } : {}) }])),
      layers: tiles.map((_, i) => ({ id: `b${i}`, type: "raster", source: `b${i}` })),
    },
  });
  map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
  // Keep the map filling its box when the box changes size (tabs, panels, rotation).
  ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => map?.resize()) : null;
  ro?.observe($(".svm-map"));
  map.on("click", closeSheet);
  if (opts.overlays?.length) {
    map.once("load", () => {
      for (const o of opts.overlays) {
        map.addSource(o.id, { type: "geojson", data: o.data });
        map.addLayer({ id: o.id, type: o.type, source: o.id, ...(o.paint ? { paint: o.paint } : {}) }, o.before);
      }
    });
  }

  // ---- pins: things at the same spot share one pin with a count
  function groups() {
    const by = new Map();
    for (const p of points.filter(matches)) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const k = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      if (!by.has(k)) by.set(k, { lat: p.lat, lng: p.lng, items: [] });
      by.get(k).items.push(p);
    }
    return [...by.values()];
  }
  function pin(group) {
    const b = document.createElement("button");
    b.type = "button";
    const one = group.items.length === 1;
    const p = group.items[0];
    const area = group.items.every((x) => x.precision === "area");
    const hi = group.items.some((x) => x.highlight);
    b.className = `svm-pin${area ? " area" : ""}${hi ? " highlight" : ""}${group.items.every((x) => x.muted) ? " muted" : ""}`;
    b.innerHTML = `<span aria-hidden="true">${esc(one ? (p.icon ?? "") : group.items.length)}</span>${hi ? '<i aria-hidden="true">✓</i>' : ""}`;
    b.setAttribute("aria-label", one ? (p.label ?? [p.title, ...(p.lines ?? []).slice(0, 2)].join(", ")) : M.here(group.items.length) + (opts.groupTitle ? `: ${opts.groupTitle(group.items)}` : ""));
    b.addEventListener("click", (e) => { e.stopPropagation(); openSheet(group, b); });
    return b;
  }
  function draw() {
    for (const m of markers) m.remove();
    const gs = groups();
    markers = gs.map((g) => new ml.Marker({ element: pin(g), anchor: "bottom" }).setLngLat([g.lng, g.lat]).addTo(map));
    const visible = gs.flatMap((g) => g.items);
    $(".svm-count").textContent = visible.length ? M.shown(visible.length) : M.none;
    opts.onFilter?.(visible);
    return gs;
  }
  function fit(gs) {
    if (!gs.length || opts.fit === false) return;
    const b = new ml.LngLatBounds();
    for (const g of gs) b.extend([g.lng, g.lat]);
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 40, right: 40 }, maxZoom: opts.fitMaxZoom ?? 14, duration: reduce() ? 0 : 600 });
  }

  // ---- my location: stays in the browser
  $(".svm-me")?.addEventListener("click", () => {
    if (!navigator.geolocation) return alert(M.noGeo);
    navigator.geolocation.getCurrentPosition((pos) => {
      me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      meMarker?.remove();
      const d = document.createElement("div");
      d.className = "svm-dot";
      d.setAttribute("role", "img");
      d.setAttribute("aria-label", M.me);
      d.title = M.me;
      meMarker = new ml.Marker({ element: d }).setLngLat([me.lng, me.lat]).addTo(map);
      map.flyTo({ center: [me.lng, me.lat], zoom: 13, duration: reduce() ? 0 : 900 });
    }, () => alert(M.noGeo), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  });

  renderChips();
  fit(draw());
  return api();

  /** What the page can do with the map afterwards. */
  function api() {
    return {
      /** The MapLibre map, for anything this template doesn't cover (null if it couldn't load). */
      map,
      /** Replace everything on the map (e.g. after the person changes a filter). */
      setPoints(next, { refit = true } = {}) {
        points = next ?? [];
        renderChips();
        closeSheet();
        if (!map) return;
        const gs = draw();
        if (refit) fit(gs);
      },
      /** Pick a chip by value ("" = all). */
      setFilter(value) {
        chip = value ?? "";
        renderChips();
        if (map) fit(draw());
      },
      /** Open the card for one point, as if it was tapped. */
      select(id) {
        const g = groups().find((x) => x.items.some((p) => p.id === id));
        if (g) openSheet({ ...g, items: g.items.filter((p) => p.id === id) }, null);
      },
      close: closeSheet,
      destroy() {
        for (const m of markers) m.remove();
        ro?.disconnect();
        map?.remove();
        if (stale()) return;
        el.__svm = undefined;
        el.innerHTML = "";
        el.classList.remove("svm");
      },
    };
  }
}
