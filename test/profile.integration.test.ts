/**
 * The richer profile: edit form (interests, comm styles, quick facts, prompt
 * answers by kind), prompt shuffle, my card preview and who may see a card.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import app from "../src/index";
import { newId, randomToken } from "../src/lib/crypto";
import { accounts, blocks, connections, events, profiles, registrations } from "../src/schema";
import { cleanBio, currentDeck, deckFor, PROMPT_BANK, promptById, type Prompt } from "../src/content/profile";

const HOUR = 3_600_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const base = { nickname: "Ploy", district: "bang_rak", languages: ["th", "en"], interests: ["food"], intents: ["friends"], locale: "en" };

async function profileOf(id: string) {
  const [p] = await db().select().from(profiles).where(eq(profiles.accountId, id));
  return p;
}

/** Give a member a fixed deck with one prompt of each kind. */
async function setDeck(m: Member, ids: string[]) {
  await db().update(profiles).set({ bio: { deck: ids } }).where(eq(profiles.accountId, m.id));
}
const first = (kind: Prompt["kind"]) => PROMPT_BANK.find((p) => p.kind === kind)!;
const ALL_KINDS = ["text", "slider", "scale", "choice", "multi", "emoji", "rank", "photo"] as const;

async function event(endedHoursAgo = 2) {
  const id = newId();
  const ends = new Date(Date.now() - endedHoursAgo * HOUR);
  await db().insert(events).values({
    id,
    title: `งาน ${id.slice(0, 5)}`,
    startsAt: new Date(ends.getTime() - 2 * HOUR),
    endsAt: ends,
    venueName: "Lumphini Park",
    district: "pathum_wan",
    capacity: 20,
    status: "published",
    createdBy: "test",
  });
  return id;
}
async function attend(eventId: string, m: Member, checkedIn = true) {
  await db().insert(registrations).values({ id: newId(), eventId, accountId: m.id, status: "confirmed", passToken: randomToken(), checkedInAt: checkedIn ? new Date(Date.now() - 3 * HOUR) : null });
}

