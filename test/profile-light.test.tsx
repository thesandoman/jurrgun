/**
 * The lighter profile view (owner, 2026-10-18): one glance strip of up to 6
 * emoji facts with no visible labels, the top 2 prompts open, every other
 * section below the top folded into a native <details> dropdown, spice and
 * learning shown once.
 */
import { describe, expect, it } from "vitest";
import { ProfileCard, type CardPerson } from "../src/ui/profile-card";
import { tr } from "../src/lib/i18n";
import type { Bio } from "../src/content/profile";
import type { View } from "../src/ui/kit";

const v = (lang: "th" | "en"): View => ({ lang, t: tr(lang), user: null, path: "/me/profile" });

const person = (bio: Bio, over: Partial<CardPerson> = {}): CardPerson => ({
  accountId: "acc-1",
  nickname: "Daniel",
  pronouns: null,
  district: "watthana",
  languages: ["en", "de"],
  interests: [],
  intents: ["friends"],
  newcomer: false,
  legacy: {},
  bio,
  deck: bio.deck ?? [],
  ...over,
});

const render = (p: CardPerson, lang: "th" | "en" = "en", extra: Record<string, unknown> = {}) =>
  String(<ProfileCard v={v(lang)} person={p} photo={null} promptPhoto={() => ""} {...extra} />);

const full: Bio = {
  occupation: "student",
  hometown: "Zurich",
  bkkTime: "3to10",
  story: "visiting",
  learningLangs: ["th"],
  energy: "warm_slow",
  weekend: "out_all_day",
  pay: ["cash"],
  bill: "turns",
  travel: ["bus"],
  spice: "medium",
  pets: "both",
  punctual: "bit_late",
  comm: ["voice_noter"],
};

/** The glance strip's markup. */
const glance = (html: string) => html.match(/<ul class="pc-glance"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
/** Everything outside a closed <details>: what shows before anyone opens a dropdown. */
const openPart = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, "");

