/** Inclusive dating filters and the optional women-only spaces: pure rules. */
import { describe, expect, it } from "vitest";
import { canBeWomenOnly, romanceCompatible, womenOnlyEventOk, womenOnlyOk } from "../src/domain/rules";
import { deckFor, type PoolMember } from "../src/domain/buddy";
import { scoreEvent, type PlanEvent, type PlanMember } from "../src/domain/plan";
import { datingChips, datingShown } from "../src/ui/profile-card";
import { ARCHETYPE_KEYS } from "../src/vibe/archetypes";

const side = (genderIdentity: string, extra: object = {}) => ({ genderIdentity, romanceOpenTo: "everyone" as const, ...extra });

describe("orientation filter", () => {
  it("is optional, and when set needs the other side's stated orientation", () => {
    expect(romanceCompatible(side("woman"), side("woman"))).toBe(true);
    const filtered = side("woman", { orientationOpenTo: ["lesbian", "bi"] });
    expect(romanceCompatible(filtered, side("woman", { orientation: "lesbian" }))).toBe(true);
    expect(romanceCompatible(filtered, side("woman", { orientation: "straight" }))).toBe(false);
    expect(romanceCompatible(filtered, side("woman"))).toBe(false);
    // Symmetric.
    expect(romanceCompatible(side("woman", { orientation: "straight" }), filtered)).toBe(false);
  });
});

describe("women-only", () => {
  it("only women can switch it on, and it rules out everyone else both ways", () => {
    expect(canBeWomenOnly("woman")).toBe(true);
    expect(canBeWomenOnly("non-binary")).toBe(true);
    expect(canBeWomenOnly("man")).toBe(false);
    expect(canBeWomenOnly(null)).toBe(false);
    const w = { gender: "woman", womenOnly: true };
    expect(womenOnlyOk(w, { gender: "woman" })).toBe(true);
    expect(womenOnlyOk(w, { gender: "man" })).toBe(false);
    expect(womenOnlyOk({ gender: "non-binary" }, w)).toBe(true);
    expect(womenOnlyOk({ gender: "self" }, w)).toBe(false);
    expect(womenOnlyOk({ gender: "man" }, { gender: "woman" })).toBe(true);
    expect(romanceCompatible(side("woman", w), side("man", { gender: "man" }))).toBe(false);
  });

  it("events tagged women_only are for women", () => {
    expect(womenOnlyEventOk(["food"], { gender: null })).toBe(true);
    expect(womenOnlyEventOk(["women_only"], { gender: "woman" })).toBe(true);
    expect(womenOnlyEventOk(["women_only"], { gender: "non-binary" })).toBe(true);
    expect(womenOnlyEventOk(["women_only"], { gender: "man" })).toBe(false);
    expect(womenOnlyEventOk(["women_only"], {})).toBe(false);
  });

  it("the buddy deck leaves out everyone who isn't a woman", () => {
    const m = (id: string, extra: Partial<PoolMember> = {}): PoolMember => ({ accountId: id, archetype: ARCHETYPE_KEYS[0], district: "bang_rak", languages: ["th"], age: 28, ageMin: 18, ageMax: 99, excluded: new Set(), weeksWaiting: 0, ...extra });
    const me = m("me", { gender: "woman", womenOnly: true });
    const pool = [me, m("w", { gender: "woman" }), m("x", { gender: "man" }), m("y"), m("n", { gender: "non-binary" })];
    expect(deckFor(me, pool, new Set(), "d").sort()).toEqual(["n", "w"]);
    // And a man never sees a women-only member.
    expect(deckFor(pool[2], pool, new Set(), "d")).not.toContain("me");
  });

  it("the weekly plan skips women-only events for others", () => {
    const member: PlanMember = { id: "m", age: 28, district: "bang_rak", languages: ["th"], interests: [], typeDistricts: [], activities: [], budgetMax: 300, times: [], access: [] };
    const e: PlanEvent = { id: "e", tags: ["women_only"], district: "bang_rak", costThb: 0, startsAt: new Date("2026-10-17T02:00:00Z"), endsAt: new Date("2026-10-17T04:00:00Z"), languages: ["th"], intensity: "chill", groupMax: 6, ageMin: 18, ageMax: 99, seatsLeft: 5, friendsGoing: 0 };
    const now = new Date("2026-10-12T00:00:00Z");
    expect(scoreEvent(member, e, now)).toBeNull();
    expect(scoreEvent({ ...member, gender: "woman" }, e, now)).not.toBeNull();
  });
});

describe("dating details on a profile", () => {
  const target = { romanceOn: true, relationship: "single", showDatingPrefs: true, orientation: "bi", romanceOpenTo: ["woman", "non-binary"] as string[] };
  it("only shows to a viewer who is also open to dating, and only when opted in", () => {
    expect(datingShown(target, { romanceOn: true, relationship: "single" })).not.toBeNull();
    expect(datingShown(target, { romanceOn: false, relationship: "single" })).toBeNull();
    expect(datingShown({ ...target, showDatingPrefs: false }, { romanceOn: true, relationship: "single" })).toBeNull();
    expect(datingChips(datingShown(target, { romanceOn: true, relationship: "single" })!, "en")).toEqual(["🫶 Bisexual", "💘 Open to Woman, Non-binary"]);
  });
});