describe.skipIf(!HAS_DB)("profile: edit", () => {
  it("saves interests, comm styles and quick facts, with 400s on bad input", async () => {
    const m = await createMember();
    expect((await req("/settings/profile", { cookie: m.cookie })).status).toBe(200);

    const tooMany = ["food", "street_food", "cafes", "cooking", "baking", "tea", "running", "yoga", "muay_thai", "art", "pottery", "music", "jazz", "karaoke", "books", "anime"];
    let r = await req("/settings/profile", { cookie: m.cookie, form: { ...base, interests: tooMany } });
    expect(r.status).toBe(400);
    r = await req("/settings/profile", { cookie: m.cookie, form: { ...base, comm: ["texter", "caller", "meme_sender", "sticker_fan"] } });
    expect(r.status).toBe(400);
    r = await req("/settings/profile", { cookie: m.cookie, form: { ...base, learning: "x".repeat(61) } });
    expect(r.status).toBe(400);

    r = await req("/settings/profile", {
      cookie: m.cookie,
      form: {
        ...base,
        interests: ["street_food", "khlong_kayak", "muay_thai", "food", "bogus"],
        comm: ["voice_noter", "sticker_fan", "nonsense"],
        occupation: "food",
        learning: "Sourdough",
        learningLangs: ["ja", "xx"],
        energy: "curious",
        weekendRhythm: "early_bird",
      },
    });
    expect(r.status).toBe(302);
    const p = await profileOf(m.id);
    expect(p.interests).toEqual(["street_food", "khlong_kayak", "muay_thai", "food"]);
    const bio = cleanBio(p.bio);
    expect(bio.comm).toEqual(["voice_noter", "sticker_fan"]);
    expect(bio.occupation).toBe("food");
    expect(bio.learning).toBe("Sourdough");
    expect(bio.learningLangs).toEqual(["ja"]);
    expect(bio.energy).toBe("curious");
    expect(bio.weekend).toBe("early_bird");
    expect(bio.deck).toEqual(deckFor(m.id));
  });

  it("saves prompt answers per kind and rejects bad ones", async () => {
    const m = await createMember();
    const deck = ALL_KINDS.map((k) => first(k).id);
    await setDeck(m, deck);
    const [text, slider, scale, choice, multi, emoji, rank] = ALL_KINDS.slice(0, 7).map((k) => first(k));
    const page = await (await req("/settings/profile", { cookie: en(m) })).text();
    for (const id of deck) expect(page).toContain(`id="prompt-${id}"`);
    expect(page).toContain('type="range"');

    const bad: Record<string, string | string[]>[] = [
      { [`a_${text.id}`]: "x".repeat(141) },
      { [`a_${slider.id}`]: String((slider.max ?? 10) + 1) },
      { [`a_${scale.id}`]: "6" },
      { [`a_${choice.id}`]: "not-an-option" },
      { [`a_${multi.id}`]: multi.options!.slice(0, 4).map((o) => o.value) },
      { [`a_${emoji.id}`]: "🦄" },
      { [`r_${rank.id}_${rank.options![0].value}`]: "1", [`r_${rank.id}_${rank.options![1].value}`]: "1" },
    ];
    for (const extra of bad) {
      const r = await req("/settings/profile", { cookie: m.cookie, form: { ...base, ...extra } });
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }

    const rankForm: Record<string, string> = {};
    rank.options!.forEach((o, i) => (rankForm[`r_${rank.id}_${o.value}`] = String(rank.options!.length - i)));
    const r = await req("/settings/profile", {
      cookie: m.cookie,
      form: {
        ...base,
        [`a_${text.id}`]: "Lisbon, for the trams",
        [`a_${slider.id}`]: String(slider.max),
        [`a_${scale.id}`]: "4",
        [`a_${choice.id}`]: choice.options![1].value,
        [`a_${multi.id}`]: multi.options!.slice(0, 2).map((o) => o.value),
        [`a_${emoji.id}`]: emoji.options![0].value,
        ...rankForm,
      },
    });
    expect(r.status).toBe(302);
    const a = cleanBio((await profileOf(m.id)).bio).answers!;
    expect(a[text.id]).toEqual({ kind: "text", value: "Lisbon, for the trams" });
    expect(a[slider.id].value).toBe(slider.max);
    expect(a[scale.id].value).toBe(4);
    expect(a[choice.id].value).toBe(choice.options![1].value);
    expect(a[multi.id].value).toEqual(multi.options!.slice(0, 2).map((o) => o.value));
    expect(a[emoji.id].value).toBe(emoji.options![0].value);
    expect(a[rank.id].value).toEqual(rank.options!.map((o) => o.value).reverse());

    // A form without the prompt fields keeps answers; an empty text field and "clear" remove them.
    await req("/settings/profile", { cookie: m.cookie, form: base });
    expect(Object.keys(cleanBio((await profileOf(m.id)).bio).answers!)).toHaveLength(7);
    await req("/settings/profile", { cookie: m.cookie, form: { ...base, [`a_${text.id}`]: "", [`clear_${scale.id}`]: "1" } });
    const after = cleanBio((await profileOf(m.id)).bio).answers!;
    expect(after[text.id]).toBeUndefined();
    expect(after[scale.id]).toBeUndefined();
    expect(after[choice.id]).toBeTruthy();
  });

  it("validates prompt photos before storing anything", async () => {
    const m = await createMember();
    const photo = first("photo");
    await setDeck(m, [first("text").id, photo.id]);
    const send = (file: File, caption = "") => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(base)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
      fd.append(`f_${photo.id}`, file);
      fd.append(`a_${photo.id}`, caption);
      return app.request("/settings/profile", { method: "POST", headers: { cookie: m.cookie }, body: fd }, ENV);
    };
    expect((await send(new File(["gif"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect((await send(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }))).status).toBe(400);
    expect((await send(new File(["x"], "a.png", { type: "image/png" }), "x".repeat(81))).status).toBe(400);
    expect(cleanBio((await profileOf(m.id)).bio).answers?.[photo.id]).toBeUndefined();
  });

  it("shuffle swaps one prompt and keeps the rest of the deck", async () => {
    const m = await createMember();
    const before = currentDeck(m.id, {});
    const target = before[1];
    // Answer it first; the answer goes with the old prompt.
    const q = promptById(target)!;
    if (q.kind === "text") await req("/settings/profile", { cookie: m.cookie, form: { ...base, [`a_${target}`]: "hello" } });
    let r = await req("/settings/prompts/shuffle", { cookie: m.cookie, form: { promptId: target } });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^\/settings\/profile/);
    const bio1 = cleanBio((await profileOf(m.id)).bio);
    expect(bio1.deck).toHaveLength(before.length);
    expect(bio1.deck![1]).not.toBe(target);
    expect(bio1.deck!.filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));
    expect(bio1.answers?.[target]).toBeUndefined();
    // Stable: reloading does not reshuffle.
    await req("/settings/profile", { cookie: m.cookie });
    expect(cleanBio((await profileOf(m.id)).bio).deck).toEqual(bio1.deck);
    // Unknown or foreign prompt ids are refused.
    r = await req("/settings/prompts/shuffle", { cookie: m.cookie, form: { promptId: "not-in-my-deck" } });
    expect(r.status).toBe(400);
    // From the full form: the other fields are saved too.
    r = await req("/settings/prompts/shuffle", { cookie: m.cookie, form: { ...base, nickname: "Shuffled", promptId: bio1.deck![0] } });
    expect(r.status).toBe(302);
    const p2 = await profileOf(m.id);
    expect(p2.nickname).toBe("Shuffled");
    expect(cleanBio(p2.bio).deck![0]).not.toBe(bio1.deck![0]);
  });
});

