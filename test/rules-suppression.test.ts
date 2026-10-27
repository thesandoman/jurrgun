/**
 * Card D2: what the BMA sees must not let anyone work out a hidden "<10" cell
 * by subtraction. Brute force over every 3-option table with 0..45 answers per
 * option: group the tables by what is shown, then check that no hidden cell
 * has only one possible true value within its group.
 */
import { describe, expect, it } from "vitest";
import { K_THRESHOLD, roundedCount, safeTable } from "../src/domain/rules";

const MAX = 45;

function pinnedHiddenCells(show: (cells: number[]) => { cells: (number | null)[]; total: number | null }): number {
  const groups = new Map<string, Set<number>[]>();
  for (let a = 0; a <= MAX; a++)
    for (let b = 0; b <= MAX; b++)
      for (let c = 0; c <= MAX; c++) {
        const cells = [a, b, c];
        const key = JSON.stringify(show(cells));
        let g = groups.get(key);
        if (!g) groups.set(key, (g = [new Set(), new Set(), new Set()]));
        cells.forEach((v, i) => g![i].add(v));
      }
  let pinned = 0;
  for (const [key, g] of groups) {
    const shown = (JSON.parse(key) as { cells: (number | null)[] }).cells;
    shown.forEach((x, i) => {
      if (x === null && g[i].size === 1) pinned++;
    });
  }
  return pinned;
}

describe("subtraction-based recovery of hidden cells (card D2)", () => {
  it("exact counts give a hidden cell straight back", () => {
    const exact = (cells: number[]) => ({ cells: cells.map((n) => (n < K_THRESHOLD ? null : n)), total: cells.reduce((a, b) => a + b, 0) });
    expect(pinnedHiddenCells(exact)).toBeGreaterThan(0);
  });

  it("rounding each cell to 5 is not enough on its own", () => {
    const roundedOnly = (cells: number[]) => ({ cells: cells.map((n) => roundedCount(n)), total: roundedCount(cells.reduce((a, b) => a + b, 0)) });
    expect(pinnedHiddenCells(roundedOnly)).toBeGreaterThan(0);
  });

  it("safeTable never lets a hidden cell be pinned to one value", () => {
    expect(pinnedHiddenCells((cells) => {
      const t = safeTable(cells);
      return { cells: t.cells, total: t.total };
    })).toBe(0);
  });

  it("hides one more cell when only one is hidden, and coarsens the total", () => {
    expect(safeTable([23, 31, 4])).toEqual({ cells: [null, 30, null], total: 60, pcts: [null, 50, null] });
    expect(safeTable([23, 31, 47])).toEqual({ cells: [25, 30, 45], total: 100, pcts: [25, 30, 45] });
    expect(safeTable([3, 2])).toEqual({ cells: [null, null], total: null, pcts: [null, null] });
  });
});
