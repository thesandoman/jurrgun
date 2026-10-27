/**
 * The host's event form (owner card 4, 2026-10-27): the optional sections (no
 * required field inside) fold into <details>. The closed summary reads the
 * section's current values in one short line, or Not set; the required
 * sections stay open; and Send still opens a folded section with an error.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, db, req } from "./helpers";
import { events } from "../src/schema";
import { newId, randomToken } from "../src/lib/crypto";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { sumLine } from "../src/routes/host";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const css = (() => {
  const i = A11Y_CSS.indexOf("/* Host's event form, folded optional sections (owner card 4)");
  return i < 0 ? "" : A11Y_CSS.slice(i);
})();
/** Each folded section: [open?, summary title, summary line]. */
const folds = (html: string) =>
  [...html.matchAll(/<details class="([^"]*host-opt[^"]*)"( open="")?[^>]*>\s*<summary>(?:<h2 class="host-opt-title">|<span class="host-opt-title">)([^<]*)<\/(?:h2|span)><span class="host-opt-now">([^<]*)<\/span><\/summary>/g)].map((m) => ({
    cls: m[1],
    open: !!m[2],
    title: m[3],
    now: m[4],
  }));

describe("folded sections: the summary line", () => {
  const parts = [
    { n: "costThb", k: "cost", l: "Cost" },
    { n: "freeSeats", k: "num", l: "{n} pay-it-forward" },
    { n: "paymentUrl", k: "has", l: "Payment link" },
    { n: "safetyInfo", k: "text", l: "Safety" },
  ] as const;
  it("reads the values, cuts long text, and says Free for a zero cost", () => {
    expect(sumLine([...parts], { costThb: "350", freeSeats: "2", paymentUrl: "https://x.example", safetyInfo: "Meet at the front gate of the park, by the clock" }, "en", "Free", "Not set")).toBe(
      "Cost: ฿350 · 2 pay-it-forward · Payment link · Safety: Meet at the front gate…",
    );
    expect(sumLine([...parts], { costThb: "0", freeSeats: "0", paymentUrl: "", safetyInfo: "" }, "en", "Free", "Not set")).toBe("Cost: Free");
  });
  it("says Not set when nothing is filled in or ticked, and names the station in the page's language", () => {
    const venue = [
      { n: "nearestStation", k: "sel", l: "" },
      { n: "walkMinutes", k: "num", l: "{n} min walk" },
    ] as const;
    expect(sumLine([...venue], { nearestStation: "", walkMinutes: "" }, "en", "Free", "Not set")).toBe("Not set");
    expect(sumLine([...venue], { nearestStation: "bts_asok", walkMinutes: "5" }, "en", "Free", "Not set")).toBe("Asok · 5 min walk");
    expect(sumLine([{ n: "alcoholServed", k: "flag", l: "Alcohol served" }, { n: "requirements", k: "lines", l: "{n} to know" }], { alcoholServed: true, requirements: "water\n\nticket" }, "en", "", "Not set")).toBe(
      "Alcohol served · 2 to know",
    );
  });
});

