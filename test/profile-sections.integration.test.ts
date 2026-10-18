/**
 * Save per section (owner card, 2026-10-18): each part of the profile posts to
 * /settings/profile/section/:name, which reads and writes only that part. The
 * property that matters most: a section save never changes another section's
 * data, whatever else the post carries.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import app from "../src/index";
import { ENV } from "./helpers";
import { connections, consents, profileLinks, profiles } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { PE_JS } from "../src/ui/profile-edit-js";
import { PROFILE_EDIT_JS } from "../src/ui/profile-form";
import { SHEET_JS } from "../src/ui/sheet";
import { A11Y_FORM_JS } from "../src/ui/a11y";
import { DISTRICTS, INTENTS, LANGUAGES } from "../src/lib/constants";
import {
  ACCESS_NEEDS,
  ACTIVITIES,
  BILL_STYLE,
  BKK_STORY,
  BKK_TIME,
  BUDGETS,
  cleanBio,
  COMM_STYLES,
  currentDatingDeck,
  DATING_PROMPT_BANK,
  DIET,
  EDUCATION,
  ENERGY,
  GETTING_AROUND,
  INTEREST_VALUES,
  MEALS,
  OCCUPATIONS,
  PAY_METHODS,
  PETS,
  PROMPT_BANK,
  PUNCTUAL,
  RESIDENCY,
  SPICE,
  TIME_WINDOWS,
  WEEKEND_RHYTHM,
} from "../src/content/profile";

const TEXT = PROMPT_BANK.find((p) => p.kind === "text" && !p.id.startsWith("d_"))!;
const CHOICE = PROMPT_BANK.find((p) => p.kind === "choice" && p.options!.length > 2)!;
const en = (m: Member) => `${m.cookie}; lang=en`;
type Form = Record<string, string | string[]>;

/** Two complete, different profiles, one value per field, so any field a save wrongly touches shows. */
function variant(i: 0 | 1, tag: string): Form {
  const pick = <T extends { value: string }>(list: T[]) => list[i + 1].value;
  return {
    nickname: i ? "Bravo" : "Alpha",
    district: DISTRICTS[i ? 5 : 2].value,
    pronouns: i ? "they/them" : "she/her",
    showPronouns: "1",
    ...(i ? {} : { newcomer: "1" }),
    locale: i ? "th" : "en",
    languages: i ? [LANGUAGES[2].value] : [LANGUAGES[0].value, LANGUAGES[1].value],
    learningLangs: [LANGUAGES[i ? 4 : 3].value],
    interests: i ? [INTEREST_VALUES[7], INTEREST_VALUES[9]] : [INTEREST_VALUES[0], INTEREST_VALUES[1]],
    intents: [INTENTS[i ? 2 : 1].value],
    socialStyles: [i ? "coffee_talk" : "activity"],
    comm: [COMM_STYLES[i ? 2 : 0].value],
    story: pick(BKK_STORY),
    bkkTime: pick(BKK_TIME),
    hometown: i ? "Khon Kaen" : "Chiang Mai",
    ...(i ? {} : { guide: "1" }),
    residency: pick(RESIDENCY),
    occupation: OCCUPATIONS[i ? 3 : 1].value,
    education: EDUCATION[i ? 3 : 1].value,
    educationDetail: i ? "History" : "Maths",
    gradYear: i ? "2019" : "2015",
    universityName: i ? `School B ${tag}` : `School A ${tag}`,
    learning: i ? "Pottery" : "Sourdough",
    energy: pick(ENERGY),
    weekendRhythm: pick(WEEKEND_RHYTHM),
    groupSize: i ? "big" : "small",
    times: [TIME_WINDOWS[i + 1].value],
    budget: pick(BUDGETS),
    activities: [ACTIVITIES[i + 1].value],
    meals: [MEALS[i + 1].value],
    access: [ACCESS_NEEDS[i + 1].value],
    pay: [PAY_METHODS[i + 1].value],
    bill: pick(BILL_STYLE),
    travel: [GETTING_AROUND[i + 1].value],
    diet: [DIET[i + 1].value],
    spice: pick(SPICE),
    pets: pick(PETS),
    punctual: pick(PUNCTUAL),
    [`m_${TEXT.id}`]: "1",
    [`a_${TEXT.id}`]: i ? "Answer B" : "Answer A",
    [`m_${CHOICE.id}`]: "1",
    [`a_${CHOICE.id}`]: CHOICE.options![i + 1].value,
    links_present: "1",
    link_instagram: `@${i ? "bravo" : "alpha"}_${tag}`,
    ...(i ? {} : { linksOn: "1" }),
  };
}

