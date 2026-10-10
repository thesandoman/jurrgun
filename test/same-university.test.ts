/** A shared university counts like a shared interest when seating tables. */
import { describe, expect, it } from "vitest";
import { toMatchProfile, type Attendee } from "../src/domain/matching";

const base: Attendee = { accountId: "a", age: 30, ageMin: 18, ageMax: 99, languages: ["th"], interests: ["food"], socialStyles: [], intents: ["friends"], blocked: [] };

describe("same university in matching", () => {
  it("adds the university as a shared signal, and nothing when unset", () => {
    expect(toMatchProfile({ ...base, university: "th:chulalongkorn-university" }).interests).toContain("uni:th:chulalongkorn-university");
    expect(toMatchProfile(base).interests).toEqual(["food"]);
  });
});