describe.skipIf(!HAS_DB)("profile: cards", () => {
  async function answered(m: Member) {
    const text = first("text");
    const slider = first("slider");
    await db()
      .update(profiles)
      .set({
        pronouns: "she/her",
        showPronouns: true,
        interests: ["street_food", "cats", "jazz"],
        bio: {
          deck: [text.id, slider.id],
          comm: ["voice_noter"],
          occupation: "other",
          occupationOther: "Librarian",
          answers: { [text.id]: { kind: "text", value: "Tokyo in autumn" }, [slider.id]: { kind: "slider", value: 7 } },
        },
      })
      .where(eq(profiles.accountId, m.id));
  }

  it("/me/profile renders my answers and an edit button", async () => {
    const m = await createMember({ nickname: "MeCard" });
    await answered(m);
    const r = await req("/me/profile", { cookie: en(m) });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("MeCard");
    expect(html).toContain("Tokyo in autumn");
    expect(html).toContain("Librarian");
    expect(html).toContain("Voice-noter");
    expect(html).toContain('href="/settings/profile"');
    expect((await req("/me/profile")).status).toBe(302);
  });

  it("is visible to a groupmate and a connection, never to strangers or after a block", async () => {
    const target = await createMember({ nickname: "Target", romanceOn: true, relationship: "single", genderIdentity: "woman", romanceOpenTo: "everyone", birthDate: "1993-02-14" });
    await answered(target);
    const mate = await createMember({ interests: ["jazz", "running"] });
    const friend = await createMember();
    const stranger = await createMember();
    const noShow = await createMember();
    const ev = await event();
    await attend(ev, target);
    await attend(ev, mate);
    await attend(ev, noShow, false);
    const [a, b] = target.id < friend.id ? [target.id, friend.id] : [friend.id, target.id];
    await db().insert(connections).values({ id: newId(), aAccount: a, bAccount: b, level: "friend", eventId: await event(200) });

    const r = await req(`/people/${target.id}`, { cookie: en(mate) });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Target");
    expect(html).toContain("she/her");
    expect(html).toContain("Tokyo in autumn");
    expect(html).toContain("✨");
    for (const secret of [target.username, "1993-02-14", "Single", "romance", "Open to something more", "woman"]) expect(html).not.toContain(secret);

    expect((await req(`/people/${target.id}`, { cookie: friend.cookie })).status).toBe(200);
    expect((await req(`/people/${target.id}`, { cookie: stranger.cookie })).status).toBe(404);
    expect((await req(`/people/${target.id}`, { cookie: noShow.cookie })).status).toBe(404);
    expect((await req(`/people/${newId()}`, { cookie: mate.cookie })).status).toBe(404);
    expect((await req(`/people/${target.id}`)).status).toBe(302);
    expect((await req(`/people/${target.id}/photo/main`, { cookie: stranger.cookie })).status).toBe(404);

    // Blocked either way: gone.
    await db().insert(blocks).values({ id: newId(), blocker: target.id, blocked: mate.id });
    expect((await req(`/people/${target.id}`, { cookie: mate.cookie })).status).toBe(404);
    // Inactive account: gone.
    await db().update(accounts).set({ status: "banned" }).where(eq(accounts.id, target.id));
    expect((await req(`/people/${target.id}`, { cookie: friend.cookie })).status).toBe(404);
  });

  it("People I Met links to each person's card", async () => {
    const x = await createMember();
    const y = await createMember();
    const ev = await event(2);
    await attend(ev, x);
    await attend(ev, y);
    const html = await (await req(`/events/${ev}/people`, { cookie: x.cookie })).text();
    expect(html).toContain(`href="/people/${y.id}"`);
  });
});
