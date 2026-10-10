/**
 * PRD business rules (src/domain/rules.ts) — pure, no database.
 */
import { describe, expect, it } from "vitest";
import {
  ageBand,
  ageOn,
  canSwitchToSingle,
  checkInOpen,
  isLateCancel,
  mutualAgeOk,
  peopleWindow,
  resolveMutual,
  romanceCompatible,
  romanceEligible,
  safeCount,
  seatAvailable,
  seatsOverbooked,
  strikeStanding,
  waitlistOrder,
  type Choice,
} from "../src/domain/rules";
import { buddyRound, suggestGroups, type Attendee } from "../src/domain/matching";

const H = 3_600_000;
const D = 24 * H;

describe("ages", () => {
  it("computes age around a birthday", () => {
    expect(ageOn("2000-06-15", new Date("2026-06-14T12:00:00Z"))).toBe(25);
    expect(ageOn("2000-06-15", new Date("2026-06-15T12:00:00Z"))).toBe(26);
  });
  it("bands ages coarsely", () => {
    expect(ageBand(18)).toBe("18-24");
    expect(ageBand(29)).toBe("25-29");
    expect(ageBand(61)).toBe("60+");
  });
  it("needs both people inside each other's range", () => {
    const a = { age: 25, ageMin: 20, ageMax: 30 };
    expect(mutualAgeOk(a, { age: 28, ageMin: 25, ageMax: 35 })).toBe(true);
    expect(mutualAgeOk(a, { age: 28, ageMin: 26, ageMax: 35 })).toBe(false);
  });
});

describe("romance gates", () => {
  it("is only for Single users who switched it on", () => {
    expect(romanceEligible({ relationship: "single", romanceOn: true })).toBe(true);
    expect(romanceEligible({ relationship: "married", romanceOn: true })).toBe(false);
    expect(romanceEligible({ relationship: "prefer_not", romanceOn: true })).toBe(false);
    expect(romanceEligible({ relationship: "single", romanceOn: false })).toBe(false);
  });
  it("is inclusive of any identity combination", () => {
    const w = { genderIdentity: "woman", romanceOpenTo: ["woman"] as string[] };
    const nb = { genderIdentity: "non-binary", romanceOpenTo: "everyone" as const };
    const m = { genderIdentity: "man", romanceOpenTo: ["woman"] as string[] };
    expect(romanceCompatible(w, { genderIdentity: "woman", romanceOpenTo: ["woman", "non-binary"] })).toBe(true);
    expect(romanceCompatible(w, nb)).toBe(false);
    expect(romanceCompatible(m, w)).toBe(false);
    expect(romanceCompatible(nb, { genderIdentity: null, romanceOpenTo: "everyone" })).toBe(true);
  });
  it("allows switching to Single once per 30 days", () => {
    const now = new Date("2026-10-09T00:00:00Z");
    expect(canSwitchToSingle(null, now)).toBe(true);
    expect(canSwitchToSingle(new Date(now.getTime() - 10 * D), now)).toBe(false);
    expect(canSwitchToSingle(new Date(now.getTime() - 31 * D), now)).toBe(true);
  });
});

describe("mutual consent (PRD §10.3)", () => {
  const cases: [Choice, Choice, boolean, string | null][] = [
    ["friend", "friend", false, "friend"],
    ["activity", "activity", false, "activity"],
    ["romance", "romance", true, "romance"],
    ["romance", "romance", false, "friend"], // not compatible → friendship, nothing revealed
    ["romance", "friend", true, "friend"], // unreturned romance never disclosed
    ["romance", "activity", true, "activity"],
    ["friend", "again", false, "again"],
    ["friend", "none", false, null],
    ["none", "none", false, null],
    ["romance", "none", true, null],
  ];
  it.each(cases)("%s + %s (compatible=%s) → %s", (a, b, ok, out) => {
    expect(resolveMutual(a, b, ok)).toBe(out);
    expect(resolveMutual(b, a, ok)).toBe(out); // symmetric
  });
});

describe("timing windows", () => {
  const end = new Date("2026-10-10T12:00:00Z");
  it("People I Met is open for 72h after the event", () => {
    expect(peopleWindow(end, new Date(end.getTime() - 1))).toBe("before");
    expect(peopleWindow(end, new Date(end.getTime() + 71 * H))).toBe("open");
    expect(peopleWindow(end, new Date(end.getTime() + 72 * H))).toBe("closed");
  });
  it("check-in opens 30 min before and closes 60 min after start", () => {
    expect(checkInOpen(end, new Date(end.getTime() - 31 * 60_000))).toBe(false);
    expect(checkInOpen(end, new Date(end.getTime() - 29 * 60_000))).toBe(true);
    expect(checkInOpen(end, new Date(end.getTime() + 61 * 60_000))).toBe(false);
  });
  it("cancelling within 24h is late", () => {
    expect(isLateCancel(end, new Date(end.getTime() - 23 * H))).toBe(true);
    expect(isLateCancel(end, new Date(end.getTime() - 25 * H))).toBe(false);
  });
});

