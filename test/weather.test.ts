/**
 * Ticker weather: parsing Open-Meteo responses and the Thai bands.
 */
import { describe, expect, it } from "vitest";
import { bangkokWeather, heatBand, parseWeather, pm25Band } from "../src/services/weather";

describe("parseWeather", () => {
  it("takes the max rain chance over the next 3 hours and sums 24 hours of rain", () => {
    const now = new Date("2026-10-09T10:20:00+07:00").getTime();
    const times = Array.from({ length: 30 }, (_, i) => `2026-10-09T${String(8 + i).padStart(2, "0")}:00`.replace(/T(\d\d)/, (_m, h) => `T${String(Number(h) % 24).padStart(2, "0")}`));
    const w = parseWeather(
      {
        current: { apparent_temperature: 38.46 },
        hourly: {
          time: times,
          precipitation_probability: [5, 10, 30, 75, 40, 0, ...Array(24).fill(0)],
          precipitation: [0, 0, 0.5, 1.2, 0.3, ...Array(25).fill(0.1)],
        },
      },
      { current: { pm2_5: 31.4 } },
      now,
    );
    expect(w.rain3h).toBe(75); // from 09:00 (within the hour) to 11:00
    expect(w.feelsLike).toBe(38.5);
    expect(w.pm25).toBe(31);
    expect(w.rain24h).toBeGreaterThan(1);
  });

  it("copes with missing data", () => {
    const w = parseWeather(null, null);
    expect(w).toMatchObject({ rain3h: null, rain24h: null, feelsLike: null, pm25: null });
  });
});

describe("bands", () => {
  it("uses the Thai PCD PM2.5 scale", () => {
    expect(pm25Band(10).en).toBe("Very good");
    expect(pm25Band(25).en).toBe("Good");
    expect(pm25Band(31).en).toBe("Moderate");
    expect(pm25Band(50).tone).toBe("bad");
    expect(pm25Band(90).en).toBe("Unhealthy");
  });
  it("bands feels-like heat", () => {
    expect(heatBand(30).tone).toBe("ok");
    expect(heatBand(36).tone).toBe("warn");
    expect(heatBand(45).tone).toBe("bad");
  });
});

describe("bangkokWeather", () => {
  it("never calls out when NO_EXTERNAL is set (tests, offline)", async () => {
    expect(await bangkokWeather({ NO_EXTERNAL: "1" })).toBeNull();
  });
});
