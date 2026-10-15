/** Regular table rules (src/domain/regular-tables.ts): who may join, who sees the table. */
import { describe, expect, it } from "vitest";
import { attendedWithHost, canJoin, canSetWomenOnly, MAX_MEMBERS, tableVisible } from "../src/domain/regular-tables";
import { isGroupKind, parseThread } from "../src/domain/chat";

const base = { archived: false, isHost: false, invited: true, blocked: false, womenOnly: false, viewer: { gender: null }, memberCount: 3 };

describe("regular table rules", () => {
  it("lets an invited member join, and refuses the rest with a reason", () => {
    expect(canJoin(base)).toEqual({ ok: true });
    expect(canJoin({ ...base, invited: false })).toEqual({ ok: false, reason: "no_invite" });
    expect(canJoin({ ...base, memberCount: MAX_MEMBERS })).toEqual({ ok: false, reason: "full" });
    expect(canJoin({ ...base, blocked: true })).toEqual({ ok: false, reason: "blocked" });
    expect(canJoin({ ...base, archived: true })).toEqual({ ok: false, reason: "archived" });
    expect(canJoin({ ...base, isHost: true })).toEqual({ ok: false, reason: "host" });
  });

  it("women-only tables take women and non-binary members only", () => {
    expect(canJoin({ ...base, womenOnly: true, viewer: { gender: "woman" } }).ok).toBe(true);
    expect(canJoin({ ...base, womenOnly: true, viewer: { gender: "non-binary" } }).ok).toBe(true);
    expect(canJoin({ ...base, womenOnly: true, viewer: { gender: "man" } })).toEqual({ ok: false, reason: "women_only" });
    expect(canJoin({ ...base, womenOnly: true, viewer: { gender: null } })).toEqual({ ok: false, reason: "women_only" });
    expect(canSetWomenOnly({ gender: "woman" })).toBe(true);
    expect(canSetWomenOnly({ gender: "man" })).toBe(false);
    expect(canSetWomenOnly({ gender: null })).toBe(false);
  });

  it("hides a table across a block with the host, and a women-only table from men", () => {
    expect(tableVisible({ womenOnly: false }, { gender: "man" }, false)).toBe(true);
    expect(tableVisible({ womenOnly: false }, { gender: "woman" }, true)).toBe(false);
    expect(tableVisible({ womenOnly: true }, { gender: "man" }, false)).toBe(false);
    expect(tableVisible({ womenOnly: true }, { gender: "woman" }, false)).toBe(true);
  });

  it("counts a hangout with the host once it has started, with a confirmed seat", () => {
    const now = new Date();
    expect(attendedWithHost([{ status: "confirmed", startsAt: new Date(now.getTime() - 1000) }], now)).toBe(true);
    expect(attendedWithHost([{ status: "confirmed", startsAt: new Date(now.getTime() + 60_000) }], now)).toBe(false);
    expect(attendedWithHost([{ status: "cancelled", startsAt: new Date(now.getTime() - 1000) }], now)).toBe(false);
  });

  it("has a table thread kind that gets photos and polls", () => {
    expect(parseThread("table:abc_123")).toEqual({ kind: "table", ref: "abc_123" });
    expect(isGroupKind("table")).toBe(true);
    expect(isGroupKind("conn")).toBe(false);
  });
});
