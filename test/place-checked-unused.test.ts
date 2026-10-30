/**
 * social_feedback.place_checked is declared in schema.ts only so drizzle-kit stops proposing to drop it;
 * it must never be read or written (privacy, D66: a per-person flag could single out a place check at a
 * small venue). Agreed with Trust & Operations, 2026-10-30.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Every .ts/.tsx file under src/, as [path relative to src, text]. */
const sources = (): [string, string][] =>
  readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => [f, readFileSync(`src/${f}`, "utf8")]);

describe("social_feedback.place_checked", () => {
  it("is used nowhere in src/ except its declaration and the migrations", () => {
    const allowed = new Set(["schema.ts", "migrations.ts"]);
    const uses = sources().filter(([f, text]) => !allowed.has(f) && /placeChecked|place_checked/.test(text)).map(([f]) => f);
    expect(uses).toEqual([]);
  });

  it("is never read by a full-row select on the feedback table", () => {
    const fullRow = sources().filter(([, text]) => /select\(\)\s*\.from\(feedback\)/.test(text)).map(([f]) => f);
    expect(fullRow).toEqual([]);
  });
});
