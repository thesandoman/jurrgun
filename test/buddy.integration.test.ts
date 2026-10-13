/**
 * Bangkok Buddy end to end, against local Postgres: opt in, the weekly
 * clearinghouse round, meet, quests and stamps, the romance gate, pass and
 * block.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import { roundIfDue } from "../src/routes/buddy";
import { dayKey } from "../src/domain/buddy";
import { monthKey, seasonQuestFor } from "../src/domain/seasons";
import { randomToken } from "../src/lib/crypto";
import { blocks, notifications, buddyMatches, buddyOptins, buddyQuests, buddyRounds, circleShares, connections, events, passportStamps, profiles, vibes } from "../src/schema";
import type { AppEnv } from "../src/lib/env";

const env = ENV as unknown as AppEnv["Bindings"];
let fakeWeek = 0;
/** A distinct far-future week per round, so tests never share one. */
const nextRoundDate = () => new Date(Date.UTC(2031, 0, 6 + 7 * fakeWeek++, 5));

async function withType(m: Member, archetype: string) {
  await db().insert(vibes).values({ accountId: m.id, vector: {}, archetype, visible: true }).onConflictDoUpdate({ target: vibes.accountId, set: { archetype } });
}
const optIn = (m: Member, intent = "friends") => req("/buddy/optin", { cookie: m.cookie, form: { intent } });
/** Only these members are in the next round's pool. */
async function only(...ms: Member[]) {
  await db().update(buddyOptins).set({ active: false }).where(notInArray(buddyOptins.accountId, ms.map((m) => m.id)));
}
const matchOf = async (m: Member) =>
  (await db().select().from(buddyMatches).where(inArray(buddyMatches.aAccount, [m.id])).limit(5)).concat(
    await db().select().from(buddyMatches).where(inArray(buddyMatches.bAccount, [m.id])).limit(5),
  );

