/**
 * Bangkok Buddy rules: weekly clearinghouse (stable roommates, Pareto
 * fallback, reservation levels), quests and the romance gate.
 */
import { describe, expect, it } from "vitest";
import {
  buddyPreferences,
  clearBuddies,
  deckFor,
  pairScore,
  paretoImprove,
  pickQuest,
  questText,
  reservation,
  romanceUnlocked,
  weekKey,
  type PoolMember,
} from "../src/domain/buddy";
import { blockingPairs, type Preferences } from "../src/match/roommates";
import { ARCHETYPE_KEYS, type ArchetypeKey } from "../src/vibe/archetypes";
import { DISTRICTS } from "../src/lib/constants";

const member = (id: string, archetype: ArchetypeKey, extra: Partial<PoolMember> = {}): PoolMember => ({
  accountId: id,
  archetype,
  district: "bang_rak",
  languages: ["th", "en"],
  age: 28,
  ageMin: 18,
  ageMax: 99,
  excluded: new Set(),
  weeksWaiting: 0,
  ...extra,
});

/** A Pareto improvement still available in `pairs`, if any (same test as paretoImprove applies). */
function improvable(prefs: Preferences, pairs: [string, string][]): boolean {
  const before = JSON.stringify([...pairs].map((p) => [...p].sort()).sort());
  const after = JSON.stringify(paretoImprove(prefs, pairs).map((p) => [...p].sort()).sort());
  return before !== after;
}

describe("weekKey", () => {
  it("uses ISO weeks in Bangkok time", () => {
    expect(weekKey(new Date("2026-10-13T05:00:00Z"))).toBe("2026-W42");
    // Sunday 23:30 Bangkok is still the old week; Monday 00:30 Bangkok is the new one.
    expect(weekKey(new Date("2026-10-18T16:30:00Z"))).toBe("2026-W42");
    expect(weekKey(new Date("2026-10-18T17:30:00Z"))).toBe("2026-W43");
    expect(weekKey(new Date("2027-01-01T05:00:00Z"))).toBe("2026-W53");
  });
});

describe("preferences come only from what people told us", () => {
  it("needs a shared language; types that click and a shared district score higher", () => {
    expect(pairScore(member("a", "BDSH", { languages: ["th"] }), member("b", "CDSH", { languages: ["en"] }))).toBeNull();
    const clicks = pairScore(member("a", "BDSH"), member("b", "CDSH"))!;
    const far = pairScore(member("a", "BDSH", { district: "nong_chok" }), member("b", "CFMN", { district: "bang_bon" }))!;
    expect(clicks).toBeGreaterThan(far);
    expect(pairScore(member("a", "BDSH"), member("b", "CDSH"))).toBe(pairScore(member("b", "CDSH"), member("a", "BDSH")));
  });

  it("never lists someone blocked, a past buddy, or anyone outside either person's age range", () => {
    const pool = [
      member("a", "BDSH", { excluded: new Set(["b"]) }),
      member("b", "CDSH"),
      member("c", "BFSH", { age: 45 }),
      member("d", "BDMH", { ageMax: 25 }),
      member("e", "CDMH"),
    ];
    const prefs = buddyPreferences(pool, "w");
    expect(prefs.get("a")).not.toContain("b");
    expect(prefs.get("b")).not.toContain("a");
    expect(prefs.get("d")).toEqual([]);
    expect(prefs.get("a")).not.toContain("d");
    expect(prefs.get("c")).toContain("a");
  });

  it("the reservation bar eases each week someone waits (optimal search)", () => {
    expect(reservation(0)).toBe(4);
    expect(reservation(2)).toBe(2);
    expect(reservation(4)).toBe(0);
    expect(reservation(10)).toBe(0);
    // A weak fit: different districts, types that don't click.
    const a = member("a", "BDSN", { district: "nong_chok" });
    const b = member("b", "CFMH", { district: "bang_bon", languages: ["th"] });
    const weak = pairScore(a, b)!;
    expect(weak).toBeLessThan(reservation(0));
    expect(clearBuddies([a, b], "w").pairs).toEqual([]);
    expect(clearBuddies([{ ...a, weeksWaiting: 4 }, { ...b, weeksWaiting: 4 }], "w").pairs).toHaveLength(1);
  });
});

