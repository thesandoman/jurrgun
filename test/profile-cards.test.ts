/** Owner cards on profile pages: one group size and one free-times question, seating still gets its signal. */
import { describe, expect, it } from "vitest";
import { groupSizeOrLegacy, timesOrLegacy, withGroupStyle } from "../src/content/profile";

describe("group size and free times, asked once", () => {
  it("small / big group follow the group size answer", () => {
    expect(withGroupStyle(["activity", "big_group"], "small")).toEqual(["activity", "small_group"]);
    expect(withGroupStyle(["small_group", "coffee_talk"], "table")).toEqual(["coffee_talk"]);
    expect(withGroupStyle(["activity"], undefined)).toEqual(["activity"]);
  });
  it("old answers fill the kept questions until changed", () => {
    expect(groupSizeOrLegacy(undefined, ["small_group"])).toBe("small");
    expect(groupSizeOrLegacy("table", ["small_group"])).toBe("table");
    expect(timesOrLegacy(undefined, "weekend_night")).toEqual(["weekend_evening"]);
    expect(timesOrLegacy(["weekday_morning"], "weekend_night")).toEqual(["weekday_morning"]);
    expect(timesOrLegacy([], null)).toEqual([]);
  });
});
