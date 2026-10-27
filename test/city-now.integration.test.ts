/**
 * Bangkok now (owner card D1): the hourly clock fetches Open-Meteo and Sanroo
 * into social_city_now; pages read that row and say when it's from, and never
 * call an outside site themselves.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { socialCityNow } from "../src/schema";
import { AIR_URL, FORECAST_URL } from "../src/services/weather";
import { SANROO_SUMMARY_URL } from "../src/services/sanroo";
import { CITY, cityNow, refreshCityNow } from "../src/services/city-now";
import { createMember, db, ENV, HAS_DB, req } from "./helpers";

const NOW = new Date("2026-10-26T07:00:00Z"); // 14:00 in Bangkok
const hours = Array.from({ length: 30 }, (_, i) => new Date(NOW.getTime() + (i - 1) * 3_600_000 + 7 * 3_600_000).toISOString().slice(0, 13) + ":00");
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const fake = (opts: { sanroo?: boolean; weather?: boolean } = {}) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    if (u === FORECAST_URL && opts.weather !== false)
      return json({ current: { apparent_temperature: 36.4 }, hourly: { time: hours, precipitation_probability: hours.map(() => 40), precipitation: hours.map(() => 0.5) } });
    if (u === AIR_URL && opts.weather !== false) return json({ current: { pm2_5: 22 } });
    if (u === SANROO_SUMMARY_URL && opts.sanroo !== false) return json({ headlineTh: "ฝนเบาบางฝั่งธนฯ", headlineEn: "Light rain in Thonburi", createdAt: NOW.toISOString() });
    return new Response("down", { status: 503 });
  }) as typeof fetch;

describe.skipIf(!HAS_DB)("Bangkok now, stored by the clock", () => {
  afterAll(async () => {
    await db().delete(socialCityNow).where(eq(socialCityNow.id, CITY));
  });

  it("stores both readings, and a failed hour keeps the last good ones", async () => {
    await db().delete(socialCityNow).where(eq(socialCityNow.id, CITY));
    expect(await cityNow(ENV)).toEqual({ weather: null, sanroo: null });

    expect(await refreshCityNow(ENV, NOW, fake())).toEqual({ weather: true, sanroo: true });
    const first = await cityNow(ENV);
    expect(first.weather).toMatchObject({ feelsLike: 36.4, rain3h: 40, pm25: 22, fetchedAt: NOW.getTime() });
    expect(first.sanroo).toMatchObject({ en: "Light rain in Thonburi" });

    // Everything down: nothing is written, the last reading stays.
    expect(await refreshCityNow(ENV, new Date(NOW.getTime() + 3_600_000), fake({ weather: false, sanroo: false }))).toEqual({ weather: false, sanroo: false });
    expect(await cityNow(ENV)).toEqual(first);

    // Only Sanroo down: the weather moves on, the headline stays.
    const later = new Date(NOW.getTime() + 2 * 3_600_000);
    expect(await refreshCityNow(ENV, later, fake({ sanroo: false }))).toEqual({ weather: true, sanroo: false });
    const third = await cityNow(ENV);
    expect(third.weather?.fetchedAt).toBe(later.getTime());
    expect(third.sanroo).toEqual(first.sanroo);
  });

  it("pages show the stored reading with its time and never call out", async () => {
    await refreshCityNow(ENV, NOW, fake());
    const spy = vi.spyOn(globalThis, "fetch");
    const m = await createMember();
    const pulse = await (await req("/pulse", { cookie: `${m.cookie}; lang=en` })).text();
    expect(pulse).toContain("as of 14:00");
    expect(pulse).toContain("Light rain in Thonburi");
    const th = await (await req("/pulse", { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain("ข้อมูลเมื่อ 14:00");
    const discover = await (await req("/?view=list", { cookie: `${m.cookie}; lang=en` })).text();
    expect(discover).toContain("as of 14:00");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