describe.skipIf(!HAS_DB)("Bangkok Buddy", () => {
  beforeAll(async () => {
    // The real week's round is claimed up front, so page visits never pull other tests' members into one.
    await db().insert(buddyRounds).values({ week: dayKey(new Date()), method: "empty", pool: 0, pairs: 0 }).onConflictDoNothing();
  });
  beforeEach(() => undefined);

  it("asks for the Bangkok Type first, then lets you opt in privately", async () => {
    const m = await createMember();
    const html = await (await req("/buddy?lang=en", { cookie: m.cookie })).text();
    expect(html).toContain("Take the Bangkok Type quiz first");
    await withType(m, "BDSH");
    const html2 = await (await req("/buddy?lang=en", { cookie: m.cookie })).text();
    expect(html2).toContain('action="/buddy/optin"');
    expect(html2).toContain("your buddy never sees this");
    expect((await optIn(m, "nonsense")).headers.get("location")).toBe("/buddy");
    expect(await db().select().from(buddyOptins).where(eq(buddyOptins.accountId, m.id))).toHaveLength(0);
    await optIn(m, "activity");
    const [row] = await db().select().from(buddyOptins).where(eq(buddyOptins.accountId, m.id));
    expect(row.intent).toBe("activity");
    expect(row.active).toBe(true);
  });

  it("runs one round per week, pairs people who click, then meet, quest and stamp", async () => {
    const a = await createMember({ nickname: "Ann" });
    const b = await createMember({ nickname: "Bee" });
    await withType(a, "BDSH");
    await withType(b, "CDSH");
    await optIn(a);
    await optIn(b);
    await only(a, b);
    const when = nextRoundDate();
    await roundIfDue(env, when);
    await roundIfDue(env, when); // the second call is a no-op
    const [round] = await db().select().from(buddyRounds).where(eq(buddyRounds.week, dayKey(when)));
    expect(round.pairs).toBe(1);
    expect(round.pool).toBe(2);
    const [m] = await matchOf(a);
    expect(m.state).toBe("proposed");
    expect([m.aAccount, m.bAccount].sort()).toEqual([a.id, b.id].sort());

    // Proposed: they see each other's nickname and type, and may open the card.
    const page = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(page).toContain("Bee");
    expect(page).toContain(`action="/buddy/${m.id}/meet"`);
    expect((await req(`/people/${b.id}`, { cookie: a.cookie })).status).toBe(200);

    // One says meet: nothing yet. Both: an active buddy and a circle connection.
    await req(`/buddy/${m.id}/meet`, { cookie: a.cookie, form: { go: "1" } });
    expect((await matchOf(a))[0].state).toBe("proposed");
    expect((await req(`/buddy/${m.id}/meet`, { cookie: b.cookie, form: { go: "1" } })).headers.get("location")).toBe("/buddy?notice=connected");
    const [active] = await matchOf(a);
    expect(active.state).toBe("active");
    const [conn] = await db().select().from(connections).where(eq(connections.eventId, `buddy:${m.id}`));
    expect(conn.level).toBe("activity");
    const circle = await (await req("/connections?lang=en", { cookie: a.cookie })).text();
    expect(circle).toContain("Bangkok Buddy");

    // This week's quest, then both say "we did it": the district is stamped for both.
    const withQuest = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(withQuest).toContain("This week&#39;s quest");
    expect(withQuest).toContain("Make it a table");
    const q = (await db().select().from(buddyQuests).where(eq(buddyQuests.matchId, m.id))).find((x) => x.scenario !== "season")!;
    await req(`/buddy/${m.id}/quest`, { cookie: a.cookie, form: { go: "1" } });
    expect(await db().select().from(passportStamps).where(eq(passportStamps.accountId, a.id))).toHaveLength(0);
    expect((await req(`/buddy/${m.id}/quest`, { cookie: b.cookie, form: { go: "1" } })).headers.get("location")).toBe("/buddy?notice=stamped");
    for (const x of [a, b]) {
      const stamps = await db().select().from(passportStamps).where(eq(passportStamps.accountId, x.id));
      expect(stamps.map((s) => s.district)).toEqual([q.district]);
    }
    expect(await (await req("/buddy/passport?lang=en", { cookie: a.cookie })).text()).toContain("1 / 50");
    // Friends only: still "activity", no romance.
    expect((await db().select().from(connections).where(eq(connections.id, conn.id)))[0].level).toBe("activity");

    // Someone else can't act on this match.
    const c = await createMember();
    await req(`/buddy/${m.id}/end`, { cookie: c.cookie, form: { go: "1" } });
    expect((await matchOf(a))[0].state).toBe("active");
    // No ghosting: asking to wrap up doesn't end it; the buddy is told and can agree.
    await req(`/buddy/${m.id}/end`, { cookie: a.cookie, form: { note: "busy" } });
    const [asked] = await matchOf(a);
    expect(asked.state).toBe("active");
    expect(asked.endRequestedBy).toBe(a.id);
    const bPage = await (await req("/buddy?lang=en", { cookie: b.cookie })).text();
    expect(bPage).toContain("Your buddy would like to wrap up");
    expect(bPage).toContain("Life got busy for me");
    await req(`/buddy/${m.id}/end`, { cookie: b.cookie, form: { note: "lovely" } });
    const [closed] = await matchOf(a);
    expect(closed.state).toBe("ended");
    expect(closed.endReason).toBe("mutual");
    await only(a, b);
    await roundIfDue(env, nextRoundDate());
    expect((await matchOf(a)).filter((x) => x.state !== "ended")).toHaveLength(0);
  });

  it("reveals romance only when both chose 'open to more' and finished two quests", async () => {
    const romantic = { romanceOn: true, relationship: "single", genderIdentity: "nonbinary", romanceOpenTo: "everyone" as const };
    const a = await createMember({ nickname: "Cy", ...romantic });
    const b = await createMember({ nickname: "Di", ...romantic });
    await withType(a, "CDSN");
    await withType(b, "CFSN");
    await optIn(a, "open");
    await optIn(b, "open");
    await only(a, b);
    await roundIfDue(env, nextRoundDate());
    const [m] = await matchOf(a);
    await req(`/buddy/${m.id}/meet`, { cookie: a.cookie, form: { go: "1" } });
    await req(`/buddy/${m.id}/meet`, { cookie: b.cookie, form: { go: "1" } });
    // A quest finished in an earlier week.
    await db().insert(buddyQuests).values({ id: `q-${m.id}`, matchId: m.id, week: "2020-W01", scenario: "saturday", typeCode: "CDSN", district: "phra_nakhon", aDoneAt: new Date(), bDoneAt: new Date() });
    await req("/buddy", { cookie: a.cookie });
    const [conn] = await db().select().from(connections).where(eq(connections.eventId, `buddy:${m.id}`));
    expect(conn.level).toBe("activity");
    await req(`/buddy/${m.id}/quest`, { cookie: a.cookie, form: { go: "1" } });
    await req(`/buddy/${m.id}/quest`, { cookie: b.cookie, form: { go: "1" } });
    expect((await db().select().from(connections).where(eq(connections.id, conn.id)))[0].level).toBe("romance");
  });

  it("keeps romance hidden when only one chose it", async () => {
    const romantic = { romanceOn: true, relationship: "single", genderIdentity: "woman", romanceOpenTo: "everyone" as const };
    const a = await createMember(romantic);
    const b = await createMember(romantic);
    await withType(a, "BFMN");
    await withType(b, "CFMN");
    await optIn(a, "open");
    await optIn(b, "friends");
    await only(a, b);
    await roundIfDue(env, nextRoundDate());
    const [m] = await matchOf(a);
    await req(`/buddy/${m.id}/meet`, { cookie: a.cookie, form: { go: "1" } });
    await req(`/buddy/${m.id}/meet`, { cookie: b.cookie, form: { go: "1" } });
    await db().insert(buddyQuests).values({ id: `q-${m.id}`, matchId: m.id, week: "2020-W01", scenario: "saturday", typeCode: "BFMN", district: "phra_nakhon", aDoneAt: new Date(), bDoneAt: new Date() });
    await req("/buddy", { cookie: a.cookie });
    await req(`/buddy/${m.id}/quest`, { cookie: a.cookie, form: { go: "1" } });
    await req(`/buddy/${m.id}/quest`, { cookie: b.cookie, form: { go: "1" } });
    const [conn] = await db().select().from(connections).where(eq(connections.eventId, `buddy:${m.id}`));
    expect(conn.level).toBe("activity");
    // Nobody is told anything: no "you both said" notification for either person.
    const told = await db().select().from(notifications).where(and(inArray(notifications.accountId, [a.id, b.id]), eq(notifications.kind, "buddy_mutual")));
    expect(told).toHaveLength(0);
  });

  it("passing ends the match, and blocked people are never paired", async () => {
    const a = await createMember();
    const b = await createMember();
    const c = await createMember();
    await withType(a, "BDMN");
    await withType(b, "CDMN");
    await withType(c, "BDSN");
    for (const x of [a, b, c]) await optIn(x);
    await db().insert(blocks).values({ id: `blk-${a.id}`, blocker: a.id, blocked: b.id });
    await db().insert(blocks).values({ id: `blk2-${a.id}`, blocker: c.id, blocked: a.id });
    await only(a, b, c);
    await roundIfDue(env, nextRoundDate());
    // a blocked b and was blocked by c: a is left alone; b and c may pair.
    expect((await matchOf(a)).length).toBe(0);
    const [bc] = await matchOf(b);
    expect([bc.aAccount, bc.bAccount].sort()).toEqual([b.id, c.id].sort());
    expect((await req(`/buddy/${bc.id}/pass`, { cookie: b.cookie, form: { go: "1" } })).headers.get("location")).toBe("/buddy?notice=done");
    const [after] = await db().select().from(buddyMatches).where(and(eq(buddyMatches.id, bc.id)));
    expect(after.state).toBe("ended");
    expect(after.endedBy).toBe(b.id);
  });

  it("a proposal nobody answered expires at the next round, and both can be matched again", async () => {
    const a = await createMember();
    const b = await createMember();
    const c = await createMember();
    await withType(a, "CFSH");
    await withType(b, "CFSN");
    await withType(c, "BFSH");
    for (const x of [a, b]) await optIn(x);
    await only(a, b);
    await roundIfDue(env, nextRoundDate());
    const [m] = await matchOf(a);
    expect(m.state).toBe("proposed");
    await optIn(c);
    await only(a, b, c);
    await roundIfDue(env, nextRoundDate());
    const [old] = await db().select().from(buddyMatches).where(eq(buddyMatches.id, m.id));
    expect(old.state).toBe("ended");
    expect(old.endedBy).toBe("expired");
    // a and b won't be paired again; one of them pairs with c.
    const fresh = [...(await matchOf(a)), ...(await matchOf(b))].filter((x) => x.state === "proposed");
    expect(fresh).toHaveLength(1);
    expect([fresh[0].aAccount, fresh[0].bAccount]).toContain(c.id);
  });

  it("'Make it a table' prefills the host form with the quest's district", async () => {
    const m = await createMember();
    const html = await (await req("/host/new?district=nong_chok&title=Rice%20fields%20walk&lang=en", { cookie: m.cookie })).text();
    expect(html).toContain("Rice fields walk");
    expect(html).toMatch(/value="nong_chok"[^>]*selected|selected[^>]*value="nong_chok"/);
  });
});

