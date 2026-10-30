import { describe, expect, it } from "vitest";
import {
  checkEventRules,
  collabIsDating,
  collabMixRefusal,
  collabReady,
  effectiveAgeMin,
  isAdminOnlyKind,
  inviteLapsesAt,
  joinCodeMatches,
  needsDisclaimer,
  talkSafeCount,
} from "../src/domain/event-rules";

describe("event rules (D51 to D61)", () => {
  it("raises an alcohol event to 20+ and leaves others alone", () => {
    expect(effectiveAgeMin(18, true)).toBe(20);
    expect(effectiveAgeMin(25, true)).toBe(25);
    expect(effectiveAgeMin(18, false)).toBe(18);
  });

  it("asks for the disclaimer for alcohol, age limits, activity or requirements only", () => {
    const base = { alcoholServed: false, ageMin: 18, tags: ["food"], requirements: [] as string[] };
    expect(needsDisclaimer(base)).toBe(false);
    expect(needsDisclaimer({ ...base, alcoholServed: true })).toBe(true);
    expect(needsDisclaimer({ ...base, ageMin: 25 })).toBe(true);
    expect(needsDisclaimer({ ...base, tags: ["run"] })).toBe(true);
    expect(needsDisclaimer({ ...base, requirements: ["Bring water"] })).toBe(true);
  });

  it("keeps private talks to health partners and admins", () => {
    expect(checkEventRules({ talkMode: true }, { partnerKind: "events" }).errors).toHaveLength(1);
    expect(checkEventRules({ talkMode: true }, { partnerKind: "health" }).errors).toHaveLength(0);
    expect(checkEventRules({ talkMode: true }, { isAdmin: true }).errors).toHaveLength(0);
  });

  it("keeps health events free with no ticket link", () => {
    expect(checkEventRules({}, { partnerKind: "health", costThb: 200 }).errors).toHaveLength(1);
    expect(checkEventRules({}, { partnerKind: "health", hasPaymentOrTicketLink: true }).errors).toHaveLength(1);
    expect(checkEventRules({}, { partnerKind: "venue", costThb: 200 }).errors).toHaveLength(0);
  });

  it("reads requirements one per line and caps them", () => {
    const ok = checkEventRules({ requirements: " Bring water \n\nComfortable shoes" }, {});
    expect(ok.values.requirements).toEqual(["Bring water", "Comfortable shoes"]);
    expect(checkEventRules({ requirements: "a\nb\nc\nd\ne\nf" }, {}).errors).toHaveLength(1);
    expect(checkEventRules({ requirements: "x".repeat(121) }, {}).errors).toHaveLength(1);
  });

  it("needs a group name and a join code together, and normalises the code", () => {
    expect(checkEventRules({ groupJoinCode: "chula-26" }, {}).errors).toHaveLength(1);
    expect(checkEventRules({ groupLabel: "Chula students" }, {}).errors).toHaveLength(1);
    const ok = checkEventRules({ groupLabel: "Chula students", groupJoinCode: " chula-26 " }, {});
    expect(ok.errors).toHaveLength(0);
    expect(ok.values.groupJoinCode).toBe("CHULA-26");
    expect(checkEventRules({ groupLabel: "x", groupJoinCode: "no!" }, {}).errors).toHaveLength(1);
  });

  it("never limits a 💘 event to a group, whoever posts it; women-only and LGBTQ+ stay allowed (owner P2)", () => {
    const group = { groupLabel: "Chula students", groupJoinCode: "CHULA-26" };
    expect(checkEventRules({ ...group, tags: ["open_to_more"] }, {}).errors).toHaveLength(1);
    expect(checkEventRules({ groupLabel: "Chula students", tags: ["open_to_more"] }, {}).errors.length).toBeGreaterThan(0);
    // A dating partner's events count as 💘 whatever tags are typed.
    expect(checkEventRules(group, { partnerKind: "dating" }).errors).toHaveLength(1);
    expect(checkEventRules(group, { partnerKind: "community" }).errors).toHaveLength(0);
    expect(checkEventRules({ tags: ["open_to_more", "women_only", "lgbtq_community"] }, { partnerKind: "dating" }).errors).toHaveLength(0);
  });

  it("a co-host invite lapses after 72 hours, or 24 hours before the start if sooner (owner P4)", () => {
    const H = 3_600_000;
    const sent = new Date("2030-01-01T00:00:00Z");
    expect(inviteLapsesAt(sent, new Date(sent.getTime() + 30 * 24 * H)).getTime()).toBe(sent.getTime() + 72 * H);
    expect(inviteLapsesAt(sent, new Date(sent.getTime() + 48 * H)).getTime()).toBe(sent.getTime() + 24 * H);
  });

  it("matches join codes without case or spaces", () => {
    expect(joinCodeMatches("chula-26", "CHULA-26")).toBe(true);
    expect(joinCodeMatches(" CHULA - 26", "CHULA-26")).toBe(true);
    expect(joinCodeMatches("CHULA-27", "CHULA-26")).toBe(false);
    expect(joinCodeMatches("", null)).toBe(true);
  });

  it("applies the collab mixing rules", () => {
    expect(collabMixRefusal(["venue", "events"])).toBeNull();
    expect(collabMixRefusal(["health", "community", "public_sector"])).toBeNull();
    expect(collabMixRefusal(["health", "venue"])).toBeNull();
    expect(collabMixRefusal(["health", "dating"])).not.toBeNull();
    expect(collabMixRefusal(["health", "events"])).not.toBeNull();
    expect(collabMixRefusal(["public_sector", "dating"])).not.toBeNull();
    expect(collabMixRefusal(["dating", "venue"])).toBeNull();
    expect(collabIsDating(["venue", "dating"])).toBe(true);
    expect(collabIsDating(["venue"])).toBe(false);
  });

  it("holds an event back while a co-host invite is open", () => {
    expect(collabReady([])).toBe(true);
    expect(collabReady([{ status: "accepted" }, { status: "declined" }])).toBe(true);
    expect(collabReady([{ status: "accepted" }, { status: "invited" }])).toBe(false);
  });

  it("hides small numbers at private talks only", () => {
    expect(talkSafeCount(true, 9)).toBeNull();
    expect(talkSafeCount(true, 10)).toBe(10);
    expect(talkSafeCount(false, 3)).toBe(3);
  });

  it("keeps health and public sector to admins", () => {
    expect(isAdminOnlyKind("health")).toBe(true);
    expect(isAdminOnlyKind("public_sector")).toBe(true);
    expect(isAdminOnlyKind("venue")).toBe(false);
  });
});
