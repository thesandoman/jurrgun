import { describe, expect, it } from "vitest";
import { deviceKind, IDLE_DAYS, isIdle, needsTouch } from "../src/domain/sessions";

const DAY = 86_400_000;
const now = new Date("2026-10-27T12:00:00Z");

describe("card S4: session rules", () => {
  it("keeps only a coarse device kind", () => {
    expect(deviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148")).toBe("phone");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36")).toBe("phone");
    expect(deviceKind("Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/130 Safari/537.36")).toBe("tablet");
    expect(deviceKind("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("tablet");
    expect(deviceKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15")).toBe("computer");
    expect(deviceKind(undefined)).toBe("computer");
  });
  it("ends a session after 14 days without use, counting from sign-in when never seen", () => {
    expect(IDLE_DAYS).toBe(14);
    expect(isIdle({ lastSeenAt: new Date(now.getTime() - 13 * DAY), createdAt: new Date(now.getTime() - 29 * DAY) }, now)).toBe(false);
    expect(isIdle({ lastSeenAt: new Date(now.getTime() - 14 * DAY), createdAt: new Date(now.getTime() - 20 * DAY) }, now)).toBe(true);
    expect(isIdle({ lastSeenAt: null, createdAt: new Date(now.getTime() - 15 * DAY) }, now)).toBe(true);
  });
  it("writes last seen at most once an hour", () => {
    expect(needsTouch(null, now)).toBe(true);
    expect(needsTouch(new Date(now.getTime() - 59 * 60_000), now)).toBe(false);
    expect(needsTouch(new Date(now.getTime() - 60 * 60_000), now)).toBe(true);
  });
});
