/**
 * Less text (owner, 2026-10-16): long host text shows about 4 lines and a
 * "Read more", and extra helper lines sit behind a small ⓘ.
 */
import { describe, expect, it } from "vitest";
import { hostTextLead } from "../src/routes/events";
import { MoreInfo } from "../src/ui/kit";

const t = (th: string, en: string) => en || th;

describe("hostTextLead", () => {
  it("leaves short text whole", () => {
    expect(hostTextLead("Coffee and a walk by the river.")).toBeNull();
    expect(hostTextLead("one\ntwo\nthree\nfour")).toBeNull();
  });

  it("breaks long text at a space, and keeps every word", () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const split = hostTextLead(text)!;
    expect(split).not.toBeNull();
    expect(split[0].length).toBeLessThanOrEqual(200);
    expect(split[0].endsWith(" ")).toBe(false);
    expect(`${split[0]} ${split[1]}`).toBe(text);
  });

  it("breaks after 4 lines", () => {
    const text = ["a", "b", "c", "d", "e", "f"].join("\n");
    expect(hostTextLead(text)).toEqual(["a\nb\nc\nd", "e\nf"]);
  });

  it("never splits a Thai vowel or tone mark from its letter", () => {
    const text = "ที่".repeat(150);
    const [lead, rest] = hostTextLead(text)!;
    expect(lead + rest).toBe(text);
    expect(rest[0]).toBe("ท");
  });
});

describe("MoreInfo", () => {
  it("is a native disclosure with a spoken name", () => {
    const html = String(<MoreInfo t={t}>Extra</MoreInfo>);
    expect(html).toContain('<details class="more-info">');
    expect(html).toContain('<span aria-hidden="true">ⓘ</span>');
    expect(html).toContain('<span class="sr-only">More about this</span>');
    expect(html).toContain("Extra");
  });
});
