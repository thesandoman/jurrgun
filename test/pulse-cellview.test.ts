/**
 * City Pulse tables for the BMA (card D2 applied to admin/pulse.tsx): no
 * hidden cell can be pinned to one value from what is shown, including when
 * a column isn't shown (segment tables show the top 8) or answers sit in an
 * option no longer listed. Brute force, as in rules-suppression.test.ts.
 */
import { describe, expect, it } from "vitest";
import { cellView, placeView } from "../src/routes/admin/pulse";

const MAX = 40;
const opts = (...v: string[]) => v.map((value) => ({ value, th: value, en: value }));
const cellOf = (counts: Record<string, number>, n: number) => ({ n, sum: 0, counts: new Map(Object.entries(counts)) });

/** Every table of the given shape, grouped by what the BMA sees; count hidden values left with one possibility. */
function pinned(see: (a: number, b: number, c: number) => unknown, hiddenOf: (a: number, b: number, c: number) => number[], onlyPeople = false): number {
  const groups = new Map<string, Set<number>[]>();
  for (let a = 0; a <= MAX; a++)
    for (let b = 0; b <= MAX; b++)
      for (let c = 0; c <= MAX; c++) {
        const key = JSON.stringify(see(a, b, c));
        let g = groups.get(key);
        if (!g) groups.set(key, (g = [new Set(), new Set(), new Set()]));
        [a, b, c].forEach((v, i) => g![i].add(v));
      }
  let n = 0;
  for (const [key, g] of groups) {
    const hidden = (JSON.parse(key) as { hidden: number[] }).hidden;
    for (const i of hidden) if (g[i].size === 1 && (!onlyPeople || [...g[i]][0] > 0)) n++;
  }
  return n;
}

describe("City Pulse cellView", () => {
  const all = opts("a", "b", "c");

  it("never pins a hidden cell when every option is shown", () => {
    const see = (a: number, b: number, c: number) => {
      const v = cellView("single", cellOf({ a, b, c }, a + b + c), all);
      const cells = ["a", "b", "c"].map((k) => v.cell(k));
      return { total: v.total, cells, hidden: cells.flatMap((x, i) => (x === null ? [i] : [])) };
    };
    expect(pinned(see, () => [])).toBe(0);
  });

  it("never pins a hidden or unshown cell when only two columns are shown", () => {
    const shown = opts("a", "b");
    const see = (a: number, b: number, c: number) => {
      const v = cellView("single", cellOf({ a, b, c }, a + b + c), all, shown);
      const cells = ["a", "b"].map((k) => v.cell(k));
      return { total: v.total, cells, hidden: [...cells.flatMap((x, i) => (x === null ? [i] : [])), 2] };
    };
    expect(pinned(see, () => [])).toBe(0);
  });

  it("never pins a hidden cell in a place row, where ok and blanks are never shown", () => {
    // a = easy, b = hard, c = ok-or-blank; comfort mirrors reach here.
    const see = (a: number, b: number, c: number) => {
      const [total, easy, hard] = placeView({ n: a + b + c, easy: a, hard: b, cyes: a, cno: b });
      return { total, easy, hard, hidden: [...[easy, hard].flatMap((x, i) => (x === null ? [i] : [])), 2] };
    };
    expect(pinned(see, () => [])).toBe(0);
  });

  it("hides one more cell when only one is hidden, and rounds the total to 10", () => {
    const v = cellView("single", cellOf({ a: 12, b: 3 }, 15), opts("a", "b"));
    expect([v.total, v.cell("a"), v.cell("b")]).toEqual([20, null, null]);
    const w = cellView("single", cellOf({ a: 23, b: 31, c: 47 }, 101), all);
    expect([w.total, w.cell("a"), w.pct("c")]).toEqual([100, 25, 45]);
  });

  it("keeps one of a place's two shown cells hidden, since ok and blanks are always unknown", () => {
    const [total, easy, hard] = placeView({ n: 50, easy: 30, hard: 20, cyes: 30, cno: 20 });
    expect([total, easy, hard]).toEqual([50, 30, null]);
  });

  it("treats answers to an option no longer listed as hidden", () => {
    const v = cellView("single", cellOf({ a: 20, b: 30, gone: 2 }, 52), opts("a", "b"));
    expect(v.total).toBe(50);
    expect([v.cell("a"), v.cell("b")]).toEqual([null, 30]);
  });
});
