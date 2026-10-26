/**
 * Ticket cards reflow at large text (owner, UI/UX mobile card 8; WCAG 1.4.4 and 1.4.10): the card
 * measures its own width in rem, and when it is narrow the stub stacks on top, date first, so the
 * title can wrap across the full width instead of being cut.
 */
import { describe, expect, it } from "vitest";
import { A11Y_CSS } from "../src/ui/a11y-css";

const css = A11Y_CSS.replace(/\s+/g, " ");

describe("ticket cards at large text", () => {
  it("make each card a size container, measured in rem so text size counts", () => {
    expect(css).toContain(".card.ev-card{container-type:inline-size}");
    expect(css).toContain("@container (max-width:17rem){");
  });

  it("stack the stub above the body, date first, with the notches off", () => {
    const block = css.slice(css.indexOf("@container (max-width:17rem){"));
    expect(block).toContain(".ev-card .event-cover,.ev-card .ev-body{grid-column:1/-1}");
    expect(block).toContain("flex-direction:row-reverse;justify-content:flex-end");
    expect(css).toMatch(/@container ev-item \(max-width:17rem\)\{[^}]*\{-webkit-mask:none;mask:none\}/);
    expect(css).toMatch(/@container ev-picks \(max-width:17rem\)\{[^}]*\{-webkit-mask:none;mask:none\}/);
  });

  it("let long title words break rather than be clipped", () => {
    expect(css).toContain(".ev-card h3{overflow-wrap:break-word}");
  });
});