describe("weekly clearinghouse", () => {
  const pool = (n: number, salt: number) =>
    Array.from({ length: n }, (_, i) =>
      member(`p${i}`, ARCHETYPE_KEYS[(i * 7 + salt) % 16], {
        district: DISTRICTS[(i * 3 + salt) % 6].value,
        weeksWaiting: (i + salt) % 5,
        languages: i % 5 === 0 ? ["en"] : ["th", "en"],
      }),
    );

  it("matches each person at most once, only with someone they both accept", () => {
    for (let s = 0; s < 30; s++) {
      const p = pool(40, s);
      const prefs = buddyPreferences(p, `w${s}`);
      const r = clearBuddies(p, `w${s}`);
      const seen = r.pairs.flat();
      expect(new Set(seen).size).toBe(seen.length);
      for (const [a, b] of r.pairs) {
        expect(prefs.get(a)).toContain(b);
        expect(prefs.get(b)).toContain(a);
      }
      expect(seen.length + r.unmatched.length).toBe(p.length);
    }
  });

  it("stable rounds have no blocking pair; every round is Pareto optimal", () => {
    let stable = 0;
    for (let s = 0; s < 30; s++) {
      const p = pool(40, s);
      const prefs = buddyPreferences(p, `w${s}`);
      const r = clearBuddies(p, `w${s}`);
      if (r.method === "stable") {
        stable += 1;
        expect(blockingPairs(prefs, r.pairs)).toEqual([]);
      }
      expect(improvable(prefs, r.pairs)).toBe(false);
    }
    expect(stable).toBeGreaterThan(0);
  });

  it("the Pareto step swaps partners only when nobody loses", () => {
    // a and c prefer each other, as do b and d; the start pairs them badly.
    const prefs: Preferences = new Map([
      ["a", ["c", "b"]],
      ["b", ["d", "a"]],
      ["c", ["a", "d"]],
      ["d", ["b", "c"]],
    ]);
    const out = paretoImprove(prefs, [
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(out.map((p) => p.join("")).sort()).toEqual(["ac", "bd"]);
    // Two people left alone who accept each other get paired.
    const alone = paretoImprove(new Map([["x", ["y"]], ["y", ["x"]]]), []);
    expect(alone).toEqual([["x", "y"]]);
    // A swap that makes someone worse off is never made.
    const mixed: Preferences = new Map([
      ["a", ["c", "b"]],
      ["b", ["a", "d"]],
      ["c", ["a", "d"]],
      ["d", ["c", "b"]],
    ]);
    expect(paretoImprove(mixed, [["a", "b"], ["c", "d"]]).map((p) => p.join("")).sort()).toEqual(["ab", "cd"]);
  });

  it("is the same for the same week and pool (no hidden randomness)", () => {
    const p = pool(30, 3);
    expect(clearBuddies(p, "2026-W42")).toEqual(clearBuddies(p, "2026-W42"));
  });
});

describe("quests", () => {
  it("are hand-written bank answers, in a district neither buddy has stamped, alternating whose type picks", () => {
    const a: ArchetypeKey = "BDSH";
    const b: ArchetypeKey = "CFMN";
    const q1 = pickQuest("m1", "2026-W42", [a, b], new Set());
    const q2 = pickQuest("m1", "2026-W43", [a, b], new Set());
    expect(q1.typeCode).toBe(a);
    expect(q2.typeCode).toBe(b);
    expect(questText(q1)?.en).toBeTruthy();
    const stamped = new Set(DISTRICTS.map((d) => d.value).filter((d) => d !== q1.district));
    // Only one unstamped district: the quest goes there if this type has a quest in it.
    const q3 = pickQuest("m2", "2026-W42", [a, b], new Set([...stamped, q1.district].filter((d) => d !== q1.district)));
    expect(q3.district).toBe(q1.district);
    // Everything stamped: still a quest.
    expect(questText(pickQuest("m3", "2026-W42", [a, b], new Set(DISTRICTS.map((d) => d.value))))).toBeTruthy();
  });
});

describe("romance gate (buddy-to-partner Pinky)", () => {
  const base = { eligible: [true, true] as [boolean, boolean], compatible: true, blocked: false, finishedQuests: 2 };
  it("opens only with 💘 on for both, a fit, no block, after two quests", () => {
    expect(romanceUnlocked(base)).toBe(true);
    expect(romanceUnlocked({ ...base, eligible: [true, false] })).toBe(false);
    expect(romanceUnlocked({ ...base, compatible: false })).toBe(false);
    expect(romanceUnlocked({ ...base, blocked: true })).toBe(false);
    expect(romanceUnlocked({ ...base, finishedQuests: 1 })).toBe(false);
  });
});

describe("dating only", () => {
  it("someone here only for dating is only paired with people they can date", () => {
    const a = member("a", "BDSH", { datesWith: new Set(["c"]) });
    const b = member("b", "CDSH");
    const c = member("c", "BFSH");
    const prefs = buddyPreferences([a, b, c], "w");
    expect(prefs.get("a")).toEqual(["c"]);
    expect(prefs.get("b")).not.toContain("a");
    const r = clearBuddies([a, b, c], "w");
    for (const [x, y] of r.pairs) expect([x, y].includes("a") ? [x, y].includes("c") : true).toBe(true);
  });

});

describe("the buddy deck and dating preferences", () => {
  it("keen ranks someone first and gets past the waiting bar; pass is handled as an exclusion", () => {
    // Different districts and no click: a weak pair, below a newcomer's bar.
    const a = member("a", "BDSH", { district: "bang_rak" });
    const b = member("b", "CFMN", { district: "min_buri" });
    expect(buddyPreferences([a, b], "s").get("a")).toEqual([]);
    const keen = member("a", "BDSH", { district: "bang_rak", keen: new Set(["b"]) });
    expect(buddyPreferences([keen, b], "s").get("a")).toEqual(["b"]);
  });

  it("dating members: clashing kids answers never pair; the same goal ranks higher", () => {
    const d = (id: string, prefs: object) => member(id, "BDSH", { datingPrefs: prefs });
    const me = d("me", { goal: "long_term", kids: "want" });
    const clash = d("x", { goal: "long_term", kids: "no" });
    const same = d("y", { goal: "long_term", kids: "open" });
    const other = d("z", { goal: "see" });
    const prefs = buddyPreferences([me, clash, same, other], "s").get("me")!;
    expect(prefs).not.toContain("x");
    expect(prefs[0]).toBe("y");
  });

  it("the deck leaves out people already flicked and people who can't be paired", () => {
    const me = member("me", "BDSH");
    const pool = [me, member("p1", "BDSH"), member("p2", "CDSH"), member("p3", "BDSH", { languages: ["ja"] })];
    const deck = deckFor(me, pool, new Set(["p1"]), "2026-10-15");
    expect(deck).toEqual(["p2"]);
  });
});
