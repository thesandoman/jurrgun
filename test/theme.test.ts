/**
 * Appearance: dark rules follow the device unless <html data-theme> overrides.
 */
import { describe, expect, it } from "vitest";
import { STYLES, themed } from "../src/ui/styles";
import { A11Y_HEAD_JS } from "../src/ui/a11y";
import { PALETTE_CSS } from "../src/ui/palette";

describe("themed()", () => {
  it("scopes each dark media block to 'not forced light', and repeats it for 'forced dark'", () => {
    const out = themed("a{x:1}@media (prefers-color-scheme:dark){:root{--a:1}.b c,.d{e:f}html.big{g:h}}z{y:2}");
    expect(out).toBe(
      'a{x:1}@media (prefers-color-scheme:dark){html:not([data-theme="light"]){--a:1}html:not([data-theme="light"]) .b c,html:not([data-theme="light"]) .d{e:f}html:not([data-theme="light"]).big{g:h}}' +
        'html[data-theme="dark"]{--a:1}html[data-theme="dark"] .b c,html[data-theme="dark"] .d{e:f}html[data-theme="dark"].big{g:h}z{y:2}',
    );
  });

  it("leaves CSS without dark blocks alone", () => {
    expect(themed(".a{b:c}")).toBe(".a{b:c}");
  });

  it("leaves no unscoped dark rule in the app stylesheet", () => {
    // Dark tokens live in the palette sheet (one source of colour), served through themed() like the rest.
    const SHEET = themed(PALETTE_CSS) + STYLES;
    const blocks = SHEET.split("@media (prefers-color-scheme:dark){").slice(1);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b.trimStart().startsWith('html:not([data-theme="light"])')).toBe(true);
    expect(SHEET).toContain('html[data-theme="dark"]{');
  });

  it("the head script sets data-theme from the saved choice", () => {
    expect(A11Y_HEAD_JS).toContain('setAttribute("data-theme"');
  });
});
