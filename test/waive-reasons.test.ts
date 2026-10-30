import { describe, expect, it } from "vitest";
import { waiveNoteOf, waiveReasonOf } from "../src/lib/constants";

describe("card D1: stored waive reasons", () => {
  it("splits '[key] note' into the reason and the note; older text is all note", () => {
    expect(waiveReasonOf("[travel] Train broke down")).toBe("travel");
    expect(waiveNoteOf("[travel] Train broke down")).toBe("Train broke down");
    expect(waiveNoteOf("[unwell]")).toBeNull();
    expect(waiveReasonOf("Was ill")).toBeNull();
    expect(waiveNoteOf("Was ill")).toBe("Was ill");
    expect(waiveReasonOf("[made_up] x")).toBeNull();
  });
});
