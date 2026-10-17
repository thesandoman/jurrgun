import { describe, expect, it } from "vitest";
import { contrast, deltaE, luminance } from "../src/ui/color-math";
import { DARK, LIGHT, PALETTE_CSS, PRIMITIVES, TEXT_PAIRS } from "../src/ui/palette";

const themes = { light: LIGHT, dark: DARK };

describe("palette", () => {
  it("has the same roles in light and dark", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  for (const [name, p] of Object.entries(themes)) {
    it(`${name}: every semantic text pair meets WCAG AA`, () => {
      const fails = TEXT_PAIRS.map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(p[fg], p[bg]) })).filter((x) => x.ratio < x.min);
      expect(fails).toEqual([]);
    });

    it(`${name}: the four category tints are told apart (CIEDE2000 >= 15)`, () => {
      const cats = ["cat-green", "cat-mango", "cat-sky", "cat-cream"];
      for (let i = 0; i < cats.length; i++)
        for (let j = i + 1; j < cats.length; j++) expect(deltaE(p[cats[i]], p[cats[j]]), `${cats[i]} vs ${cats[j]}`).toBeGreaterThanOrEqual(15);
    });
  }

  it("dark surfaces sit clearly above the ground (1.25 or more)", () => {
    expect(contrast(DARK.surface, DARK.bg)).toBeGreaterThanOrEqual(1.25);
    expect(luminance(DARK["surface-2"])).toBeGreaterThan(luminance(DARK.surface));
  });

  it("keeps the fixed brand identity", () => {
    expect(LIGHT.brand).toBe("#11763f");
    expect(LIGHT.bg).toBe("#fff9f0");
    expect(PRIMITIVES.mango[300]).toBe("#ffc766");
    expect(PRIMITIVES.mango[400]).toBe("#ffa53a");
    expect(LIGHT["mango-ink"]).toBe("#9a5100");
    expect([LIGHT.love, LIGHT["love-ink"], LIGHT["love-soft"]]).toEqual(["#e23744", "#c0222f", "#fde3e5"]);
  });

  it("selected is one look: the same token in both themes, and it is not the soft tint", () => {
    for (const p of Object.values(themes)) {
      expect(p.sel).toBe(p.brand);
      expect(p.sel).not.toBe(p["brand-soft"]);
    }
  });

  it("writes every role into the CSS once per theme", () => {
    for (const k of Object.keys(LIGHT)) expect(PALETTE_CSS.split(`--${k}:`).length - 1, k).toBe(2);
  });
});
