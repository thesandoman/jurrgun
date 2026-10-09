/**
 * Matching experiment: Irving's stable roommates and the group clearinghouse.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/vibe/content";
import { createRng, shuffle } from "../src/vibe/rng";
import { canPair, romanceCompatible, preferenceList, type Profile } from "../src/match/profile";
import { blockingPairs, stableRoommates, type Preferences } from "../src/match/roommates";
import { formGroups, groupSizes } from "../src/match/clearinghouse";

function person(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    vibe: Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Profile["vibe"],
    interests: [],
    languages: ["th"],
    age: 28,
    ageRange: [18, 99],
    intents: ["friends"],
    ...overrides,
  };
}

/** Every perfect-or-partial matching of a small set, for brute-force checks. */
function allMatchings(ids: string[], prefs: Preferences): [string, string][][] {
  if (ids.length === 0) return [[]];
  const [x, ...rest] = ids;
  const out = allMatchings(rest, prefs); // x unmatched
  for (const y of rest) {
    if (!(prefs.get(x)?.includes(y) && prefs.get(y)?.includes(x))) continue;
    for (const m of allMatchings(rest.filter((z) => z !== y), prefs)) out.push([[x, y], ...m]);
  }
  return out;
}

function randomPrefs(seed: string, n: number, density: number): Preferences {
  const rng = createRng(seed);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const ok = new Set<string>();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rng() < density) ok.add(`${i}-${j}`);
  const prefs: Preferences = new Map();
  ids.forEach((x, i) => {
    const acceptable = ids.filter((_, j) => j !== i && ok.has(i < j ? `${i}-${j}` : `${j}-${i}`));
    prefs.set(x, shuffle(rng, acceptable));
  });
  return prefs;
}

describe("stableRoommates", () => {
  it("solves the classic 4-person instance with no stable matching", () => {
    // a, b, c each rank each other cyclically and all rank d last.
    const prefs: Preferences = new Map([
      ["a", ["b", "c", "d"]],
      ["b", ["c", "a", "d"]],
      ["c", ["a", "b", "d"]],
      ["d", ["a", "b", "c"]],
    ]);
    expect(stableRoommates(prefs).stable).toBe(false);
  });

  it("finds a stable matching when one exists", () => {
    const prefs: Preferences = new Map([
      ["a", ["b", "c", "d"]],
      ["b", ["a", "d", "c"]],
      ["c", ["d", "a", "b"]],
      ["d", ["c", "b", "a"]],
    ]);
    const r = stableRoommates(prefs);
    expect(r.stable).toBe(true);
    if (r.stable) expect(r.pairs).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("agrees with brute force on 300 random small instances", () => {
    for (let t = 0; t < 300; t++) {
      const n = 3 + (t % 6); // 3..8 people
      const prefs = randomPrefs(`bf${t}`, n, 0.75);
      const ids = [...prefs.keys()];
      const anyStable = allMatchings(ids, prefs).some((m) => blockingPairs(prefs, m).length === 0);
      const r = stableRoommates(prefs);
      expect(r.stable, `instance ${t}`).toBe(anyStable);
      if (r.stable) {
        expect(blockingPairs(prefs, r.pairs), `instance ${t}`).toEqual([]);
        const everyone = [...r.pairs.flat(), ...r.unmatched].sort();
        expect(everyone).toEqual(ids.slice().sort());
      }
    }
  });
});

describe("pairing rules", () => {
  it("never pairs people without a shared language, outside age ranges, or blocked", () => {
    expect(canPair(person("a"), person("b", { languages: ["en"] }))).toBe(false);
    expect(canPair(person("a", { languages: ["th", "en"] }), person("b", { languages: ["en"] }))).toBe(true);
    expect(canPair(person("a", { ageRange: [20, 25] }), person("b", { age: 40 }))).toBe(false);
    expect(canPair(person("a", { blocked: ["b"] }), person("b"))).toBe(false);
    expect(canPair(person("a", { intents: ["romance"] }), person("b"))).toBe(false);
  });

  it("romance needs both eligible and inside each other's 'open to', for any identities", () => {
    const w1 = person("w1", { intents: ["friends", "romance"], romance: { eligible: true, identity: "woman", openTo: ["woman"] } });
    const w2 = person("w2", { intents: ["romance"], romance: { eligible: true, identity: "woman", openTo: ["woman", "non-binary"] } });
    const nb = person("nb", { intents: ["romance"], romance: { eligible: true, identity: "non-binary", openTo: "everyone" } });
    const m = person("m", { intents: ["romance"], romance: { eligible: true, identity: "man", openTo: ["woman"] } });
    const married = person("x", { intents: ["romance"], romance: { eligible: false, identity: "woman", openTo: "everyone" } });
    expect(romanceCompatible(w1, w2)).toBe(true);
    expect(romanceCompatible(w2, nb)).toBe(true);
    expect(romanceCompatible(w1, nb)).toBe(false); // w1 open to women only
    expect(romanceCompatible(m, w1)).toBe(false); // w1 not open to men
    expect(romanceCompatible(nb, married)).toBe(false);
    expect(romanceCompatible(person("f1"), person("f2"))).toBe(false); // friends-only never enter
  });

  it("preference lists only contain people one can actually be paired with", () => {
    const a = person("a", { languages: ["en"] });
    const others = [person("b"), person("c", { languages: ["en", "th"] })];
    expect(preferenceList(a, others)).toEqual(["c"]);
  });
});

describe("formGroups", () => {
  const crowd = (n: number, seed: string): Profile[] => {
    const rng = createRng(seed);
    return Array.from({ length: n }, (_, i) =>
      person(`u${i}`, {
        vibe: Object.fromEntries(CATEGORIES.map((c) => [c, rng() * 2 - 1])) as Profile["vibe"],
        interests: ["food", "art", "run", "games"].filter(() => rng() < 0.5),
        languages: i % 5 === 0 ? ["en"] : i % 3 === 0 ? ["th", "en"] : ["th"],
      }),
    );
  };

  it("splits into balanced tables within size limits", () => {
    expect(groupSizes(5, 4, 6)).toEqual([5]);
    expect(groupSizes(13, 4, 6)).toEqual([5, 4, 4]);
    expect(groupSizes(24, 4, 6)).toEqual([6, 6, 6, 6]);
    const r = formGroups(crowd(23, "s"), { seed: "s" });
    for (const g of r.groups) {
      expect(g.length).toBeGreaterThanOrEqual(4);
      expect(g.length).toBeLessThanOrEqual(6);
    }
    expect(r.groups.flat().sort()).toEqual(crowd(23, "s").map((p) => p.id).sort());
  });

  it("stable method leaves no blocking swaps and beats random", () => {
    const people = crowd(30, "t");
    const stable = formGroups(people, { seed: "t", method: "stable" });
    const random = formGroups(people, { seed: "t", method: "random" });
    expect(stable.metrics.blockingSwaps).toBe(0);
    expect(stable.metrics.meanUtility).toBeGreaterThan(random.metrics.meanUtility);
    expect(stable.metrics.isolated).toBe(0);
  });

  it("keeps +1 friends together and never seats blocked people together", () => {
    const people = crowd(20, "k");
    people[3].blocked = ["u4"];
    const r = formGroups(people, { seed: "k", keepTogether: [["u1", "u2"]] });
    const g1 = r.groups.find((g) => g.includes("u1"))!;
    expect(g1).toContain("u2");
    expect(r.metrics.blockedConflicts).toBe(0);
  });
});
