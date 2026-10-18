/**
 * Edit profile ergonomics (owner, 2026-10-18): a refused save keeps everything typed and puts the
 * error beside its field; phone keyboards fit each field; the photo picker previews with an undo;
 * the leave warning, Return-to-next and focus-to-error scripts ship with the page.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import app from "../src/index";
import { profiles } from "../src/schema";
import { cleanBio, PROMPT_BANK, type Prompt } from "../src/content/profile";
import { A11Y_FORM_JS } from "../src/ui/a11y";
import { A11Y_CSS } from "../src/ui/a11y-css";
import { PROFILE_EDIT_JS } from "../src/ui/profile-form";

const en = (m: Member) => `${m.cookie}; lang=en`;
const base = { nickname: "Ploy", district: "bang_rak", languages: ["th", "en"], interests: ["food"], intents: ["friends"], locale: "en", links_present: "1" };
const first = (kind: Prompt["kind"]) => PROMPT_BANK.find((p) => p.kind === kind)!;

async function profileOf(id: string) {
  const [p] = await db().select().from(profiles).where(eq(profiles.accountId, id));
  return p;
}
async function setDeck(m: Member, ids: string[]) {
  await db().update(profiles).set({ bio: { deck: ids } }).where(eq(profiles.accountId, m.id));
}
const post = async (m: Member, form: Record<string, string | string[]>) => {
  const r = await req("/settings/profile", { cookie: en(m), form });
  return { status: r.status, html: await r.text() };
};
/** The opening tag of the element with this id. */
const tagOf = (html: string, id: string) => html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? "";

describe.skipIf(!HAS_DB)("edit profile ergonomics", () => {
  it("keeps typed prompt answers when another field is refused, and shows the error beside that field", async () => {
    const m = await createMember();
    const [text, multi] = [first("text"), first("multi")];
    await setDeck(m, [text.id, multi.id]);
    const typed = { [`a_${text.id}`]: "Typed and not saved yet", [`a_${multi.id}`]: multi.options!.slice(0, 2).map((o) => o.value) };

    // Interests empty: before, every prompt answer typed here was dropped from the page.
    let r = await post(m, { ...base, ...typed, interests: [] });
    expect(r.status).toBe(400);
    expect(r.html).toContain("Typed and not saved yet");
    expect(r.html).toMatch(new RegExp(`name="a_${multi.id}" value="${multi.options![0].value}" checked`));
    expect(tagOf(r.html, "err-interests")).toContain("data-err-focus");
    expect(r.html).toContain("Pick at least one interest.");
    expect(r.html).toContain('data-guard="dirty"');

    // "Currently learning" too long: the error sits under that field, which is marked invalid.
    r = await post(m, { ...base, ...typed, learning: "x".repeat(61) });
    expect(r.status).toBe(400);
    expect(r.html).toContain("Typed and not saved yet");
    expect(tagOf(r.html, "f-learning")).toContain('aria-invalid="true"');
    expect(tagOf(r.html, "f-learning")).toContain("f-learning-err");
    expect(r.html).toContain('id="f-learning-err"');

    // Nothing was saved by either refusal.
    expect(cleanBio((await profileOf(m.id)).bio).answers ?? {}).toEqual({});
  });

  it("puts each basic error on its own field", async () => {
    const m = await createMember();
    let r = await post(m, { ...base, nickname: "" });
    expect(r.status).toBe(400);
    expect(tagOf(r.html, "f-nickname")).toContain('aria-invalid="true"');
    expect(tagOf(r.html, "f-nickname")).toContain('aria-describedby="f-nickname-err"');

    r = await post(m, { ...base, district: "atlantis" });
    expect(tagOf(r.html, "f-district")).toContain('aria-invalid="true"');

    r = await post(m, { ...base, languages: [] });
    expect(r.html).toContain("Pick at least one language.");
    expect(r.html).toMatch(/<fieldset class="choices" aria-describedby="c-languages-hint c-languages-err" aria-invalid="true" tabindex="-1">/);

    r = await post(m, { ...base, comm: ["texter", "caller", "meme_sender", "sticker_fan"] });
    expect(tagOf(r.html, "err-comm")).toContain("field-err");

    r = await post(m, { ...base, link_instagram: "not valid!!" });
    expect(tagOf(r.html, "f-link_instagram")).toContain('aria-invalid="true"');
  });

  it("shows a prompt's error on the prompt and keeps the other prompts' answers", async () => {
    const m = await createMember();
    const [text, multi] = [first("text"), first("multi")];
    await setDeck(m, [text.id, multi.id]);
    const r = await post(m, { ...base, [`a_${text.id}`]: "Still here", [`a_${multi.id}`]: multi.options!.slice(0, 4).map((o) => o.value) });
    expect(r.status).toBe(400);
    expect(r.html).toContain(`id="err-prompt-${multi.id}"`);
    expect(r.html).toContain("Still here");
    expect(cleanBio((await profileOf(m.id)).bio).answers ?? {}).toEqual({});
  });

  it("refuses a bad photo beside the picker and says to choose it again", async () => {
    const m = await createMember();
    const fd = new FormData();
    for (const [k, v] of Object.entries(base)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
    fd.append("photo", new File(["hello"], "a.gif", { type: "image/gif" }));
    const r = await app.request("/settings/profile", { method: "POST", headers: { cookie: en(m) }, body: fd }, ENV);
    expect(r.status).toBe(400);
    const html = await r.text();
    expect(tagOf(html, "f-photo")).toContain('aria-invalid="true"');
    expect(html).toMatch(/id="f-photo-err"[^>]*>⚠ Photos must be JPG, PNG or WebP\./);
    expect(html).toContain("Please choose it again.");
  });

  it("fits the phone keyboard to each field and ships the picker, guard and focus helpers", async () => {
    const m = await createMember();
    const photo = first("photo");
    await setDeck(m, [first("text").id, photo.id]);
    const html = await (await req("/settings/profile", { cookie: en(m) })).text();
    expect(tagOf(html, "f-nickname")).toContain('autocomplete="nickname"');
    const site = tagOf(html, "f-link_website");
    expect(site).toContain('inputmode="url"');
    // type=url would refuse a bare "example.com", which the server accepts.
    expect(site).toContain('type="text"');
    for (const id of ["f-link_instagram", "f-link_website"]) {
      const tag = tagOf(html, id);
      expect(tag).toContain('autocapitalize="none"');
      expect(tag).toContain('autocorrect="off"');
      expect(tag).toContain('spellcheck="false"');
    }
    expect(tagOf(html, "f-link_link")).toContain('enterkeyhint="done"');
    expect(html).toContain('enterkeyhint="search"');
    // Photo pickers: an in-place preview slot and an undo, main photo and photo prompts alike.
    expect(html.match(/data-photo-pick=""/g)?.length).toBe(2);
    expect(html).toContain("Don&#39;t use this photo");
    // The prompt counter is read with its field, not announced on every key press.
    expect(html).not.toMatch(/class="pf-counter"[^>]*aria-live/);
    expect(html).toContain('data-guard=""');
    expect(PROFILE_EDIT_JS).toContain("isComposing");
    expect(PROFILE_EDIT_JS).toContain('form[data-guard="dirty"]');
    expect(A11Y_FORM_JS).toContain("snap(g.f)!==g.start");
    expect(A11Y_CSS).toContain("html:has(main .pf-jump){scroll-padding-top");
  });
});
