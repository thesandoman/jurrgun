/**
 * Small location helpers, no map library needed (they also run on a server).
 *
 *   coordsFromMapUrl(url, bounds?)  coordinates inside a pasted map link, or null
 *   inBounds(lat, lng, bounds)      is a point inside a box
 *   kmBetween(a, b)                 straight-line distance in km
 *   placeFor(item, sources)         first position that is known, with how precise it is
 */

/** @typedef {{ south: number, west: number, north: number, east: number }} Bounds */
/** @typedef {{ lat: number, lng: number }} LatLng */

/** @param {number} lat @param {number} lng @param {Bounds} b */
export function inBounds(lat, lng, b) {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/** @param {LatLng} a @param {LatLng} b */
export function kmBetween(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/**
 * Coordinates from a map link, or null. Understands the shapes people paste:
 * Google Maps `@lat,lng` and `!3dlat!4dlng`, `?q=` / `query=` / `ll=` /
 * `destination=` / `center=` with "lat,lng", OpenStreetMap `mlat`/`mlon` and
 * `#map=z/lat/lng`, Apple Maps `ll=`. Short links (maps.app.goo.gl) carry none.
 *
 * @param {string | null | undefined} url
 * @param {Bounds} [bounds] ignore points outside this box (likely a typo)
 * @returns {LatLng | null}
 */
export function coordsFromMapUrl(url, bounds) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let s;
  try {
    s = decodeURIComponent(u.href);
  } catch {
    s = u.href;
  }
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const tries = [
    new RegExp(`!3d${num}!4d${num}`),
    () => [u.searchParams.get("mlat"), u.searchParams.get("mlon")],
    new RegExp(`[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?${num},\\s*${num}`),
    new RegExp(`#map=\\d+(?:\\.\\d+)?/${num}/${num}`),
    new RegExp(`@${num},${num}`),
  ];
  for (const t of tries) {
    const m = typeof t === "function" ? t() : (s.match(t)?.slice(1, 3) ?? [null, null]);
    if (m[0] == null || m[1] == null) continue;
    const lat = Number(m[0]);
    const lng = Number(m[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (bounds && !inBounds(lat, lng, bounds)) continue;
    return { lat, lng };
  }
  return null;
}

/**
 * The first known position for an item, tried in order, with how precise it is.
 * Each source returns `[lat, lng]`, `{lat, lng}` or null. Never guesses: when no
 * source knows, the answer is null and the item stays off the map (show it in a list).
 *
 * @example
 *   placeFor(event, [
 *     ["exact", (e) => coordsFromMapUrl(e.mapUrl, BOUNDS)],
 *     ["area",  (e) => DISTRICT_CENTERS[e.district]],
 *   ])
 *
 * @template T
 * @param {T} item
 * @param {[string, (item: T) => (LatLng | [number, number] | null | undefined)][]} sources
 * @returns {{ lat: number, lng: number, precision: string } | null}
 */
export function placeFor(item, sources) {
  for (const [precision, find] of sources) {
    const p = find(item);
    if (!p) continue;
    const [lat, lng] = Array.isArray(p) ? p : [p.lat, p.lng];
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, precision };
  }
  return null;
}
