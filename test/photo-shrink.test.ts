/**
 * Phone-side photo shrink (Mobile App card M3): which picked photos are
 * redrawn, which are kept as picked, and that HEIC is refused. The script
 * runs in a small fake page (no browser needed); the drawing itself needs a
 * real canvas and is checked on phones.
 */
import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { PHOTO_SHRINK_JS, SHRINK_MAX_SIDE, SHRINK_OVER_BYTES } from "../src/ui/photo-shrink";

type Plan = (f: { type: string; name: string; size: number }, w: number, h: number) => string;

function load(lang = "en"): { plan: Plan; listeners: string[] } {
  const listeners: string[] = [];
  const window: Record<string, unknown> = {};
  const document = { documentElement: { lang }, addEventListener: (type: string, _fn: unknown, capture: boolean) => listeners.push(`${type}:${capture}`) };
  vm.runInContext(PHOTO_SHRINK_JS, vm.createContext({ window, document }));
  return { plan: (window.jgShrink as { plan: Plan }).plan, listeners };
}

const MB = 1024 * 1024;

describe("photo shrink", () => {
  it("listens for picks before the page's own pickers do (capture phase)", () => {
    expect(load().listeners).toEqual(["change:true"]);
  });

  it("always redraws a JPEG (rotation applied, at most 1600px)", () => {
    const { plan } = load();
    expect(plan({ type: "image/jpeg", name: "IMG_1.jpg", size: 6 * MB }, 4032, 3024)).toBe("image/jpeg");
    expect(plan({ type: "image/jpeg", name: "small.jpg", size: 200_000 }, 800, 600)).toBe("image/jpeg");
  });

  it("keeps a small PNG or WebP exactly as picked, and never turns one into a JPEG", () => {
    const { plan } = load();
    expect(plan({ type: "image/png", name: "logo.png", size: 300_000 }, 800, 800)).toBe("keep");
    expect(plan({ type: "image/webp", name: "a.webp", size: 300_000 }, 1200, 900)).toBe("keep");
    expect(plan({ type: "image/png", name: "big.png", size: SHRINK_OVER_BYTES + 1 }, 1000, 1000)).toBe("image/webp");
    expect(plan({ type: "image/png", name: "wide.png", size: 400_000 }, SHRINK_MAX_SIDE + 1, 900)).toBe("image/webp");
  });

  it("refuses HEIC on the spot, by type or by name", () => {
    const { plan } = load();
    expect(plan({ type: "image/heic", name: "IMG_2.HEIC", size: 2 * MB }, 0, 0)).toBe("heic");
    expect(plan({ type: "", name: "img_3.heif", size: 2 * MB }, 0, 0)).toBe("heic");
  });

  it("says the HEIC message in the page's language", () => {
    expect(PHOTO_SHRINK_JS).toContain("Choose a JPEG or PNG photo");
    expect(PHOTO_SHRINK_JS).toContain("\\\\u0e40\\\\u0e25\\\\u0e37\\\\u0e2d\\\\u0e01".replace(/\\\\/g, "\\"));
  });
});