// ------------------------------------------------ round two --

let fake2 = 0;
/** Far-future round dates, a week apart, never shared with other tests. */
const nextRoundDate2 = () => new Date(Date.UTC(2033, 0, 4 + 7 * fake2++, 5));
const DAY = 86_400_000;

async function withType2(m: Member, archetype: string) {
  await db().insert(vibes).values({ accountId: m.id, vector: {}, archetype, visible: true }).onConflictDoUpdate({ target: vibes.accountId, set: { archetype } });
}
const optIn2 = (m: Member, intent = "friends") => req("/buddy/optin", { cookie: m.cookie, form: { intent } });
async function only2(...ms: Member[]) {
  await db().update(buddyOptins).set({ active: false }).where(notInArray(buddyOptins.accountId, ms.map((m) => m.id)));
}
async function matchOf2(m: Member) {
  const all = await db().select().from(buddyMatches).where(inArray(buddyMatches.aAccount, [m.id])).limit(5);
  return all.concat(await db().select().from(buddyMatches).where(inArray(buddyMatches.bAccount, [m.id])).limit(5));
}
/** Two members paired and both said meet. */
async function activePair(ta = "BDSH", tb = "CDSH") {
  const a = await createMember({ nickname: `A${randomToken(3)}` });
  const b = await createMember({ nickname: `B${randomToken(3)}` });
  await withType2(a, ta);
  await withType2(b, tb);
  await optIn2(a);
  await optIn2(b);
  await only2(a, b);
  await roundIfDue(env, nextRoundDate2());
  const [m] = await matchOf2(a);
  await req(`/buddy/${m.id}/meet`, { cookie: a.cookie, form: { go: "1" } });
  await req(`/buddy/${m.id}/meet`, { cookie: b.cookie, form: { go: "1" } });
  const [active] = await matchOf2(a);
  expect(active.state).toBe("active");
  return { a, b, m: active };
}

