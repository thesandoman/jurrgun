/**
 * D2 ambient motion (owner, 2026-10-16): decorative shapes sit still, and only a
 * live state pulses, at most 3 times (WCAG 2.2.2). The one endless animation
 * left is the busy dots on a button while its request runs.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { A11Y_CSS } from "../src/ui/a11y-css";

/** Every file that carries keyframe animations. */
// me-hub.tsx keeps its me-morph rules (another chat edits that file); a11y-css.ts switches them off, checked below.
const CSS_FILES = ["styles.ts", "a11y-css.ts", "alive.ts", "moments.ts", "discover-map.tsx", "visual.tsx", "question-art.tsx"].map((f) => `src/ui/${f}`);

describe("ambient motion", () => {
  it("no endless animation except the busy dots", () => {
    const loops: string[] = [];
    for (const file of CSS_FILES) {
      for (const m of readFileSync(file, "utf8").matchAll(/animation:([^;}"]*)/g)) {
        if (/\binfinite\b/.test(m[1]) && !/^busy\b/.test(m[1].trim())) loops.push(`${file}: ${m[1]}`);
      }
    }
    expect(loops).toEqual([]);
  });

  it("live states pulse 3 times, and Me's shapes sit still", () => {
    const moments = readFileSync("src/ui/moments.ts", "utf8");
    expect(moments).toContain("animation:live-glow 2.4s ease-in-out 3}");
    expect(moments).toContain("animation:live-dot 1.8s ease-out 3}");
    expect(A11Y_CSS).toContain("main .me-hero .me-blob,main .me-hero .me-avatar{animation:none}");
  });
});
