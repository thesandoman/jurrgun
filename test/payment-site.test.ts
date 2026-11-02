import { describe, expect, it } from "vitest";
import { paymentSite } from "../src/domain/hosting";

describe("card F6: the payment link's real site", () => {
  it("names the host the browser would really go to", () => {
    expect(paymentSite("https://www.ticketmelon.com/e/abc?x=1")).toBe("ticketmelon.com");
    expect(paymentSite("https://paypal.com@evil.example/pay")).toBe("evil.example");
    expect(paymentSite("https://pаypal.com/")).toMatch(/^xn--/); // Cyrillic "а"
  });
  it("gives nothing for what isn't a web address", () => {
    for (const bad of ["", null, undefined, "not a url", "javascript:alert(1)"]) expect(paymentSite(bad)).toBeNull();
  });
});
