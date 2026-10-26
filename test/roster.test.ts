/**
 * Who sees names, seat codes or counts (src/domain/roster.ts), owner cards C1 + P1.
 */
import { describe, expect, it } from "vitest";
import { countPolicy, partnerCountPolicy, rosterAccess, seatCode, shownCount } from "../src/domain/roster";

const host = { id: "h", role: "host" };
const admin = { id: "a", role: "bma_admin" };
const partner = { id: "p", role: "partner_admin" };
const romance = { hostAccountId: "h", partnerOrgId: null, tags: ["open_to_more"] };
const romancePartner = { hostAccountId: "h", partnerOrgId: "org", tags: ["open_to_more"] };
const partnerEvent = { hostAccountId: "h", partnerOrgId: "org", tags: [] };
const own = { hostAccountId: "h", partnerOrgId: null, tags: [] };

describe("rosterAccess", () => {
  it("💘 events: only the host works with the people, by seat code; everyone else sees counts", () => {
    expect(rosterAccess(host, romance)).toBe("codes");
    expect(rosterAccess(admin, romance)).toBe("counts");
    expect(rosterAccess(partner, romancePartner)).toBe("counts");
    expect(rosterAccess({ id: "h", role: "bma_admin" }, romance)).toBe("codes");
  });

  it("partner events: only the named host sees names", () => {
    expect(rosterAccess(host, partnerEvent)).toBe("names");
    expect(rosterAccess(partner, partnerEvent)).toBe("counts");
    expect(rosterAccess(admin, partnerEvent)).toBe("counts");
  });

  it("Jurrgun's own events: the host and bma_admin see names", () => {
    expect(rosterAccess(host, own)).toBe("names");
    expect(rosterAccess(admin, own)).toBe("names");
    expect(rosterAccess({ id: "x", role: "host" }, own)).toBe("counts");
    expect(rosterAccess(admin, { ...own, hostAccountId: null })).toBe("names");
  });
});

describe("counts", () => {
  it("counts-only viewers see 💘 counts frozen and rounded to 5, others from 10 up", () => {
    expect(countPolicy("counts", romance)).toBe("frozen5");
    expect(countPolicy("counts", partnerEvent)).toBe("from10");
    expect(countPolicy("codes", romance)).toBe("exact");
    expect(countPolicy("names", own)).toBe("exact");
    expect(partnerCountPolicy(romancePartner)).toBe("frozen5");
    expect(partnerCountPolicy(partnerEvent)).toBe("exact");
  });

  it("shows under 10 as null and rounds 💘 counts to 5", () => {
    expect(shownCount("frozen5", 9)).toBeNull();
    expect(shownCount("frozen5", 12)).toBe(10);
    expect(shownCount("frozen5", 13)).toBe(15);
    expect(shownCount("from10", 9)).toBeNull();
    expect(shownCount("from10", 13)).toBe(13);
    expect(shownCount("exact", 3)).toBe(3);
  });
});

describe("seatCode", () => {
  it("is five readable characters, stable for a pass and not its check-in code", () => {
    const token = "AbCdEf1234567890xyz";
    const code = seatCode(token);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(seatCode(token)).toBe(code);
    expect(code).not.toBe(token.slice(0, 5).toUpperCase());
    expect(seatCode("another-token-entirely")).not.toBe(code);
  });
});
