/**
 * The shared Sheet (finalize review B2): a <details> that works without JS,
 * names its dialog, has a close button for JS, and its script parses.
 */
import { describe, expect, it } from "vitest";
import { Sheet, SHEET_JS } from "../src/ui/sheet";
import { A11Y_CSS } from "../src/ui/a11y-css";

const t = (th: string, en: string) => en || th;

describe("Sheet", () => {
  it("is a details with a labelled trigger and a named dialog panel", () => {
    const html = String(
      <Sheet t={t} title="Hana" trigger={<span aria-hidden="true">⋯</span>} triggerClass="sheet-more" triggerLabel="More options for Hana" align="start">
        <a href="/report">Report</a>
      </Sheet>,
    );
    expect(html).toMatch(/^<details class="sheet sheet-start" data-sheet="">/);
    expect(html).toContain('<summary class="sheet-more" aria-label="More options for Hana" aria-haspopup="dialog">');
    expect(html).toContain('class="sheet-panel" role="dialog" aria-label="Hana" tabindex="-1"');
    expect(html).toContain('data-sheet-close="" aria-label="Close"');
    expect(html).toContain('<a href="/report">Report</a>');
    expect(html).not.toContain(" open");
  });

  it("can start open (a form error inside it)", () => {
    expect(
      String(
        <Sheet t={t} title="x" trigger="+" open>
          {"y"}
        </Sheet>,
      ),
    ).toContain('data-sheet="" open=""');
  });

  it("ships a script that parses, uses the shared spring with no overshoot, and respects reduced motion", () => {
    expect(() => new Function(SHEET_JS)).not.toThrow();
    expect(SHEET_JS).toContain("damping:1");
    expect(SHEET_JS).toContain("still()");
    expect(SHEET_JS).toContain('"Escape"');
    expect(SHEET_JS).toContain('"Tab"');
  });

  it("is a bottom sheet with a scrim on phones and an anchored popover on laptops", () => {
    expect(A11Y_CSS).toMatch(/@media \(max-width:1023px\)\{\s*details\.sheet\[open\]>\.sheet-panel\{position:fixed;left:0;right:0;bottom:0/);
    expect(A11Y_CSS).toContain("html:not(.sheet-js) details.sheet[open]>summary::before");
    expect(A11Y_CSS).toMatch(/@media \(min-width:1024px\)\{\s*details\.sheet\{position:relative\}/);
  });
});