describe("glance strip", () => {
  it("shows at most 6 emoji facts on one line, with the labels only for screen readers", () => {
    const html = render(person(full));
    const strip = glance(html);
    const items = [...strip.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(items.length).toBe(6);
    for (const li of items) {
      // Every item has a hidden label and a visible emoji that screen readers skip.
      expect(li).toMatch(/<span class="sr-only">[^<]+<\/span>/);
      expect(li).toMatch(/<span aria-hidden="true">[^<]+<\/span>/);
    }
    // No boxes and no visible grey labels: no fact tiles, no dt labels.
    expect(html).not.toContain("fact-tile");
    expect(html).not.toContain("<dt");
    expect(strip).toContain("Student");
    expect(strip).toContain("Zurich");
    expect(strip).toContain("3 to 10 years in Bangkok");
    expect(strip).toContain("English, German");
    expect(strip).toContain("Learning Thai");
    expect(strip).toContain("Warms up slowly");
  });

  it("has an accessible name and stays out of the dropdowns", () => {
    const html = render(person(full));
    expect(html).toMatch(/<ul class="pc-glance" aria-label="At a glance">/);
    expect(openPart(html)).toContain('class="pc-glance"');
    expect(render(person(full), "th")).toMatch(/<ul class="pc-glance" aria-label="[^"]+">/);
  });

  it("is left out when there is nothing to show", () => {
    expect(render(person({}, { languages: [] }))).not.toContain("pc-glance");
  });
});

describe("prompts", () => {
  const deck = ["dream_city", "small_thing", "weirdly_good", "teach_30s"];
  const answers = Object.fromEntries(deck.map((id, i) => [id, { kind: "text" as const, value: `answer-${i}` }]));

  it("shows the top 2 answers open and folds the rest under More about", () => {
    const html = render(person({ deck, answers }));
    const shown = openPart(html);
    expect(shown).toContain("answer-0");
    expect(shown).toContain("answer-1");
    expect(shown).not.toContain("answer-2");
    expect(shown).not.toContain("answer-3");
    const more = html.match(/<details class="pc-fold pc-more">([\s\S]*?)<\/details>/)?.[1] ?? "";
    expect(more).toContain("More about Daniel");
    expect(more).toContain("answer-2");
    expect(more).toContain("answer-3");
    expect(render(person({ deck, answers }), "th")).toContain("ข้อมูลเพิ่มเติมของ Daniel");
  });

  it("has no More about dropdown with 2 answers or fewer", () => {
    expect(render(person({ deck: deck.slice(0, 2), answers }))).not.toContain("pc-more");
  });
});

describe("dropdowns", () => {
  it("folds meeting up and keep in touch into native details with a heading summary, closed", () => {
    const html = render(person(full));
    const folds = [...html.matchAll(/<details class="pc-fold[^"]*"( open)?><summary><h2[^>]*>([\s\S]*?)<\/h2><\/summary>/g)];
    expect(folds.length).toBeGreaterThanOrEqual(2);
    expect(folds.every((m) => !m[1])).toBe(true);
    const titles = folds.map((m) => m[2]);
    expect(titles.some((x) => x.includes("Meeting up"))).toBe(true);
    expect(titles.some((x) => x.includes("How I keep in touch"))).toBe(true);
    // Meeting up comes before keep in touch, as the sections were ordered.
    expect(html.indexOf("Meeting up")).toBeLessThan(html.indexOf("How I keep in touch"));
    // Keep in touch shows the style names only, no explanatory blurb.
    expect(html).toContain("Voice-noter");
    expect(html).not.toContain("Easier to say it out loud");
  });

  it("keeps Here for open and drops the jump chips", () => {
    const html = render(person(full), "en", { compact: true });
    expect(openPart(html)).toContain("Here for");
    expect(html).not.toContain("pc-jump");
    expect(html).not.toContain('href="#pc-');
  });

  it("puts several regular tables in a dropdown", () => {
    const html = render(person(full), "en", { regularAt: ["Runners", "Sketchers"] });
    expect(html).toMatch(/<details class="pc-fold[^"]*"><summary><h2[^>]*>[\s\S]*?Regular at 2 tables/);
    expect(openPart(html)).not.toContain("Runners");
  });

  it("shows shared interests first and folds the rest behind +N", () => {
    const interests = ["food", "run", "board_game", "language_exchange", "walk", "culture", "photography", "craft_beer", "muay_thai"];
    const html = render(person(full, { interests }), "en", { viewerInterests: ["muay_thai"] });
    const shown = openPart(html);
    expect(shown).toContain("Interests");
    expect(html).toMatch(/<details class="pc-more-chips"><summary>\+3/);
    // The shared one comes first, in the open part.
    expect(shown.indexOf("pc-shared")).toBeGreaterThan(0);
  });
});

describe("spice shows once", () => {
  it("uses the out-and-about pick and drops the disagreeing spice slider", () => {
    const html = render(person({ ...full, deck: ["spice"], answers: { spice: { kind: "slider", value: 0 } } }));
    expect(html).not.toContain("No chilli");
    expect(html).not.toContain("pc-slider");
    expect(html.match(/Medium/g)?.length).toBe(1);
  });

  it("keeps the slider when there is no spice pick", () => {
    const { spice: _drop, ...rest } = full;
    const html = render(person({ ...rest, deck: ["spice"], answers: { spice: { kind: "slider", value: 7 } } }));
    expect(html).toContain("pc-slider");
    expect(html).not.toContain("Spice</span>");
  });
});

describe("learning shows once", () => {
  const learner: Bio = { ...full, learning: "Ordering food without pointing", learningLangs: ["th"] };

  it("keeps the learning prompt and drops the learning facts", () => {
    const html = render(person({ ...learner, deck: ["learning_now"], answers: { learning_now: { kind: "text", value: "Thai tones" } } }));
    expect(html).toContain("Thai tones");
    expect(html).not.toContain("Learning Thai");
    expect(html).not.toContain("Ordering food without pointing");
    expect(html).not.toContain("Currently learning");
  });

  it("without the prompt, shows one learning item in the glance strip", () => {
    const html = render(person(learner));
    expect(html.match(/Learning Thai/g)?.length).toBe(1);
    expect(html).not.toContain("Ordering food without pointing");
    expect(html).not.toContain("Currently learning");
  });

  it("falls back to the short learning answer when no language is picked", () => {
    const { learningLangs: _drop, ...rest } = learner;
    const strip = glance(render(person(rest)));
    expect(strip).toContain("Ordering food without pointing");
  });
});
