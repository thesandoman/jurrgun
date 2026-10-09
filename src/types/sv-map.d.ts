/** Types for the parts of the `sv-map` package used on the server. */
declare module "sv-map/places" {
  export type Bounds = { south: number; west: number; north: number; east: number };
  export type LatLng = { lat: number; lng: number };
  export function inBounds(lat: number, lng: number, b: Bounds): boolean;
  export function kmBetween(a: LatLng, b: LatLng): number;
  export function coordsFromMapUrl(url: string | null | undefined, bounds?: Bounds): LatLng | null;
  export function placeFor<T>(
    item: T,
    sources: [string, (item: T) => LatLng | [number, number] | null | undefined][],
  ): { lat: number; lng: number; precision: string } | null;
}

declare module "sv-map/presets/bangkok" {
  export const BANGKOK_CENTER: [number, number];
  export const BANGKOK_ZOOM: number;
  export const BANGKOK_BOUNDS: { south: number; west: number; north: number; east: number };
  export const BANGKOK_PAN_LIMIT: { south: number; west: number; north: number; east: number };
  export const BANGKOK_DISTRICTS: { id: string; th: string; en: string; lat: number | null; lng: number | null }[];
  export function bangkokDistrict(key: string): (typeof BANGKOK_DISTRICTS)[number] | undefined;
}
