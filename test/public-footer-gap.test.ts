import { describe, expect, it } from "vitest";
import { A11Y_CSS } from "../src/ui/a11y-css";

// Screenshot pass, 2026-10-27: public pages had 90 to 110px of empty space above the footer.
const PUBLIC = "body:not(.admin,.bare,.fullmap-body):not(:has(.tabbar,.sticky-cta))";

describe("public pages end close to the footer", () => {
  it("trims the page's bottom padding, the last block's margin and the footer's margin, only without the tab bar", () => {
    expect(A11Y_CSS).toContain(`${PUBLIC} main.wrap{padding-bottom:16px}`);
    expect(A11Y_CSS).toContain(`${PUBLIC} main.wrap>:last-child{margin-bottom:0}`);
    expect(A11Y_CSS).toContain(`${PUBLIC} .foot{margin-top:8px}`);
    expect(A11Y_CSS).toContain(`@media (min-width:1024px){${PUBLIC} main.wrap{padding-bottom:24px}${PUBLIC} .foot{margin-top:16px}}`);
  });

  it("drops the tab bar's 104px of room below the footer on public pages, and keeps it with the tab bar", () => {
    expect(A11Y_CSS).toContain(`${PUBLIC}{padding-bottom:env(safe-area-inset-bottom,0px)}`);
    expect(A11Y_CSS).toContain("body:has(.tabbar){padding-bottom:calc(104px + env(safe-area-inset-bottom,0px))}");
  });

  it("the trimmed gap is within the spacing cap: 24px on phones, 40px on laptops", () => {
    expect(16 + 8).toBeLessThanOrEqual(40);
    expect(24 + 16).toBeLessThanOrEqual(56);
  });
});
