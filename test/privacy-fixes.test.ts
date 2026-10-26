/**
 * Privacy arithmetic that needs no database: City Pulse segment suppression
 * and Bangkok-time ages.
 */
import { describe, expect, it } from "vitest";
import { segmentRows } from "../src/routes/admin/pulse";
import { ageOn, roundedCount, roundedPct } from "../src/domain/rules";
import { bkkDayStart } from "../src/domain/pulse-heard";

const cellOf = (n: number, yes: number) => ({ n, sum: 0, counts: new Map([["yes", yes], ["no", n - yes]]) });

describe("City Pulse segments", () => {
  it("never leaves a small 'other' group that overall minus the shown rows would reveal", () => {
    // 12 in A, 3 in B: showing A exactly would expose B (15 - 12).
    const rows = segmentRows(new Map([["a", cellOf(12, 10)], ["b", cellOf(3, 3)]]), (k) => k, "Other");
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("other");
    expect(rows[0].cell.n).toBe(15);
  });

  it("folds only as many rows as needed and keeps big ones", () => {
    const rows = segmentRows(new Map([["a", cellOf(40, 20)], ["b", cellOf(11, 5)], ["c", cellOf(4, 1)]]), (k) => k, "Other");
    expect(rows.map((r) => r.key)).toEqual(["a", "other"]);
    expect(rows.find((r) => r.key === "other")!.cell.n).toBe(15);
  });

  it("leaves things alone when nothing is small", () => {
    const rows = segmentRows(new Map([["a", cellOf(10, 5)], ["b", cellOf(12, 6)]]), (k) => k, "Other");
    expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
  });
});

describe("ageOn", () => {
  it("uses the date in Bangkok, not UTC", () => {
    // 1 Jan 2026, 02:00 in Bangkok = 31 Dec 2025, 19:00 UTC: already the 18th birthday.
    expect(ageOn("2008-01-01", new Date("2025-12-31T19:00:00Z"))).toBe(18);
    expect(ageOn("2008-01-01", new Date("2025-12-31T16:59:00Z"))).toBe(17);
  });
});

describe("rounded counts (C1)", () => {
  it("hides under 10 and rounds the rest to the nearest 5", () => {
    expect(roundedCount(0)).toBeNull();
    expect(roundedCount(9)).toBeNull();
    expect([10, 12, 13, 17, 18, 102].map((n) => roundedCount(n))).toEqual([10, 10, 15, 15, 20, 100]);
  });

  it("works percentages out from the rounded counts", () => {
    expect(roundedPct(12, 15)).toBe(67); // 10 of 15
    expect(roundedPct(3, 15)).toBeNull();
    expect(roundedPct(12, 9)).toBeNull();
  });

  it("puts the daily snapshot at 00:00 Bangkok", () => {
    // 26 Oct 2026, 01:30 in Bangkok = 25 Oct 18:30 UTC; the day started at 25 Oct 17:00 UTC.
    expect(bkkDayStart(new Date("2026-10-25T18:30:00Z")).toISOString()).toBe("2026-10-25T17:00:00.000Z");
    expect(bkkDayStart(new Date("2026-10-25T16:59:00Z")).toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });
});
