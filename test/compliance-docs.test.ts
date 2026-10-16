/**
 * The compliance documents against the code: the record of processing must
 * name every retention constant (so a new or renamed period can't slip past
 * it), and neither document may carry dashes or bracketed placeholders.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as retention from "../src/services/retention";

const RECORD = readFileSync("design/reference/record-of-processing.md", "utf8");
const BREACH = readFileSync("design/reference/breach-response-plan.md", "utf8");

/** Exported constants (UPPER_CASE names), not functions or types. */
const CONSTANTS = Object.entries(retention)
  .filter(([name, value]) => /^[A-Z][A-Z0-9_]*$/.test(name) && typeof value !== "function")
  .map(([name, value]) => ({ name, value }));

describe("record of processing", () => {
  it("finds the retention constants", () => {
    expect(CONSTANTS.length).toBeGreaterThan(5);
  });

  it.each(CONSTANTS)("names $name with its value", ({ name, value }) => {
    expect(RECORD).toContain(`\`${name}\``);
    if (typeof value === "number") {
      // The value appears in the same table row as the name.
      const row = RECORD.split("\n").find((l) => l.startsWith(`| \`${name}\``));
      expect(row, `${name} needs a row in the retention table`).toBeDefined();
      expect(row!.replace(/,/g, "")).toContain(String(value));
    }
  });
});

describe.each([
  ["record-of-processing.md", RECORD],
  ["breach-response-plan.md", BREACH],
])("%s", (_name, text) => {
  it("has no em or en dashes", () => {
    expect(text).not.toMatch(/[–—]/);
  });

  it("has no bracketed placeholders", () => {
    // Square brackets only as Markdown links; no <angle> or {{curly}} fill-ins, no TBD or TODO.
    expect(text).not.toMatch(/\[[^\]]*\](?!\()/);
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
    expect(text).not.toMatch(/\{\{/);
    expect(text).not.toMatch(/\b(TBD|TODO|XXX)\b/);
  });
});
