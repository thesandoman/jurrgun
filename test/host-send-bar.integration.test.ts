/**
 * The host's event form (owner card 3, 2026-10-26): Cancel and Send for review
 * in edit profile's sticky save bar on phones, stepping aside while a field is
 * typed in, and Send with a required field empty goes to the first error.
 */
import { describe, expect, it } from "vitest";
import { HAS_DB, createMember, req } from "./helpers";
import { A11Y_CSS } from "../src/ui/a11y-css";

const css = (() => {
  const i = A11Y_CSS.indexOf("/* Host's event form (owner card 3)");
  return i < 0 ? "" : A11Y_CSS.slice(i);
})();

describe("host form send bar: the CSS", () => {
  it("sticky at the bottom on phones and tablets, a plain row on laptops", () => {
    expect(css).toMatch(/@media \(max-width:1023\.98px\)\{[^@]*main \.pf-save\.host-send\{position:sticky;bottom:0/);
    expect(css).toMatch(/@media \(min-width:1024px\)\{main \.pf-save\.host-send\{position:static/);
  });

  it("steps back into the page while typing (keyboard or a focused text field) and keeps focused fields clear of it", () => {
    expect(css).toMatch(/main form\.host-form:is\(\.is-typing,:has\([^{]*textarea\):focus\)\) \.host-send\{position:static\}/);
    expect(css).toContain("html:has(main .host-send){scroll-padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}");
  });
});

describe.skipIf(!HAS_DB)("host form send bar: the markup", () => {
  it("Cancel and Send for review in the sticky bar, Thai first, with the first-error script", async () => {
    const m = await createMember({ role: "circle_head" });
    const th = await (await req("/host/new?lang=th", { cookie: m.cookie })).text();
    const bar = th.match(/<div class="row end pf-save host-send">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(bar).toContain('href="/host"');
    expect(bar).toContain("ยกเลิก");
    expect(bar).toContain("ส่งให้ทีมงานตรวจ");
    expect(bar).toMatch(/<button type="submit" class="btn primary">/);
    // The form still posts on its own without JS; the script only adds the first-error focus.
    expect(th).toMatch(/<form method="post" action="\/host\/new" class="host-form" data-first-error[^>]*data-miss="กรอกช่องนี้ก่อนส่ง"/);
    expect(th).toContain('document.currentScript.closest("form[data-first-error]")');
    expect(th).toContain('f.addEventListener("invalid"');
    expect(th).toContain("el.focus({preventScroll:true})");
    expect(th).toContain('el.scrollIntoView({block:"center"');
    expect(th).toContain('s.className="field-err"');
    expect(th).toContain("visualViewport");
    const en = await (await req("/host/new?lang=en", { cookie: m.cookie })).text();
    expect(en).toContain(">Send for review</button>");
    expect(en).toContain('data-miss="Fill this in before sending."');
  });

  it("a refused proposal still renders the server's error list above the form", async () => {
    const m = await createMember({ role: "circle_head" });
    const r = await req("/host/new?lang=en", { cookie: m.cookie, form: { title: "", description: "" } });
    expect(r.status).toBe(400);
    const html = await r.text();
    expect(html).toMatch(/class="notice[^"]*error[\s\S]*<ul>/);
    expect(html).toContain('class="row end pf-save host-send"');
  });
});