/** Columns and bio keys each section owns: the spec this test holds the route to. */
const OWNS: Record<string, { cols: string[]; bio: string[]; answers?: string[]; links?: boolean }> = {
  photo: { cols: ["photoKey"], bio: [] },
  basics: { cols: ["nickname", "district", "pronouns", "showPronouns", "newcomer", "locale"], bio: [] },
  languages: { cols: ["languages"], bio: ["learningLangs"] },
  interests: { cols: ["interests"], bio: [] },
  here: { cols: ["intents", "socialStyles"], bio: [] },
  comm: { cols: [], bio: ["comm"] },
  bangkok: { cols: [], bio: ["story", "bkkTime", "hometown", "guide", "residency", "reflections"] },
  work: { cols: [], bio: ["occupation", "occupationOther", "education", "educationDetail", "university", "universityName", "gradYear", "learning"] },
  meet: { cols: ["socialStyles"], bio: ["energy", "weekend", "pay", "bill", "travel", "diet", "spice", "pets", "punctual", "budget", "activities", "meals", "groupSize", "times", "access"] },
  prompts: { cols: [], bio: ["deck"], answers: [TEXT.id, CHOICE.id] },
  [`prompt-${TEXT.id}`]: { cols: [], bio: ["deck"], answers: [TEXT.id] },
  links: { cols: [], bio: [], links: true },
};

const COLS = ["nickname", "district", "pronouns", "showPronouns", "newcomer", "locale", "languages", "interests", "socialStyles", "intents", "photoKey", "eventStyle", "relationship", "romanceOn", "genderIdentity", "ageMin", "ageMax", "birthDate", "onboardedAt"] as const;

async function snapshot(m: Member) {
  const [p] = await db().select().from(profiles).where(eq(profiles.accountId, m.id));
  const links = (await db().select({ n: profileLinks.network, v: profileLinks.value }).from(profileLinks).where(eq(profileLinks.accountId, m.id))).sort((a, b) => a.n.localeCompare(b.n));
  const [sw] = await db()
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, m.id), eq(consents.category, "profile_links")))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  const bio = cleanBio(p.bio) as Record<string, unknown>;
  return { p: p as unknown as Record<string, unknown>, bio, answers: (bio.answers ?? {}) as Record<string, unknown>, links: { rows: links, on: sw?.granted ?? false } };
}

/** A member whose whole profile is variant A, with the two test prompts in their deck. */
async function seeded(tag: string) {
  const m = await createMember();
  await db().update(profiles).set({ bio: { deck: [TEXT.id, CHOICE.id] } }).where(eq(profiles.accountId, m.id));
  const r = await req("/settings/profile", { cookie: en(m), form: variant(0, tag) });
  expect(r.status).toBe(302);
  return m;
}

const postSection = (m: Member, name: string, form: Form, inPlace = false) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  const headers: Record<string, string> = { cookie: en(m), "content-type": "application/x-www-form-urlencoded" };
  if (inPlace) headers["x-pe"] = "1";
  return app.request(`/settings/profile/section/${name}`, { method: "POST", headers, body: p.toString() }, ENV);
};

