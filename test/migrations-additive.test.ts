/**
 * Every migration is additive (owner rule: QA & Release applies additive
 * migrations only). This also guards a known trap: some 0027 columns are
 * deliberately left out of schema.ts (e.g. social_feedback.place_checked), so
 * `npm run db:generate` proposes DROP statements for them. A DROP here would
 * destroy live data; remove it from the generated SQL instead.
 */
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../src/migrations";

describe("migrations", () => {
  it("never drop or truncate anything", () => {
    const bad = MIGRATIONS.flatMap((m) =>
      m.statements.filter((s) => /\b(DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)|TRUNCATE)\b/i.test(s)).map((s) => `${m.id}: ${s.slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });
});
