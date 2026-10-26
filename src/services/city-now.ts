/**
 * Bangkok now (owner card D1, 2026-10-26): the latest Open-Meteo weather and
 * Sanroo headline, kept in one social_city_now row (migration 0030).
 *
 * The hourly clock calls refreshCityNow, which does the outside fetches; pages
 * call cityNow, which is one database read. Before this, pages fetched both
 * sites live with 1.5 s timeouts and a per-isolate cache, so most visits to
 * City Pulse waited on them (about 1.4 s). A part that fails to fetch keeps its
 * last good value; a page with no row yet just leaves the weather out.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, type DatabaseEnv } from "../db";
import { socialCityNow } from "../schema";
import { fetchBangkokWeather, type Weather } from "./weather";
import { fetchSanrooHeadline, type SanrooHeadline } from "./sanroo";

export const CITY = "bangkok";

export type CityNow = { weather: Weather | null; sanroo: SanrooHeadline | null };

const asWeather = (v: unknown): Weather | null =>
  v && typeof v === "object" && typeof (v as Weather).fetchedAt === "number" ? (v as Weather) : null;
const asSanroo = (v: unknown): SanrooHeadline | null =>
  v && typeof v === "object" && typeof (v as SanrooHeadline).th === "string" && typeof (v as SanrooHeadline).en === "string" ? (v as SanrooHeadline) : null;

/** The stored reading. Never throws: no row, or a failed read, is just "nothing to show". */
export async function cityNow(env: DatabaseEnv): Promise<CityNow> {
  try {
    const [row] = await getDb(env)
      .select({ weather: socialCityNow.weather, sanroo: socialCityNow.sanroo })
      .from(socialCityNow)
      .where(eq(socialCityNow.id, CITY))
      .limit(1);
    return { weather: asWeather(row?.weather), sanroo: asSanroo(row?.sanroo) };
  } catch {
    return { weather: null, sanroo: null };
  }
}

/**
 * Fetch both sources and store what worked (the hourly clock). Returns which
 * parts were updated. Skipped in tests and offline development (NO_EXTERNAL)
 * unless a fetcher is passed in. Never throws.
 */
export async function refreshCityNow(
  env: DatabaseEnv & { NO_EXTERNAL?: string },
  now: Date = new Date(),
  get?: typeof fetch,
): Promise<{ weather: boolean; sanroo: boolean }> {
  if (env.NO_EXTERNAL && !get) return { weather: false, sanroo: false };
  try {
    const t = now.getTime();
    const [weather, sanroo] = await Promise.all([fetchBangkokWeather(t, get), fetchSanrooHeadline(t, get)]);
    if (!weather && !sanroo) return { weather: false, sanroo: false };
    await getDb(env)
      .insert(socialCityNow)
      .values({ id: CITY, weather, weatherAt: weather ? now : null, sanroo, sanrooAt: sanroo ? now : null, updatedAt: now })
      .onConflictDoUpdate({
        target: socialCityNow.id,
        // Keep the last good value of a part that failed this hour.
        set: {
          weather: sql`coalesce(excluded.weather, ${socialCityNow.weather})`,
          weatherAt: sql`coalesce(excluded.weather_at, ${socialCityNow.weatherAt})`,
          sanroo: sql`coalesce(excluded.sanroo, ${socialCityNow.sanroo})`,
          sanrooAt: sql`coalesce(excluded.sanroo_at, ${socialCityNow.sanrooAt})`,
          updatedAt: now,
        },
      });
    return { weather: !!weather, sanroo: !!sanroo };
  } catch {
    return { weather: false, sanroo: false };
  }
}