describe.skipIf(!HAS_DB)("profile: save per section", () => {
  for (const [name, owns] of Object.entries(OWNS)) {
    it(`a ${name} save changes only ${name}, even when the post carries every other field`, async () => {
      const tag = Math.random().toString(36).slice(2, 8);
      const m = await seeded(tag);
      const before = await snapshot(m);
      // The whole of variant B goes to this one section.
      const r = await postSection(m, name, { ...variant(1, tag), back: "card" });
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe(`/me/profile?saved=${encodeURIComponent(name)}#pe-${name}`);
      const after = await snapshot(m);

      for (const col of COLS) {
        if (owns.cols.includes(col)) continue;
        expect(after.p[col], `column ${col}`).toEqual(before.p[col]);
      }
      for (const k of new Set([...Object.keys(before.bio), ...Object.keys(after.bio)])) {
        if (k === "answers" || owns.bio.includes(k)) continue;
        expect(after.bio[k], `bio.${k}`).toEqual(before.bio[k]);
      }
      for (const id of new Set([...Object.keys(before.answers), ...Object.keys(after.answers)])) {
        if (owns.answers?.includes(id)) continue;
        expect(after.answers[id], `answer ${id}`).toEqual(before.answers[id]);
      }
      if (!owns.links) expect(after.links).toEqual(before.links);

      // And the section itself did take variant B (photo has no file in this post, so it stays).
      if (name === "photo") return;
      const changed =
        owns.cols.some((c) => JSON.stringify(after.p[c]) !== JSON.stringify(before.p[c])) ||
        owns.bio.some((k) => JSON.stringify(after.bio[k]) !== JSON.stringify(before.bio[k])) ||
        (owns.answers ?? []).some((id) => JSON.stringify(after.answers[id]) !== JSON.stringify(before.answers[id])) ||
        (!!owns.links && JSON.stringify(after.links) !== JSON.stringify(before.links));
      expect(changed, `${name} took the new values`).toBe(true);
    });
  }

  it("a refused section save keeps what was typed beside the field and writes nothing", async () => {
    const m = await seeded("err");
    const before = await snapshot(m);
    // No JS: the long form comes back with the error on its field.
    let r = await postSection(m, "basics", { ...variant(1, "err"), nickname: "", back: "card" });
    expect(r.status).toBe(400);
    let html = await r.text();
    expect(html).toContain("<html");
    expect(html).toMatch(/id="f-nickname"[^>]*aria-invalid="true"/);
    expect(html).toContain('value="they/them"');
    // The refused form is the one that warns before leaving, and it still returns to the card.
    expect(html).toMatch(/data-pe="basics" data-guard="dirty"/);
    expect(html).toMatch(/action="\/settings\/profile\/section\/basics"[\s\S]*?name="back" value="card"/);

    // With JS: only the section's form comes back, errors in place.
    r = await postSection(m, "work", { learning: "x".repeat(61), occupation: OCCUPATIONS[3].value, back: "card" }, true);
    expect(r.status).toBe(400);
    html = await r.text();
    expect(html.startsWith("<form")).toBe(true);
    expect(html).not.toContain("<html");
    expect(html).toMatch(/id="f-learning"[^>]*aria-invalid="true"/);
    expect(html).toContain('aria-describedby="f-learning-hint f-learning-err"');
    expect(html).toContain("x".repeat(61));
    expect(await snapshot(m)).toEqual(before);
  });

  it("an in-place save answers with the fresh form and the Saved tick; a plain save returns to the form with it", async () => {
    const m = await seeded("ok");
    let r = await postSection(m, "interests", { interests: [INTEREST_VALUES[7]], back: "card" }, true);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html.startsWith("<form")).toBe(true);
    expect(html).toContain("✓ Saved");
    expect(html).toContain(`name="interests" value="${INTEREST_VALUES[7]}" checked`);

    r = await postSection(m, "comm", { comm: [COMM_STYLES[1].value], back: "edit" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/settings/profile?saved=comm#comm");
    const page = await (await req(r.headers.get("location")!, { cookie: en(m) })).text();
    expect(page).toMatch(/data-pe="comm"[\s\S]*?class="pe-tick" role="status"[^>]*>✓ Saved</);
    // Only the section just saved carries the tick.
    expect(page.match(/>✓ Saved</g)?.length).toBe(1);
  });

  it("serves one section's form for a sheet, and sends a plain visit to the long form", async () => {
    const m = await seeded("get");
    let r = await app.request(`/settings/profile/section/prompt-${TEXT.id}?back=card`, { headers: { cookie: en(m), "x-pe": "1" } }, ENV);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(`action="/settings/profile/section/prompt-${TEXT.id}"`);
    expect(html).toContain("Answer A");
    // One prompt at a time: no swap button in a sheet.
    expect(html).not.toContain("pf-shuffle");
    r = await app.request("/settings/profile/section/meet", { headers: { cookie: en(m) } }, ENV);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/settings/profile?open=meet#meet");
  });

  it("refuses sections that aren't mine: unknown names, prompts outside my deck, dating prompts without 💘", async () => {
    const m = await seeded("no");
    expect((await postSection(m, "nope", { back: "card" })).status).toBe(404);
    const other = PROMPT_BANK.find((p) => p.id !== TEXT.id && p.id !== CHOICE.id && p.kind === "text")!;
    expect((await postSection(m, `prompt-${other.id}`, { [`a_${other.id}`]: "sneaky", back: "card" })).status).toBe(404);
    expect((await postSection(m, "dating-prompts", { back: "card" })).status).toBe(404);
    expect(cleanBio((await snapshot(m)).bio).answers?.[other.id]).toBeUndefined();
  });

  it("dating prompts save on their own for a 💘 member and leave the friendship prompts alone", async () => {
    const m = await createMember({ romanceOn: true, relationship: "single" });
    const q = DATING_PROMPT_BANK.find((p) => p.kind === "text")!;
    await db()
      .update(profiles)
      .set({ bio: { deck: [TEXT.id], datingDeck: [q.id], answers: { [TEXT.id]: { kind: "text", value: "Friends answer" } } } })
      .where(eq(profiles.accountId, m.id));
    expect(currentDatingDeck(m.id, { datingDeck: [q.id] })).toEqual([q.id]);
    const r = await postSection(m, "dating-prompts", { [`m_${q.id}`]: "1", [`a_${q.id}`]: "A canal boat", [`a_${TEXT.id}`]: "Overwritten?", back: "card" });
    expect(r.status).toBe(303);
    const bio = cleanBio((await snapshot(m)).bio);
    expect(bio.answers?.[q.id]?.value).toBe("A canal boat");
    expect(bio.answers?.[TEXT.id]?.value).toBe("Friends answer");
  });

  it("a basics save switches the app language cookie; Meeting up's group size keeps Here for's styles", async () => {
    const m = await seeded("lang");
    const r = await postSection(m, "basics", { nickname: "Alpha", district: DISTRICTS[2].value, locale: "th", pronouns: "", back: "edit" });
    expect(r.headers.get("set-cookie") ?? "").toContain("lang=th");
    let s = await snapshot(m);
    expect(s.p.pronouns).toBeNull();
    expect(s.p.showPronouns).toBe(false);
    await postSection(m, "meet", { groupSize: "big", back: "edit" });
    s = await snapshot(m);
    expect(s.p.socialStyles).toEqual(["activity", "big_group"]);
    expect(s.bio.groupSize).toBe("big");
  });
});

describe.skipIf(!HAS_DB)("profile: basics first, the rest behind More", () => {
  it("shows photo, basics, languages and interests open, and every optional section as a row with progress", async () => {
    const m = await seeded("more");
    const html = await (await req("/settings/profile", { cookie: en(m) })).text();
    const more = html.indexOf('id="pe-more-h"');
    expect(more).toBeGreaterThan(0);
    for (const n of ["photo", "basics", "languages", "interests"]) {
      const at = html.indexOf(`<section class="pf-section" id="${n}"`);
      expect(at, n).toBeGreaterThan(0);
      expect(at, n).toBeLessThan(more);
    }
    expect(html).toContain("More (optional)");
    // Rows, closed until tapped, saying how much is filled in.
    expect(html).toMatch(/<details class="pe-row" id="prompts"><summary>[\s\S]*?My prompts<\/span><small class="pe-prog">2 of 2<\/small>/);
    expect(html).toMatch(/<details class="pe-row" id="meet"><summary>[\s\S]*?<small class="pe-prog">15 of 15<\/small>/);
    expect(html).toMatch(/<details class="pe-row" id="links"><summary>[\s\S]*?<small class="pe-prog">1 link · shown<\/small>/);
    // No 💘 row for a friends-only member; no jump bar.
    expect(html).not.toContain('id="dating-prompts"');
    expect(html).not.toContain('<nav class="pf-jump"');

    // Thai first, naturally.
    const th = await (await req("/settings/profile", { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain("เพิ่มเติม (ไม่บังคับ)");
    expect(th).toMatch(/คำถามของฉัน<\/span><small class="pe-prog">2 จาก 2<\/small>/);
  });

  it("opens a row from a link, after its save, and when its save is refused", async () => {
    const m = await seeded("open");
    let html = await (await req("/settings/profile?open=bangkok", { cookie: en(m) })).text();
    expect(html).toContain('<details class="pe-row" id="bangkok" open="">');
    html = await (await req("/settings/profile?saved=comm", { cookie: en(m) })).text();
    expect(html).toContain('<details class="pe-row" id="comm" open="">');
    // A prompt saved on its own opens My prompts.
    html = await (await req(`/settings/profile?saved=prompt-${TEXT.id}`, { cookie: en(m) })).text();
    expect(html).toContain('<details class="pe-row" id="prompts" open="">');
    const r = await postSection(m, "comm", { comm: COMM_STYLES.slice(0, 4).map((x) => x.value), back: "edit" });
    expect(r.status).toBe(400);
    html = await r.text();
    expect(html).toContain('<details class="pe-row" id="comm" open="">');
    expect(html).not.toContain('<details class="pe-row" id="meet" open');
  });
});

describe.skipIf(!HAS_DB)("profile: edit in place on my card", () => {
  /** The ✏️ spot for a section: its link (no JS) and its sheet trigger (JS). */
  const spot = (html: string, name: string) => html.match(new RegExp(`<div class="pe-edit[^"]*" id="pe-${name}" data-pe-spot="${name}">[\\s\\S]*?</details>`))?.[0] ?? "";

  it("puts a 44px ✏️ by each section of my own card: a link to the long form without JS, a sheet of just that section with it", async () => {
    const m = await seeded("card");
    const html = await (await req("/me/profile", { cookie: en(m) })).text();
    for (const [name, label] of [
      ["photo", "Edit profile photo"],
      ["basics", "Edit the basics"],
      ["interests", "Edit interests"],
      ["here", "Edit here for"],
      ["languages", "Edit languages"],
      ["bangkok", "Edit my Bangkok"],
      ["work", "Edit work and study"],
      ["meet", "Edit meeting up"],
      ["comm", "Edit how you keep in touch"],
      ["links", "Edit social links"],
      [`prompt-${TEXT.id}`, `Edit answer: ${TEXT.en}`],
    ]) {
      const s = spot(html, name);
      expect(s, name).not.toBe("");
      // A prompt opens My prompts and lands on its own card there.
      const open = name.startsWith("prompt-") ? "prompts" : name;
      expect(s).toContain(`<a class="pe-btn pe-link" href="/settings/profile?open=${open}&amp;from=card#${name}" aria-label="${label.replace("'", "&#39;")}">`);
      expect(s).toContain(`<details class="sheet pe-sheet" data-sheet="" data-sheet-trap="">`);
      expect(s).toContain(`<summary class="pe-btn" aria-label="${label.replace("'", "&#39;")}" aria-haspopup="dialog">`);
      expect(s).toContain(`data-src="/settings/profile/section/${name}?back=card"`);
    }
    // The fields and the in-place script ship with my card; "Edit all" still opens the long form.
    expect(html).toContain('href="/settings/profile">Edit all</a>');
    expect(html).toContain("window.__pe");
    // A plain save comes back here with the tick by that section's ✏️, and only there.
    const back = await (await req("/me/profile?saved=interests", { cookie: en(m) })).text();
    expect(spot(back, "interests")).toBe(spot(html, "interests"));
    expect(back).toMatch(/id="pe-interests"[\s\S]*?<span class="pe-tick" role="status"[^>]*>✓ Saved<\/span>/);
    expect(back.match(/>✓ Saved</g)?.length).toBe(1);
  });

  it("never puts an edit spot or the edit script on someone else's card", async () => {
    const me = await seeded("mine");
    const them = await seeded("theirs");
    const [a, b] = me.id < them.id ? [me.id, them.id] : [them.id, me.id];
    await db().insert(connections).values({ id: newId(), aAccount: a, bAccount: b, level: "friend", eventId: newId() });
    const r = await req(`/people/${them.id}`, { cookie: en(me) });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).not.toContain("data-pe-spot");
    expect(html).not.toContain("window.__pe");
    expect(html).not.toContain("/settings/profile/section/");
  });

  it("ships scripts that parse: sheets trap Tab on laptops too for a form, and saves go in place", () => {
    for (const js of [PE_JS, PROFILE_EDIT_JS, SHEET_JS, A11Y_FORM_JS]) expect(() => new Function(js)).not.toThrow();
    expect(SHEET_JS).toContain('cur.hasAttribute("data-sheet-trap")');
    expect(PE_JS).toContain('"x-pe":"1"');
    // A failed fetch falls back to a plain post; a refused one focuses its field.
    expect(PE_JS).toContain("HTMLFormElement.prototype.submit.call(f)");
    expect(PE_JS).toContain("jgPf.focusErr(f)");
    expect(A11Y_FORM_JS).toContain("window.jgGuard=");
  });
});
