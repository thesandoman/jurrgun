/** A failed query's log line leads with the database's own reason and never carries the values. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { createLogger } from "../src/logger";

afterEach(() => vi.restoreAllMocks());

function logged(err: Error): string {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  createLogger({}).error("unhandled error", { err });
  return String(spy.mock.calls[0][0]);
}

describe("logging a failed query", () => {
  const long = `select ${'"col", '.repeat(200)}from social_events`;
  const line = logged(new DrizzleQueryError(long, ["account-id-secret"], new Error("could not determine data type of placeholder $1")));

  it("puts the database's reason before the SQL", () => {
    expect(line).toContain("could not determine data type");
    expect(line.indexOf("could not determine data type")).toBeLessThan(line.indexOf("Failed query"));
  });

  it("leaves the values out and shortens the SQL", () => {
    expect(line).not.toContain("account-id-secret");
    expect(line).not.toContain("from social_events");
    expect(line.length).toBeLessThan(600);
  });

  it("leaves other errors' messages alone", () => {
    expect(logged(new Error("plain trouble"))).toContain("plain trouble");
  });
});
