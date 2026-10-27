import { describe, expect, it } from "vitest";
import { latestOf, versionText } from "../src/routes/consents";

describe("card P2: consent history", () => {
  it("names the notice a consent was given under by its date", () => {
    expect(versionText("notice-2026-10-27", "en")).toBe("27 October 2026");
    expect(versionText("terms-2026-10-26", "th")).toContain("2569");
    expect(versionText("test", "en")).toBe("test");
  });
  it("the latest row per category wins; the history keeps every row", () => {
    const rows = [
      { category: "research", granted: false, at: new Date("2026-10-27"), version: "notice-2026-10-27" },
      { category: "research", granted: true, at: new Date("2026-10-01"), version: "notice-2026-10-16" },
    ];
    expect(latestOf(rows).get("research")).toMatchObject({ granted: false, version: "notice-2026-10-27" });
  });
});
