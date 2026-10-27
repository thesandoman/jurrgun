import { describe, expect, it } from "vitest";
import { A11Y_CSS } from "../src/ui/a11y-css";

// Screenshot pass, 2026-10-27: at 200% text the "Jurrgun" wordmark spilled out of the map's logo
// box and out of the top bar. It folds away as it does on narrow screens; the links keep their name.
describe("wordmarks fold away at large text", () => {
  it("the top bar is a container measured in rem: the Thai tag goes first, then the word", () => {
    expect(A11Y_CSS).toContain(".topbar{container:topbar/inline-size}");
    expect(A11Y_CSS).toContain("@container topbar (width < 21.8rem){.topbar .brand small{display:none}}");
    expect(A11Y_CSS).toContain("@container topbar (width < 21.25rem){.topbar .brand{font-size:0;gap:0}}");
  });

  it("at 100% text nothing changes: the word still shows on a 360px phone (340px inside the bar's padding)", () => {
    expect(21.25 * 16).toBeLessThanOrEqual(340);
    // A 381px phone keeps the Thai tag (349px inside 16px padding), as the old 380px rule did.
    expect(21.8 * 16).toBeLessThanOrEqual(349);
  });

  it("the small word under the map's logo hides once the logo box is too narrow for it", () => {
    expect(A11Y_CSS).toContain(".fullmap .fd-logo{container-type:inline-size}");
    expect(A11Y_CSS).toContain("@container (width < 2.8rem){.fullmap .fd-logo small{display:none}}");
  });
});