describe.skipIf(!HAS_DB)("Bangkok Buddy: no ghosting", () => {
  beforeAll(async () => {
    await db().insert(buddyRounds).values({ week: dayKey(new Date()), method: "empty", pool: 0, pairs: 0 }).onConflictDoNothing();
  });

  it("closes at once when both have shared a contact (moved off the app)", async () => {
    const { a, b, m } = await activePair();
    for (const x of [a, b]) await req(`/connections/${m.connectionId}/share`, { cookie: x.cookie, form: { method: "line", value: `id_${x.id.slice(0, 6)}` } });
    const page = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(page).toContain("You&#39;ve both shared a contact");
    await req(`/buddy/${m.id}/end`, { cookie: a.cookie, form: { note: "offapp" } });
    const [after] = await db().select().from(buddyMatches).where(eq(buddyMatches.id, m.id));
    expect(after.state).toBe("ended");
    expect(after.endReason).toBe("moved_off_app");
    // The circle connection stays: they keep in touch.
    const [conn] = await db().select().from(connections).where(eq(connections.id, m.connectionId!));
    expect(conn.removedAt).toBeNull();
  });

  it("a wrap-up with no reply closes kindly after 7 days, and can be taken back before that", async () => {
    const { a, b, m } = await activePair("CFMN", "CFMH");
    await req(`/buddy/${m.id}/end`, { cookie: a.cookie, form: { note: "different" } });
    const told = await db().select().from(notifications).where(and(eq(notifications.accountId, b.id), eq(notifications.kind, "buddy_wrap")));
    expect(told).toHaveLength(1);
    expect(told[0].titleEn).toContain("I'd like to try a different buddy");
    // Taking it back.
    await req(`/buddy/${m.id}/keep`, { cookie: a.cookie, form: { go: "1" } });
    expect((await db().select().from(buddyMatches).where(eq(buddyMatches.id, m.id)))[0].endRequestedBy).toBeNull();
    // Ask again, then 8 days pass with no reply.
    await req(`/buddy/${m.id}/end`, { cookie: a.cookie, form: { note: "busy" } });
    await db().update(buddyMatches).set({ endRequestedAt: new Date(Date.now() - 8 * DAY) }).where(eq(buddyMatches.id, m.id));
    await only2();
    await roundIfDue(env, nextRoundDate2());
    const [after] = await db().select().from(buddyMatches).where(eq(buddyMatches.id, m.id));
    expect(after.state).toBe("ended");
    expect(after.endReason).toBe("notice");
  });

  it("blocking ends the pairing at once (safety first)", async () => {
    const { a, b, m } = await activePair("BFSN", "CFSN");
    await req(`/block/${b.id}`, { cookie: a.cookie, form: { back: "/buddy" } });
    const [after] = await db().select().from(buddyMatches).where(eq(buddyMatches.id, m.id));
    expect(after.state).toBe("ended");
    expect(after.endReason).toBe("blocked");
  });

  it("the code of conduct spells out the no-ghosting rule", async () => {
    const html = await (await req("/code-of-conduct?lang=en")).text();
    expect(html).toContain('id="no-ghosting"');
    expect(html).toContain("moved off the app");
    expect(html).toContain("closes on its own after 7 days");
  });
});

