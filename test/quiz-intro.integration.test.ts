/**
 * The quiz intro counts the 16 Bangkok Type questions, and says up front when
 * 💘 or Table Host style questions come after them (owner, via Branding).
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";

const intro = async (opts: Parameters<typeof createMember>[0]) => {
  const m = await createMember(opts);
  return (await req("/quiz?lang=en", { cookie: m.cookie })).text();
};

describe.skipIf(!HAS_DB)("quiz intro", () => {
  it("💘 off: 16 moments, no style notice", async () => {
    const html = await intro({ relationship: "single", romanceOn: false });
    expect(html).toContain("16 quick Bangkok moments");
    expect(html).not.toContain("about how you date");
    expect(html).not.toContain("about how you host");
  });

  it("💘 on: still 16 moments, plus a red notice for the dating questions and a divider before them", async () => {
    const html = await intro({ relationship: "single", romanceOn: true });
    expect(html).toContain("16 quick Bangkok moments");
    expect(html).toMatch(/class="q-set q-set-date q-extra">\+ \d+ about how you date, because 💘 is on/);
    expect(html).toContain("Now a few about how you date");
    expect(html).toContain("16 / 16");
    expect(html).not.toContain("about how you host");
  });

  it("Table Host: a host notice, and both lines when 💘 is on too", async () => {
    const html = await intro({ role: "circle_head", relationship: "single", romanceOn: true });
    expect(html).toMatch(/\+ \d+ about how you host/);
    expect(html).toMatch(/\+ \d+ about how you date/);
    expect(html).toContain("Now a couple about how you host");
  });
});
