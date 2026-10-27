/** Types for sv-map's Bangkok preset, used on the server (src/lib/places.ts). */
export const BANGKOK_CENTER: [number, number];
export const BANGKOK_ZOOM: number;
export const BANGKOK_BOUNDS: { south: number; west: number; north: number; east: number };
export const BANGKOK_PAN_LIMIT: { south: number; west: number; north: number; east: number };
export const BANGKOK_DISTRICTS: { id: string; th: string; en: string; lat: number | null; lng: number | null }[];
export function bangkokDistrict(key: string): (typeof BANGKOK_DISTRICTS)[number] | undefined;