describe.skipIf(!HAS_DB)("Bangkok Buddy: monthly big quest", () => {
  it("shows this month's themed quest next to the weekly one; finishing it earns a season badge", async () => {
    const { a, b, m } = await activePair("BFMH", "CFMH");
    const key = monthKey(new Date());
    const season = seasonQuestFor(key)!;
    const page = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(page).toContain("This month&#39;s big quest");
    expect(page).toContain(`name="quest" value="${key}"`);
    for (const x of [a, b]) await req(`/buddy/${m.id}/quest`, { cookie: x.cookie, form: { quest: key } });
    const [q] = await db().select().from(buddyQuests).where(and(eq(buddyQuests.matchId, m.id), eq(buddyQuests.week, key)));
    expect(q.aDoneAt).not.toBeNull();
    expect(q.bDoneAt).not.toBeNull();
    const stamps = await db().select().from(passportStamps).where(eq(passportStamps.accountId, a.id));
    expect(stamps.map((s) => s.district)).toContain(season.district);
    const passport = await (await req("/buddy/passport?lang=en", { cookie: a.cookie })).text();
    expect(passport).toContain(season.theme.en.replace(/'/g, "&#39;"));
  });
});

describe.skipIf(!HAS_DB)("Dating or not, from the first screen", () => {
  it("friends-only2 hides the romance step; dating switches it on (consent still required)", async () => {
    const m = await createMember();
    // Mid-onboarding: the connections step is still open.
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    const friendsOnly = await (await req("/onboarding/connections?lang=en", { cookie: `${m.cookie}; bkk_intent=friends` })).text();
    expect(friendsOnly).not.toContain("Open to something more?");
    const datingToo = await (await req("/onboarding/connections?lang=en", { cookie: `${m.cookie}; bkk_intent=dating` })).text();
    expect(datingToo).toContain("Open to something more?");
    expect(datingToo).toMatch(/name="romanceOn" value="1" checked/);
    const welcome = await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "friends" } });
    expect(welcome.headers.get("set-cookie")).toContain("bkk_intent=friends");
    const dating = await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "dating" } });
    expect(dating.headers.get("set-cookie")).toContain("bkk_intent=dating");
    const odd = await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "something" } });
    expect(odd.headers.get("set-cookie")).toContain("bkk_intent=friends");
  });
});

