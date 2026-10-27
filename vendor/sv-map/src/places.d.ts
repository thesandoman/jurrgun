/** Types for sv-map's places module, used on the server (src/lib/places.ts). */
export type Bounds = { south: number; west: number; north: number; east: number };
export type LatLng = { lat: number; lng: number };
export function inBounds(lat: number, lng: number, b: Bounds): boolean;
export function kmBetween(a: LatLng, b: LatLng): number;
export function coordsFromMapUrl(url: string | null | undefined, bounds?: Bounds): LatLng | null;
export function placeFor<T>(
  item: T,
  sources: [string, (item: T) => LatLng | [number, number] | null | undefined][],
): { lat: number; lng: number; precision: string } | null;
