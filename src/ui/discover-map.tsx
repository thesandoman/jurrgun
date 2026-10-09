/**
 * The Discover map, built on the `sv-map` package (github:thesandoman/sv-map,
 * the template from the Sanroo live map). The package's browser files are
 * bundled into the app (src/vendor/sv-map.generated.ts) and served at
 * /vendor/sv-map.js and /vendor/sv-map.css.
 *
 * The server turns events into sv-map points (only what an event card already
 * shows: never people, never who is going; your own RSVP shows only to you)
 * and hands them over as JSON. The map always renders, even with no events,
 * and Discover lists the same events underneath it.
 */
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
  };
}

/** JSON for a <script type="application/json"> block, safe against </script>. */
function scriptJson(x: unknown): string {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

export function DiscoverMap(props: { points: MapPoint[]; chips: MapChip[]; t: T; lang: Lang; listHref: string }) {
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
        ? { none: "No events on the map yet", areaNote: "District area: address on the event page" }
        : { none: "ยังไม่มีกิจกรรมบนแผนที่", areaNote: "ระดับเขต ดูที่อยู่ในหน้ากิจกรรม" },
    center: BKK_CENTER,
    panLimit: BKK_PAN_LIMIT,
    skipHref: "#discover-list",
  };
  return (
    <section class="dmap-wrap" aria-label={t("แผนที่กิจกรรม", "Event map")}>
      <link rel="stylesheet" href={`/vendor/sv-map.css?v=${SV_MAP_VERSION}`} />
      <div id="dmap" class="dmap">
        <p class="dmap-loading muted">{t("กำลังโหลดแผนที่…", "Loading the map…")}</p>
      </div>
      <script type="application/json" id="dmap-data" dangerouslySetInnerHTML={{ __html: scriptJson(cfg) }} />
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `import { createMap } from "/vendor/sv-map.js?v=${SV_MAP_VERSION}";
const cfg = JSON.parse(document.getElementById("dmap-data").textContent);
createMap(document.getElementById("dmap"), {
  lang: cfg.lang, points: cfg.points, chips: cfg.chips, legend: cfg.legend, messages: cfg.messages,
  center: cfg.center, panLimit: cfg.panLimit, skipHref: cfg.skipHref,
  extraChips: [{ ...cfg.free, test: (p) => p.free }],
});`,
        }}
      />
    </section>
  );
}

/** App colours for sv-map's CSS variables, plus the list / map switch. */
export const MAP_CSS = `
.view-toggle{display:inline-grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:6px 0 10px;border-radius:12px;background:var(--surface-2)}
.view-toggle a{display:flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:9px;text-decoration:none;color:var(--ink-2);font-weight:600}
.view-toggle a.on{background:var(--surface);color:var(--brand);box-shadow:var(--shadow)}
.dmap-wrap{margin:4px 0 14px}
.dmap{--svm-brand:var(--brand);--svm-highlight:var(--gold);--svm-surface:var(--surface);--svm-surface-2:var(--surface-2);--svm-ink:var(--ink);--svm-muted:var(--ink-3);--svm-line:var(--line);--svm-focus:var(--gold);--svm-ok:var(--ok);--svm-ok-soft:var(--ok-soft);--svm-warn:var(--warn);--svm-warn-soft:var(--warn-soft);--svm-radius:var(--radius);--svm-height:min(58vh,520px);--svm-font:var(--font)}
.dmap-loading{min-height:240px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:var(--radius)}
.discover-list h2{margin-top:6px}
`;
