/**
 * The simple Bangkok map behind the quiz's "map tap" questions: where each
 * answer's district sits, projected onto a small box, plus an outline of the
 * city and the Chao Phraya to draw under the pins. Built on the server from
 * the 50 district offices (src/lib/places.ts), so the browser only ever gets
 * x/y positions, never a district key or a type.
 */
import { DISTRICT_CENTERS } from "../lib/places";

/** Map box: 100 wide, MAP_H tall (Bangkok is wider than it is tall). */
export const MAP_W = 100;

type LatLng = [number, number];

/** Wang Thonglang's office is not in OpenStreetMap; its approximate centre. */
const FALLBACK: Record<string, LatLng> = { wang_thonglang: [13.78, 100.607] };

const known = Object.entries(DISTRICT_CENTERS).filter((e): e is [string, LatLng] => e[1] !== null);
const PAD = 0.035;
const lat0 = Math.min(...known.map((e) => e[1][0])) - PAD;
const lat1 = Math.max(...known.map((e) => e[1][0])) + PAD;
const lng0 = Math.min(...known.map((e) => e[1][1])) - PAD;
const lng1 = Math.max(...known.map((e) => e[1][1])) + PAD;
const COS = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
const SCALE = MAP_W / ((lng1 - lng0) * COS);
export const MAP_H = Math.round((lat1 - lat0) * SCALE);

const round = (n: number) => Math.round(n * 10) / 10;

export function project([lat, lng]: LatLng): { x: number; y: number } {
  return { x: round((lng - lng0) * COS * SCALE), y: round((lat1 - lat) * SCALE) };
}

export function districtPoint(district: string): { x: number; y: number } {
  const c = DISTRICT_CENTERS[district] ?? FALLBACK[district] ?? null;
  return c ? project(c) : { x: MAP_W / 2, y: MAP_H / 2 };
}

/** Pins closer than this (map units) are nudged apart so each one can be tapped. */
const MIN_GAP = 13;
/** How far (in % of the box) a pin's centre stays from the edge. */
const EDGE = 8;

/**
 * One pin per answer at its district, nudged apart where two districts are
 * close (or the same), and kept inside the map. Returned in % of the box so
 * the browser can place them with plain CSS.
 */
export function pinsFor(districts: string[]): { x: number; y: number }[] {
  const pts = districts.map((d, i) => {
    const p = districtPoint(d);
    // Same spot: start them on a small circle so the push has a direction.
    const a = (i / districts.length) * 2 * Math.PI;
    return { x: p.x + Math.cos(a) * 0.5, y: p.y + Math.sin(a) * 0.5 };
  });
  const m = 5;
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= MIN_GAP) continue;
        const push = (MIN_GAP - d) / 2;
        pts[i].x -= (dx / d) * push;
        pts[i].y -= (dy / d) * push;
        pts[j].x += (dx / d) * push;
        pts[j].y += (dy / d) * push;
        moved = true;
      }
    }
    for (const p of pts) {
      p.x = Math.max(m, Math.min(MAP_W - m, p.x));
      p.y = Math.max(m, Math.min(MAP_H - m, p.y));
    }
    if (!moved) break;
  }
  // Pins are drawn centred on their spot: keep each whole pin inside the box.
  const inside = (v: number) => round(Math.max(EDGE, Math.min(100 - EDGE, v)));
  return pts.map((p) => ({ x: inside((p.x / MAP_W) * 100), y: inside((p.y / MAP_H) * 100) }));
}

/** Convex hull of the district offices, a little outside them: the city's rough shape. */
function hull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof p = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: typeof p = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function outlinePath(): string {
  const pts = known.map((e) => project(e[1]));
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
  const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const h = hull(pts).map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: round(p.x + (dx / d) * 4), y: round(p.y + (dy / d) * 4) };
  });
  // Rounded corners: a quadratic curve through each hull point's midpoints.
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => `${round((a.x + b.x) / 2)} ${round((a.y + b.y) / 2)}`;
  let d = `M${mid(h[h.length - 1], h[0])}`;
  for (let i = 0; i < h.length; i++) d += `Q${h[i].x} ${h[i].y} ${mid(h[i], h[(i + 1) % h.length])}`;
  return `${d}Z`;
}

/** The Chao Phraya through the city, north to south, approximately (with the Bang Krachao loop). */
const RIVER: LatLng[] = [
  [13.86, 100.507], [13.82, 100.515], [13.79, 100.513], [13.77, 100.499], [13.752, 100.49],
  [13.735, 100.508], [13.718, 100.513], [13.705, 100.53], [13.695, 100.548], [13.68, 100.565],
  [13.663, 100.553], [13.672, 100.531], [13.66, 100.512], [13.635, 100.53], [13.6, 100.56],
];

function riverPath(): string {
  const p = RIVER.map(project);
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) d += `Q${p[i].x} ${p[i].y} ${round((p[i].x + p[i + 1].x) / 2)} ${round((p[i].y + p[i + 1].y) / 2)}`;
  return `${d}L${p[p.length - 1].x} ${p[p.length - 1].y}`;
}

export const MAP_OUTLINE = outlinePath();
export const MAP_RIVER = riverPath();