describe.skipIf(!HAS_DB)("Circle: group hangouts", () => {
  it("a host sends a private hangout to their circle; it shows on the circle page with a working link", async () => {
    const { a, b } = await activePair("BDSN", "CDSN");
    const id = `ev-${randomToken(6)}`;
    const token = randomToken(16);
    const startsAt = new Date(Date.now() + 3 * DAY);
    await db()
      .insert(events)
      .values({ id, title: "Circle dinner", startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600_000), venueName: "Ari", district: "phaya_thai", capacity: 8, status: "published", visibility: "private", privateToken: token, hostAccountId: a.id, createdBy: a.id });
    const sent = await req(`/host/${id}/circle`, { cookie: a.cookie, form: { go: "1" } });
    expect(sent.headers.get("location")).toBe("/host?notice=circle_sent");
    expect(await db().select().from(circleShares).where(and(eq(circleShares.eventId, id), eq(circleShares.toAccount, b.id)))).toHaveLength(1);
    // Repeating it doesn't send twice.
    await req(`/host/${id}/circle`, { cookie: a.cookie, form: { go: "1" } });
    expect(await db().select().from(circleShares).where(eq(circleShares.eventId, id))).toHaveLength(1);
    const circle = await (await req("/connections?lang=en", { cookie: b.cookie })).text();
    expect(circle).toContain("Group hangouts");
    expect(circle).toContain("Circle dinner");
    expect(circle).toContain(`/events/${id}?t=${token}`);
    expect(circle).toContain("Bangkok Buddy");
    expect(circle).toContain('href="/host/new?visibility=private"');
    // Someone else can't send another host's event.
    const stranger = await createMember();
    await req(`/host/${id}/circle`, { cookie: stranger.cookie, form: { go: "1" } });
    expect(await db().select().from(circleShares).where(eq(circleShares.eventId, id))).toHaveLength(1);
  });
});

describe.skipIf(!HAS_DB)("City Pulse copy", () => {
  it("no longer says answers go to BMA", async () => {
    const m = await createMember();
    for (const path of ["/pulse?lang=en", "/settings?lang=en", "/privacy?lang=en", "/faq?lang=en"]) {
      const html = await (await req(path, { cookie: m.cookie })).text();
      expect(html, path).not.toMatch(/BMA (only2 )?sees|for BMA|shown to BMA|What does BMA see/);
    }
  });
});