describe("strikes (PRD §24)", () => {
  const now = new Date("2026-10-09T00:00:00Z");
  const s = (daysAgo: number, waived = false) => ({
    createdAt: new Date(now.getTime() - daysAgo * D),
    expiresAt: new Date(now.getTime() + (90 - daysAgo) * D),
    waivedBy: waived ? "host" : null,
  });
  it("counts only live, unwaived strikes", () => {
    expect(strikeStanding([s(10), s(100), s(5, true)], now).active).toBe(1);
  });
  it("2 strikes: lose waitlist priority, 1 upcoming RSVP", () => {
    const st = strikeStanding([s(10), s(5)], now);
    expect(st.waitlistPriority).toBe(false);
    expect(st.maxUpcoming).toBe(1);
    expect(st.blockedUntil).toBeNull();
  });
  it("3 strikes: no RSVPs for 30 days from the 3rd", () => {
    const st = strikeStanding([s(20), s(10), s(5)], now);
    expect(st.blockedUntil?.toISOString()).toBe(new Date(now.getTime() + 25 * D).toISOString());
  });
});

describe("seats and waitlist", () => {
  it("reserves the resident quota", () => {
    const st = { capacity: 10, residentQuota: 3, taken: 7, takenByNonResidents: 7 };
    expect(seatAvailable(st, false)).toBe(false);
    expect(seatAvailable(st, true)).toBe(true);
    expect(seatAvailable({ ...st, taken: 10 }, true)).toBe(false);
  });
  it("spots an overbooking after the seat is taken", () => {
    const st = { capacity: 10, residentQuota: 3, taken: 10, takenByNonResidents: 7 };
    expect(seatsOverbooked(st, false)).toBe(false); // exactly full is fine
    expect(seatsOverbooked({ ...st, taken: 11 }, true)).toBe(true);
    expect(seatsOverbooked({ ...st, taken: 9, takenByNonResidents: 8 }, false)).toBe(true); // ate into the resident quota
    expect(seatsOverbooked({ ...st, taken: 9, takenByNonResidents: 8 }, true)).toBe(false);
  });
  it("orders priority, then residents (if prioritised), then first come", () => {
    const e = (id: string, mins: number, isResident: boolean, priority = true) => ({ id, createdAt: new Date(mins * 60_000), isResident, priority });
    const order = waitlistOrder([e("a", 1, false), e("b", 2, true), e("c", 0, false, false)], true).map((x) => x.id);
    expect(order).toEqual(["b", "a", "c"]);
    expect(waitlistOrder([e("a", 1, false), e("b", 2, true)], false).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("hides small counts", () => {
    expect(safeCount(9)).toBeNull();
    expect(safeCount(10)).toBe(10);
  });
});

describe("matching glue", () => {
  const person = (id: string, extra: Partial<Attendee> = {}): Attendee => ({
    accountId: id, age: 28, ageMin: 18, ageMax: 99, languages: ["th"], interests: ["food"], socialStyles: [], intents: ["friends"], blocked: [], ...extra,
  });
  it("suggests tables without separating +1s or seating blocked people together", () => {
    const people = Array.from({ length: 13 }, (_, i) => person(`p${i}`, { interests: i % 2 ? ["art"] : ["food"] }));
    people[0].blocked = ["p1"];
    const r = suggestGroups(people, { seed: "x", minSize: 4, maxSize: 6, keepTogether: [["p2", "p3"]] });
    expect(r.groups.flat().sort()).toEqual(people.map((p) => p.accountId).sort());
    expect(r.groups.find((g) => g.includes("p2"))).toContain("p3");
    expect(r.groups.find((g) => g.includes("p0"))).not.toContain("p1");
  });
  it("pairs buddies, makes a trio for an odd one out, and respects language", () => {
    const r = buddyRound([person("a"), person("b"), person("c"), person("x", { languages: ["ja"] })]);
    const sizes = r.groups.map((g) => g.length).sort();
    expect(sizes).toEqual([3]);
    expect(r.unmatched).toEqual(["x"]);
  });
});
