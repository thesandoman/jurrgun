/**
 * Form fields carry their hint and error to screen readers (WCAG 1.3.1, 3.3.1).
 */
import { describe, expect, it } from "vitest";
import { Field, TextArea } from "../src/ui/kit";

const html = (x: unknown) => String(x);

describe("Field", () => {
  it("points the input at its hint", () => {
    const out = html(<Field label="Username" name="username" hint="3 to 30 letters" />);
    expect(out).toContain('aria-describedby="f-username-hint"');
    expect(out).toContain('id="f-username-hint"');
    expect(out).not.toContain("aria-invalid");
  });

  it("marks an invalid field and reads the error with it", () => {
    const out = html(<Field label="Username" name="username" hint="3 to 30 letters" error="Already taken" />);
    expect(out).toContain('aria-describedby="f-username-hint f-username-err"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("Already taken");
  });

  it("has no describedby when there is nothing to describe", () => {
    expect(html(<Field label="Name" name="n" />)).not.toContain("aria-describedby");
  });

  it("opens the number keypad on phones for a number field, unless one is given", () => {
    expect(html(<Field label="Age" name="age" type="number" />)).toContain('inputmode="numeric"');
    expect(html(<Field label="Site" name="site" type="url" inputmode="url" />)).toContain('inputmode="url"');
    expect(html(<Field label="Name" name="n" />)).not.toContain("inputmode");
  });
});

describe("TextArea", () => {
  it("points the textarea at its hint", () => {
    const out = html(<TextArea label="Bio" name="bio" hint="Keep it short" />);
    expect(out).toContain('aria-describedby="f-bio-hint"');
  });
});
