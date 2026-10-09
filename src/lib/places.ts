/**
 * Where an event sits on the Discover map (PRD §7.1 "Venue and map").
 *
 * Events store a district, a venue name and an optional map link, not
 * coordinates. Each event gets a point from, in order:
 *   1. "exact"  — coordinates read from the event's map link (Google Maps,
 *                 OpenStreetMap, Apple Maps), when they are inside Bangkok;
 *   2. "route"  — the start of its VisitBangkok City Quest route;
 *   3. "area"   — its district office: shown as an area, never as the venue.
 * Wang Thonglang's office is not in OpenStreetMap, so an event there with no map
 * link has no point (it stays in the list) rather than a guessed one.
 *
 * Positions: OpenStreetMap (© OpenStreetMap contributors, ODbL). District offices
 * are amenity=townhall (fetched 2026-09-28 for the Sanroo map); route points
 * via Nominatim on 2026-10-09.
 */

export type Precision = "exact" | "route" | "area";
export type Place = { lat: number; lng: number; precision: Precision };

/** Bangkok, with a margin: a map link outside this is ignored (likely a typo). */
export const BKK_BOUNDS = { south: 13.45, north: 14.0, west: 100.3, east: 100.95 };
export const BKK_CENTER: [number, number] = [13.7563, 100.5018];

export function inBangkok(lat: number, lng: number): boolean {
  return lat >= BKK_BOUNDS.south && lat <= BKK_BOUNDS.north && lng >= BKK_BOUNDS.west && lng <= BKK_BOUNDS.east;
}

/** District office per district value in DISTRICTS (`[lat, lng]`, or null when unknown). */
export const DISTRICT_CENTERS: Record<string, [number, number] | null> = {
  phra_nakhon: [13.764582, 100.498843],
  dusit: [13.777082, 100.52055],
  nong_chok: [13.855728, 100.862571],
  bang_rak: [13.730649, 100.523651],
  bang_khen: [13.873269, 100.596215],
  bang_kapi: [13.765588, 100.647692],
  pathum_wan: [13.74475, 100.522179],
  pom_prap: [13.758176, 100.513137],
  phra_khanong: [13.702093, 100.601768],
  min_buri: [13.813794, 100.731645],
  lat_krabang: [13.723446, 100.783931],
  yan_nawa: [13.696192, 100.542299],
  samphanthawong: [13.731564, 100.513795],
  phaya_thai: [13.77983, 100.542522],
  thon_buri: [13.724935, 100.485677],
  bangkok_yai: [13.72339, 100.476194],
  huai_khwang: [13.776676, 100.579435],
  khlong_san: [13.730614, 100.509205],
  taling_chan: [13.776946, 100.456321],
  bangkok_noi: [13.762778, 100.478104],
  bang_khun_thian: [13.660896, 100.43542],
  phasi_charoen: [13.714713, 100.436993],
  nong_khaem: [13.705511, 100.34918],
  rat_burana: [13.682062, 100.505679],
  bang_phlat: [13.794049, 100.504919],
  din_daeng: [13.769931, 100.553162],
  bueng_kum: [13.785424, 100.669524],
  sathon: [13.708099, 100.526165],
  bang_sue: [13.809666, 100.537371],
  chatuchak: [13.828777, 100.559936],
  bang_kho_laem: [13.693018, 100.502372],
  prawet: [13.717059, 100.69472],
  khlong_toei: [13.708097, 100.583609],
  suan_luang: [13.730387, 100.651472],
  chom_thong: [13.677421, 100.484222],
  don_mueang: [13.910253, 100.594858],
  ratchathewi: [13.75903, 100.534346],
  lat_phrao: [13.803524, 100.607618],
  watthana: [13.742359, 100.586036],
  bang_khae: [13.695944, 100.409276],
  lak_si: [13.887408, 100.579121],
  sai_mai: [13.895243, 100.660816],
  khan_na_yao: [13.799406, 100.682726],
  saphan_sung: [13.76886, 100.685738],
  wang_thonglang: null,
  khlong_sam_wa: [13.859528, 100.704177],
  bang_na: [13.667536, 100.641933],
  thawi_watthana: [13.772973, 100.353341],
  thung_khru: [13.611647, 100.508516],
  bang_bon: [13.633915, 100.368767],
};

/** Where each VisitBangkok route starts (null when OpenStreetMap has no point for it). */
export const ROUTE_STARTS: Record<string, [number, number] | null> = {
  rattanakosin: [13.7493514, 100.4918643], // The Grand Palace
  little_india: [13.7451513, 100.4991592], // Phahurat
  charoenkrung: [13.7334519, 100.5129672], // Talat Noi
  bang_luang: null, // Baan Silapin is not in OpenStreetMap
  yaowarat: [13.7440122, 100.5048047], // Yaowarat Road
  talat_phlu: [13.7208188, 100.4780183], // Talat Phlu
};

/**
 * Coordinates from a map link, or null. Understands the shapes people paste:
 * Google Maps `@lat,lng` and `!3dlat!4dlng`, `?q=` / `query=` / `ll=` /
 * `destination=` / `center=` with "lat,lng", OpenStreetMap `mlat`/`mlon`
 * and `#map=z/lat/lng`. Short links (maps.app.goo.gl) carry no coordinates.
 */
export function coordsFromMapUrl(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const s = decodeURIComponent(u.href);
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const tries: (RegExp | (() => [string | null, string | null]))[] = [
    new RegExp(`!3d${num}!4d${num}`),
    () => [u.searchParams.get("mlat"), u.searchParams.get("mlon")],
    new RegExp(`[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?${num},\\s*${num}`),
    new RegExp(`#map=\\d+(?:\\.\\d+)?/${num}/${num}`),
    new RegExp(`@${num},${num}`),
  ];
  for (const t of tries) {
    const m = typeof t === "function" ? t() : s.match(t)?.slice(1, 3) ?? [null, null];
    const lat = Number(m[0]);
    const lng = Number(m[1]);
    if (m[0] != null && m[1] != null && Number.isFinite(lat) && Number.isFinite(lng) && inBangkok(lat, lng)) return { lat, lng };
  }
  return null;
}

/** The point an event is drawn at, and how precise it is (see the top of this file). */
export function eventPlace(e: { mapUrl: string | null; district: string; visitBangkokRoute: string | null }): Place | null {
  const exact = coordsFromMapUrl(e.mapUrl);
  if (exact) return { ...exact, precision: "exact" };
  const route = e.visitBangkokRoute ? ROUTE_STARTS[e.visitBangkokRoute] : null;
  if (route) return { lat: route[0], lng: route[1], precision: "route" };
  const area = DISTRICT_CENTERS[e.district];
  if (area) return { lat: area[0], lng: area[1], precision: "area" };
  return null;
}
