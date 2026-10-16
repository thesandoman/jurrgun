/**
 * Finalize review A2 and A3: the kit's button kinds and the one fact tile.
 */
import { describe, expect, it } from "vitest";
import { btnClass, FactTiles } from "../src/ui/kit";

const html = (node: unknown) => String(node);
const f = (answer: string, wide = false) => ({ icon: "🙂", label: `L-${answer}`, answer, wide });

describe("button kinds", () => {
  it("keeps the old class names and maps tonal to ghost", () => {
    expect(btnClass()).toBe("btn primary");
    expect(btnClass("tonal")).toBe("btn ghost");
    expect(btnClass("ghost")).toBe("btn ghost");
    expect(btnClass("quiet", "skip")).toBe("btn quiet skip");
  });
});

describe("FactTiles", () => {
  it("puts the label first for screen readers and the answer in bold", () => {
    const out = html(<FactTiles facts={[f("Bang Rak")]} />);
    expect(out).toContain('<dl class="fact-tiles">');
    expect(out).toMatch(/<dt>L-Bang Rak<\/dt><dd class="ft-a"><span class="ft-i" aria-hidden="true">🙂<\/span> Bang Rak<\/dd>/);
  });

  it("stretches a tile left alone at the end of a row of two", () => {
    const tiles = (facts: ReturnType<typeof f>[]) => [...html(<FactTiles facts={facts} />).matchAll(/<div class="([^"]*)"/g)].map((m) => m[1]);
    expect(tiles([f("a"), f("b"), f("c")])).toEqual(["fact-tile", "fact-tile", "fact-tile ft-lone"]);
    expect(tiles([f("a"), f("b")])).toEqual(["fact-tile", "fact-tile"]);
    expect(tiles([f("a"), f("long", true), f("b"), f("c")])).toEqual(["fact-tile ft-lone", "fact-tile ft-wide", "fact-tile", "fact-tile"]);
  });

  it("says how many columns it takes on laptops", () => {
    expect(html(<FactTiles cols={4} facts={[f("a")]} />)).toContain('data-cols="4"');
  });
});
