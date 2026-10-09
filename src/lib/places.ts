/**
 * Where an event sits on the Discover map (PRD §7.1 "Venue and map").
 *
 * Built on the `sv-map` package (github:thesandoman/sv-map): its map-link
 * reader, its "first known position, never guess" helper and its Bangkok
 * preset (50 district offices from OpenStreetMap). Each event gets a point
 * from, in order:
 *   1. "exact" — coordinates read from the event's map link, inside Bangkok;
 *   2. "route" — the start of its VisitBangkok City Quest route;
 *   3. "area"  — its district office: shown as an area, never as the venue.
 * Wang Thonglang's office is not in OpenStreetMap, so an event there with no
 * map link has no point (it stays in the list) rather than a guessed one.
 */
import { coordsFromMapUrl as svmCoords, inBounds, placeFor } from "sv-map/places";
import { BANGKOK_BOUNDS, BANGKOK_CENTER, BANGKOK_DISTRICTS, BANGKOK_PAN_LIMIT } from "sv-map/presets/bangkok";

export type Precision = "exact" | "route" | "area";
export type Place = { lat: number; lng: number; precision: Precision };

export const BKK_BOUNDS = BANGKOK_BOUNDS;
export const BKK_CENTER: [number, number] = BANGKOK_CENTER;
export const BKK_PAN_LIMIT = BANGKOK_PAN_LIMIT;

export function inBangkok(lat: number, lng: number): boolean {
  return inBounds(lat, lng, BANGKOK_BOUNDS);
}

/** District office per district value in DISTRICTS (`[lat, lng]`, or null when unknown). */
export const DISTRICT_CENTERS: Record<string, [number, number] | null> = Object.fromEntries(
  BANGKOK_DISTRICTS.map((d) => [d.id, d.lat != null && d.lng != null ? [d.lat, d.lng] : null]),
);

/** Where each VisitBangkok route starts (null when OpenStreetMap has no point for it). Nominatim, 2026-10-09. */
export const ROUTE_STARTS: Record<string, [number, number] | null> = {
  rattanakosin: [13.7493514, 100.4918643], // The Grand Palace
  little_india: [13.7451513, 100.4991592], // Phahurat
  charoenkrung: [13.7334519, 100.5129672], // Talat Noi
  bang_luang: null, // Baan Silapin is not in OpenStreetMap
  yaowarat: [13.7440122, 100.5048047], // Yaowarat Road
  talat_phlu: [13.7208188, 100.4780183], // Talat Phlu
};

/** Coordinates in a pasted map link, only when inside Bangkok (else null). */
export function coordsFromMapUrl(url: string | null | undefined): { lat: number; lng: number } | null {
  return svmCoords(url, BANGKOK_BOUNDS);
}

/** The point an event is drawn at, and how precise it is (see the top of this file). */
export function eventPlace(e: { mapUrl: string | null; district: string; visitBangkokRoute: string | null }): Place | null {
  const p = placeFor(e, [
    ["exact", (x) => coordsFromMapUrl(x.mapUrl)],
    ["route", (x) => (x.visitBangkokRoute ? ROUTE_STARTS[x.visitBangkokRoute] : null)],
    ["area", (x) => DISTRICT_CENTERS[x.district]],
  ]);
  return p ? { lat: p.lat, lng: p.lng, precision: p.precision as Precision } : null;
}
