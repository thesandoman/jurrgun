import { describe, expect, it } from "vitest";
import { A11Y_CSS } from "../src/ui/a11y-css";

// Owner, 2026-10-26: at 200% text the gap above a section heading passed the spacing cap
// (40px on phones, 56px on laptops; jurrgun-ui SKILL.md). It still scales, but never past the cap.
describe("section heading gap stays under the spacing cap at large text", () => {
  it("caps the h2 top margin at 56px, and at 40px on phones", () => {
    expect(A11Y_CSS).toContain("h2{margin-top:min(1.8rem,56px)}");
    expect(A11Y_CSS).toContain("@media (max-width:520px){h2{margin-top:min(1.5rem,40px)}}");
  });
  it("comes last, so it wins over the base h2 rules", () => {
    expect(A11Y_CSS.lastIndexOf("h2{margin-top:min(1.8rem,56px)}")).toBeGreaterThan(A11Y_CSS.lastIndexOf(".me-all"));
  });
});
