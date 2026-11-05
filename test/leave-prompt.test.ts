/**
 * Owner card D: with unsaved edits on a guarded form (Edit profile), a link or tab tap asks first,
 * since the Jurrgun app's web view and iPhone never show the browser's leave warning.
 * The full click flow was checked in a real browser; this keeps the pieces in place.
 */
import { describe, expect, it } from "vitest";
import { A11Y_FORM_JS } from "../src/ui/a11y";

describe("leave prompt for unsaved edits", () => {
  it("asks in the page's language, from a window listener that runs after page scripts", () => {
    expect(A11Y_FORM_JS).toContain("ยังไม่ได้บันทึกที่แก้ไว้ ออกจากหน้านี้เลยไหม?");
    expect(A11Y_FORM_JS).toContain("You have unsaved changes. Leave this page?");
    expect(A11Y_FORM_JS).toMatch(/\naddEventListener\("click",function\(e\)\{if\(e\.defaultPrevented/);
    expect(() => new Function(A11Y_FORM_JS)).not.toThrow();
  });
});