describe("folded sections: the CSS", () => {
  it("the summary is a 44px target with a visible focus ring, and the values line shows only while closed", () => {
    expect(css).toMatch(/details\.host-opt>summary\{[^}]*min-height:44px/);
    expect(css).toMatch(/details\.host-opt>summary:focus-visible\{outline:3px solid/);
    expect(css).toContain("details.host-opt[open]>summary .host-opt-now{display:none}");
    expect(css).toMatch(/\.host-opt-now\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
    expect(css).toContain("@media (prefers-reduced-motion:reduce){main .host-form details.host-opt>summary::after{transition:none}}");
  });
});

describe.skipIf(!HAS_DB)("folded sections: the form", () => {
  it("a new event: the three optional sections are closed with Not set or Free; the required ones stay open cards", async () => {
    const m = await createMember({ role: "circle_head" });
    const en = await (await req("/host/new?lang=en", { cookie: m.cookie })).text();
    const f = folds(en);
    expect(f.map((x) => x.title)).toEqual(["Finding the table (optional)", "Entry rules (optional)", "Cost and safety"]);
    expect(f.every((x) => !x.open)).toBe(true);
    expect(f.map((x) => x.now)).toEqual(["Not set", "Not set", "Cost: Free"]);
    expect(f[2].cls).toBe("card host-opt");
    // Required sections are plain open cards, never folded.
    for (const h of ["What&#39;s the plan?", "When and where", "Who it&#39;s for"]) expect(en).toContain(`<h2>${h}</h2>`);
    const folded = [...en.matchAll(/<details class="[^"]*host-opt[\s\S]*?<\/details>/g)].map((x) => x[0]).join("");
    for (const n of ["title", "description", "startsAt", "endsAt", "venueName", "district", "capacity", "ageMin", "ageMax", "groupMin", "groupMax"]) {
      expect(en).toContain(`name="${n}"`);
      expect(folded).not.toContain(`name="${n}"`);
    }
    // The fields are still inside, and the sticky Send bar is still there.
    expect(en).toContain('name="costThb"');
    expect(en).toContain('name="nearestStation"');
    expect(en).toContain('class="row end pf-save host-send"');
    // Thai first.
    const th = folds(await (await req("/host/new?lang=th", { cookie: m.cookie })).text());
    expect(th.map((x) => x.now)).toEqual(["ยังไม่ได้ตั้ง", "ยังไม่ได้ตั้ง", "ค่าใช้จ่าย: ฟรี"]);
    expect(th[2].title).toBe("ค่าใช้จ่ายและความปลอดภัย");
  });

  it("editing: each closed summary reads the event's current values", async () => {
    const host = await createMember({ role: "circle_head" });
    const id = newId();
    const startsAt = new Date(Date.now() + 3 * DAY);
    await db()
      .insert(events)
      .values({
        id, title: `FOLD-${id.slice(0, 6)}`, startsAt, endsAt: new Date(startsAt.getTime() + 3 * HOUR), venueName: "Soi Social Club", district: "watthana", capacity: 8,
        status: "pending", createdBy: host.id, hostAccountId: host.id, visibility: "private", privateToken: randomToken(12),
        costThb: 350, freeSeats: 2, paymentNote: "PromptPay at the door", nearestStation: "bts_asok", walkMinutes: 5, alcoholServed: true, approvalRequired: true,
      });
    const f = folds(await (await req(`/host/${id}/edit`, { cookie: `${host.cookie}; lang=en` })).text());
    expect(f.map((x) => x.now)).toEqual(["Asok · 5 min walk", "Alcohol served · You approve places", "Cost: ฿350 · 2 pay-it-forward · Pay: PromptPay at the door"]);
    expect(f.every((x) => !x.open)).toBe(true);
  });

  it("Send opens a folded section with an error inside, and the summaries update as fields change", async () => {
    const m = await createMember({ role: "circle_head" });
    const html = await (await req("/host/new?lang=en", { cookie: m.cookie })).text();
    // Each failing field's section opens (show), and the first one is opened, focused and scrolled to (go).
    expect(html).toContain('function show(el){var od=el.closest("details");if(od)od.open=true;');
    expect(html).toContain('function go(el){var d=el.closest("details");if(d)d.open=true;el.focus({preventScroll:true});');
    // Live: the same parts as the server, read back from the fields.
    expect(html).toContain('f.addEventListener("input",live);f.addEventListener("change",live);');
    expect(html).toMatch(/data-sum="\[\{&quot;n&quot;:&quot;costThb&quot;,&quot;k&quot;:&quot;cost&quot;/);
    expect(html).toContain('data-none="Not set"');
    // A folded field that can fail the browser's check (a number out of range) is inside a closed section.
    expect(html).toMatch(/<details class="card host-opt"[^>]*>[\s\S]*name="freeSeats" type="number" value="0" min="0" max="5"/);
  });

  it("the server refuses the proposal: every folded section opens, since its errors may point inside one", async () => {
    const m = await createMember({ role: "circle_head" });
    const r = await req("/host/new?lang=en", { cookie: m.cookie, form: { title: "", description: "" } });
    expect(r.status).toBe(400);
    const f = folds(await r.text());
    expect(f).toHaveLength(3);
    expect(f.every((x) => x.open)).toBe(true);
  });
});
