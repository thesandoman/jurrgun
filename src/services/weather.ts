/**
 * Bangkok weather and air quality for the Discover ticker (heat, rain and
 * PM2.5 decide whether an outdoor event is pleasant; see the risk register).
 *
 * Source: Open-Meteo (free, no key; attribution required: "Weather data by
 * Open-Meteo.com"). Only the city's own coordinates are sent, never anything
 * about the person. Cached in memory for 15 minutes per isolate; a slow or
 * failed request just leaves the weather out of the ticker.
 */

export type Weather = {
  /** Highest chance of rain in the next 3 hours, %. */
  rain3h: number | null;
  /** Total rain in the next 24 hours, mm. */
  rain24h: number | null;
  /** "Feels like" temperature now, °C. */
  feelsLike: number | null;
  /** PM2.5 now, µg/m³. */
  pm25: number | null;
  fetchedAt: number;
};

const LAT = 13.7563;
const LNG = 100.5018;
const TTL_MS = 15 * 60_000;
const TIMEOUT_MS = 1500;

export const FORECAST_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=apparent_temperature&hourly=precipitation_probability,precipitation&forecast_days=2&timezone=Asia%2FBangkok`;
export const AIR_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LNG}&current=pm2_5&timezone=Asia%2FBangkok`;

type Forecast = {
  current?: { time?: string; apparent_temperature?: number };
  hourly?: { time?: string[]; precipitation_probability?: (number | null)[]; precipitation?: (number | null)[] };
};
type Air = { current?: { pm2_5?: number } };

/** Pure: turn the two API responses into ticker numbers. */
export function parseWeather(f: Forecast | null, a: Air | null, now = Date.now()): Weather {
  const times = f?.hourly?.time ?? [];
  // Open-Meteo hourly times are local (Asia/Bangkok) without an offset.
  const start = times.findIndex((x) => new Date(`${x}:00+07:00`).getTime() >= now - 3_600_000);
  const from = start === -1 ? 0 : start;
  const nums = (xs: (number | null)[] | undefined, n: number) =>
    (xs ?? []).slice(from, from + n).filter((x): x is number => typeof x === "number");
  const p3 = nums(f?.hourly?.precipitation_probability, 3);
  const r24 = nums(f?.hourly?.precipitation, 24);
  return {
    rain3h: p3.length ? Math.max(...p3) : null,
    rain24h: r24.length ? Math.round(r24.reduce((s, x) => s + x, 0) * 10) / 10 : null,
    feelsLike: typeof f?.current?.apparent_temperature === "number" ? Math.round(f.current.apparent_temperature * 10) / 10 : null,
    pm25: typeof a?.current?.pm2_5 === "number" ? Math.round(a.current.pm2_5) : null,
    fetchedAt: now,
  };
}

/** Thai Pollution Control Department bands for PM2.5 (24h, µg/m³; 2023 scale). */
export function pm25Band(v: number): { th: string; en: string; tone: "ok" | "warn" | "bad" } {
  if (v <= 15) return { th: "ดีมาก", en: "Very good", tone: "ok" };
  if (v <= 25) return { th: "ดี", en: "Good", tone: "ok" };
  if (v <= 37.5) return { th: "ปานกลาง", en: "Moderate", tone: "warn" };
  if (v <= 75) return { th: "เริ่มมีผลต่อสุขภาพ", en: "Unhealthy for some", tone: "bad" };
  return { th: "มีผลต่อสุขภาพ", en: "Unhealthy", tone: "bad" };
}

/** Heat index bands (feels-like °C). */
export function heatBand(v: number): { th: string; en: string; tone: "ok" | "warn" | "bad" } {
  if (v < 32) return { th: "สบาย", en: "Comfortable", tone: "ok" };
  if (v < 41) return { th: "ระวัง ดื่มน้ำบ่อย ๆ", en: "Caution, drink water", tone: "warn" };
  if (v < 54) return { th: "อันตราย เลี่ยงกลางแจ้ง", en: "Danger, avoid the midday sun", tone: "bad" };
  return { th: "อันตรายมาก", en: "Extreme danger", tone: "bad" };
}

let cache: Weather | null = null;
let inflight: Promise<Weather | null> | null = null;

export async function bangkokWeather(env: { NO_EXTERNAL?: string }, now = Date.now()): Promise<Weather | null> {
  if (env.NO_EXTERNAL) return null; // tests and offline development
  if (cache && now - cache.fetchedAt < TTL_MS) return cache;
  inflight ??= (async () => {
    try {
      const get = async <T,>(url: string): Promise<T | null> => {
        const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
        return r.ok ? ((await r.json()) as T) : null;
      };
      const [f, a] = await Promise.all([get<Forecast>(FORECAST_URL).catch(() => null), get<Air>(AIR_URL).catch(() => null)]);
      if (!f && !a) return cache; // keep the last good reading, if any
      cache = parseWeather(f, a, now);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
