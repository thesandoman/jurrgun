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
import { accounts, blocks, buddySwipes, datingIntents, notifications, buddyMatches, buddyOptins, buddyQuests, buddyRounds, circleShares, connections, events, passportStamps, profiles, vibes } from "../src/schema";
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

  it("never pairs a real member with a demo or test account (owner C2)", async () => {
    const [r1, r2, d1, d2] = await Promise.all([createMember(), createMember(), createMember(), createMember()]);
    for (const m of [r1, r2, d1, d2]) {
      await withType(m, "BDSH");
      await optIn(m);
    }
    await db().update(accounts).set({ isDemo: true }).where(inArray(accounts.id, [d1.id, d2.id]));
    await only(r1, r2, d1, d2);
    await roundIfDue(env, nextRoundDate());
    const [m1] = await matchOf(r1);
    expect(m1 && [m1.aAccount, m1.bAccount].sort()).toEqual([r1.id, r2.id].sort());
    const [m2] = await matchOf(d1);
    expect(m2 && [m2.aAccount, m2.bAccount].sort()).toEqual([d1.id, d2.id].sort());
  });

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
    // Only hosts (circle heads, partners, admins) see "Make it a table".
    expect(withQuest).not.toContain("Make it a table");
    const q = (await db().select().from(buddyQuests).where(eq(buddyQuests.matchId, m.id))).find((x) => x.scenario !== "season")!;
    await req(`/buddy/${m.id}/quest`, { cookie: a.cookie, form: { go: "1" } });
    expect(await db().select().from(passportStamps).where(eq(passportStamps.accountId, a.id))).toHaveLength(0);
    expect((await req(`/buddy/${m.id}/quest`, { cookie: b.cookie, form: { go: "1" } })).headers.get("location")).toBe("/buddy?notice=stamped");
    for (const x of [a, b]) {
      const stamps = await db().select().from(passportStamps).where(eq(passportStamps.accountId, x.id));
      expect(stamps.map((s) => s.district)).toEqual([q.district]);
    }
    expect(await (await req("/buddy/passport?lang=en", { cookie: a.cookie })).text()).toContain("1 of 50 districts so far");
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

  it("friends only for now: two stored 'open to more' opt-ins stay friends after two quests", async () => {
    const romantic = { romanceOn: true, relationship: "single", genderIdentity: "nonbinary", romanceOpenTo: "everyone" as const };
    const a = await createMember({ nickname: "Cy", ...romantic });
    const b = await createMember({ nickname: "Di", ...romantic });
    await withType(a, "CDSN");
    await withType(b, "CFSN");
    // Rows saved before Phase 2A, when "open to more" was still offered.
    await db().insert(buddyOptins).values([a, b].map((m) => ({ accountId: m.id, intent: "open", active: true, updatedAt: new Date() })));
    // They still load: the opt-in shows them as friends, with no romance choice.
    const page = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(page).toContain("Finding your buddy");
    expect(page).not.toContain('value="open"');
    expect(page).not.toContain('value="dating"');
    expect(page).toMatch(/value="friends"[^>]*checked/);
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
    expect(await db().select().from(passportStamps).where(eq(passportStamps.accountId, a.id))).toHaveLength(1);
    expect((await db().select().from(connections).where(eq(connections.id, conn.id)))[0].level).toBe("activity");
    const told = await db().select().from(notifications).where(and(inArray(notifications.accountId, [a.id, b.id]), eq(notifications.kind, "buddy_mutual")));
    expect(told).toHaveLength(0);
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
    const m = await createMember({ role: "circle_head" });
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
    expect(page).toContain("This month ·");
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
    await db().update(accounts).set({ role: "circle_head" }).where(eq(accounts.id, a.id));
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
    expect(circle).toContain("Plans from your people");
    expect(circle).toContain("Circle dinner");
    expect(circle).toContain(`/events/${id}?t=${token}`);
    expect(circle).toContain("Bangkok Buddy");
    // b isn't a circle head: they're offered to lead a circle instead of hosting.
    expect(circle).toContain('href="/circles/lead"');
    expect(circle).not.toContain('href="/host/new?visibility=private"');
    // Someone else can't send another host's event.
    const stranger = await createMember();
    await req(`/host/${id}/circle`, { cookie: stranger.cookie, form: { go: "1" } });
    expect(await db().select().from(circleShares).where(eq(circleShares.eventId, id))).toHaveLength(1);
    // Once the host is blocked, their private link no longer shows on my circle page.
    await req(`/block/${a.id}`, { cookie: b.cookie, form: { back: "/connections" } });
    const after = await (await req("/connections?lang=en", { cookie: b.cookie })).text();
    expect(after).not.toContain(`/events/${id}?t=${token}`);
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

describe.skipIf(!HAS_DB)("Here for dating", () => {
  it("dating members set their private preferences (no 'why' or 'what's hard' since D3-urgent); kept privately until consent, then saved", async () => {
    const m = await createMember();
    const r = await req("/onboarding/welcome", { cookie: m.cookie, form: { mode: "dating_only" } });
    expect(r.headers.get("location")).toBe("/onboarding/dating");
    const q = await (await req("/onboarding/dating?lang=en", { cookie: m.cookie })).text();
    expect(q).not.toContain("Why are you here for dating?");
    expect(q).not.toContain("What makes dating in Bangkok hard?");
    expect(q).toContain('href="/safety"');
    const res = await req("/onboarding/dating?lang=en", {
      cookie: `${m.cookie}; bkk_intent=dating_only`,
      // An old form may still send reasons and challenges: they're ignored.
      form: { goal: "long_term", reasons: ["long_term", "slow"], challenges: ["safety"] },
    });
    expect(res.headers.get("location")).toBe("/onboarding/quiz");
    // R1: nothing is saved before the romance_data consent.
    expect(await db().select().from(datingIntents).where(eq(datingIntents.accountId, m.id))).toEqual([]);
    const pending = /bkk_dating_pending=[^;]+/.exec(res.headers.get("set-cookie") ?? "")![0];
    expect(decodeURIComponent(pending)).not.toMatch(/reasons|challenges/);
    await db().update(profiles).set({ onboardedAt: null }).where(eq(profiles.accountId, m.id));
    await req("/onboarding/connections", {
      cookie: `${m.cookie}; bkk_intent=dating_only; ${pending}`,
      form: { relationship: "single", romanceOn: "1", romanceConsent: "1", romanceOpenTo: "everyone", ageMin: "18", ageMax: "99" },
    });
    const [row] = await db().select().from(datingIntents).where(eq(datingIntents.accountId, m.id));
    expect(row.mode).toBe("dating_only");
    expect(row.reasons).toEqual([]);
    expect(row.challenges).toEqual([]);
  });

  it("Bangkok Buddy is friends only: no dating choices, and old 'open' or 'dating' posts are saved as friends", async () => {
    const romantic = await createMember({ romanceOn: true, relationship: "single", genderIdentity: "woman", romanceOpenTo: "everyone" });
    await withType2(romantic, "CDSH");
    const page = await (await req("/buddy?lang=en", { cookie: romantic.cookie })).text();
    expect(page).not.toContain('value="dating"');
    expect(page).not.toContain('value="open"');
    expect(page).not.toMatch(/Dating only|Open to more|Romance shows/);
    expect(page).toContain('value="friends"');
    expect(page).toContain('value="activity"');
    for (const intent of ["dating", "open"]) {
      await req("/buddy/optin", { cookie: romantic.cookie, form: { intent } });
      expect((await db().select().from(buddyOptins).where(eq(buddyOptins.accountId, romantic.id)))[0].intent).toBe("friends");
    }
    const th = await (await req("/buddy?lang=th", { cookie: romantic.cookie })).text();
    expect(th).not.toContain("หาเดตอย่างเดียว");
  });

  it("a stored dating-only opt-in no longer limits who someone is paired with", async () => {
    const romantic = { romanceOn: true, relationship: "single", genderIdentity: "man", romanceOpenTo: "everyone" as const };
    const a = await createMember(romantic);
    const friendsOnly = await createMember();
    await withType2(a, "BFSN");
    await withType2(friendsOnly, "BDSN"); // a great type fit, same district
    // Saved before Phase 2A, when "Dating only" was still offered.
    await db().insert(buddyOptins).values({ accountId: a.id, intent: "dating", active: true, updatedAt: new Date() });
    await req("/buddy/optin", { cookie: friendsOnly.cookie, form: { intent: "friends" } });
    await only2(a, friendsOnly);
    await roundIfDue(env, nextRoundDate2());
    const [m] = await matchOf2(a);
    expect([m?.aAccount, m?.bAccount].sort()).toEqual([a.id, friendsOnly.id].sort());
  });
});

describe.skipIf(!HAS_DB)("Safety net and the Buddy tab", () => {
  it("/safety: one-tap helplines, a date plan that is never sent to the server, and the checklist", async () => {
    const html = await (await req("/safety?lang=en")).text();
    for (const n of ["191", "1669", "1300", "1441", "1155"]) expect(html).toContain(`href="tel:${n}"`);
    expect(html).toContain('id="plan"');
    expect(html).not.toMatch(/<form[^>]*id="plan"[^>]*method="post"/);
    expect(html).toContain("never saved on our side");
    expect(html).toContain("Never send money or codes");
  });

  it("Bangkok Buddy is a main tab; Learn and Safety sit at the top of Me", async () => {
    const m = await createMember();
    const html = await (await req("/?lang=en", { cookie: m.cookie })).text();
    const tabbar = html.slice(html.indexOf('class="tabbar"'));
    expect(tabbar).toContain('href="/buddy"');
    expect(tabbar).not.toContain('href="/learn"');
    const me = await (await req("/settings?lang=en", { cookie: m.cookie })).text();
    expect(me).toContain('href="/learn"');
    expect(me).toContain('href="/safety"');
  });
});

describe.skipIf(!HAS_DB)("Buddy deck", () => {
  it("while waiting, meet possible buddies: 'I'm curious to know them' is stored privately and only for people in your deck", async () => {
    // Both open to something more elsewhere in the app: the buddy deck still shows no dating details.
    const romantic = { romanceOn: true, relationship: "single", genderIdentity: "nonbinary", romanceOpenTo: "everyone" as const };
    const a = await createMember({ nickname: "Deckie", ...romantic });
    const b = await createMember({ nickname: "Flickable", ...romantic });
    await withType2(a, "BDSH");
    await withType2(b, "CDSH");
    await req("/buddy/optin", { cookie: a.cookie, form: { intent: "friends" } });
    await req("/buddy/optin", { cookie: b.cookie, form: { intent: "friends" } });
    await only2(a, b);
    const html = await (await req("/buddy/deck?lang=en", { cookie: a.cookie })).text();
    expect(html).toContain("Flickable");
    expect(html).toContain("1 of 15 today");
    // Calm, friends-first words: no swipe language, named buttons with their words on them, no dating chips.
    expect(html).toContain("Meet possible buddies");
    expect(html).toMatch(/<button type="submit"[^>]*>I&#39;m curious to know them<\/button>/);
    expect(html).toMatch(/<button type="submit"[^>]*>Not now<\/button>/);
    // What a member reads: the page body without scripts and styles.
    const words = (h: string) => h.slice(h.indexOf("<body")).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    expect(words(html)).not.toMatch(/[Ff]lick through|[Ss]wip|Keen|>Pass<|I&#39;d meet them/);
    const deckCard = words(html).slice(words(html).indexOf('class="deck-card"'), words(html).indexOf('class="deck-acts"'));
    expect(deckCard).toContain("Flickable");
    expect(deckCard).not.toContain("💘");
    const th = await (await req("/buddy/deck?lang=th", { cookie: a.cookie })).text();
    expect(th).toContain("ดูคนที่อาจเป็นบัดดี้");
    expect(th).toContain("อยากรู้จักเขา");
    expect(th).toContain("ไว้ก่อน");
    expect(th).toContain("1 จาก 15 วันนี้");
    expect(words(th)).not.toMatch(/ปัด|>สนใจ<|"สนใจ"|อยากลองเจอ/);
    const waiting = await (await req("/buddy?lang=en", { cookie: a.cookie })).text();
    expect(waiting).toContain("Meet possible buddies");
    expect(waiting).not.toMatch(/Flick through|🃏/);
    // Someone not in the deck is ignored.
    await req("/buddy/deck", { cookie: a.cookie, form: { target: "nobody", choice: "keen" } });
    await req("/buddy/deck", { cookie: a.cookie, form: { target: b.id, choice: "keen" } });
    const rows = await db().select().from(buddySwipes).where(eq(buddySwipes.accountId, a.id));
    expect(rows.map((r) => [r.targetId, r.choice])).toEqual([[b.id, "keen"]]);
    // b never sees it.
    expect(await (await req("/buddy?lang=en", { cookie: b.cookie })).text()).not.toContain("Deckie");
  });

  it("no swiping: the card leads with their own words and what you share, and the buttons sit below it", async () => {
    const a = await createMember({ nickname: "Reader", interests: ["street_food", "cafes", "running", "museums"], district: "bang_rak" });
    const b = await createMember({ nickname: "Writer", interests: ["street_food", "cafes", "museums", "karaoke"], district: "bang_rak" });
    await withType2(a, "BDSH");
    await withType2(b, "CDSH");
    const bio = { deck: ["small_thing"], answers: { small_thing: { kind: "text", value: "Mango sticky rice after a long Monday" } } };
    await db().update(profiles).set({ bio }).where(eq(profiles.accountId, b.id));
    for (const m of [a, b]) await req("/buddy/optin", { cookie: m.cookie, form: { intent: "friends" } });
    await only2(a, b);
    const html = await (await req("/buddy/deck?lang=en", { cookie: a.cookie })).text();
    // No drag or swipe code and no swipe stamps anywhere on the page.
    const body = html.slice(html.indexOf("<body")).replace(/<style[\s\S]*?<\/style>/g, "");
    expect(body).not.toMatch(/data-deck|deck-stamp|deck-under|\[data-deck\]|LINE=110/);
    expect(html).not.toMatch(/\.deck-stamp|\.deck-under/);
    const card = html.slice(html.indexOf('class="deck-card"'), html.indexOf('class="deck-acts"'));
    // A small initial beside the name, never a big photo.
    expect(card).toContain('class="deck-init"');
    expect(card).not.toContain("<img");
    // Their own words first, then what you share (two or three), then their visible Bangkok Type.
    expect(card).toContain("Mango sticky rice after a long Monday");
    expect(card).toContain("What you share");
    const shared = card.slice(card.indexOf("What you share"));
    expect((shared.match(/class="on"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((shared.match(/class="on"/g) ?? []).length).toBeLessThanOrEqual(3);
    expect(card.indexOf("Mango sticky rice")).toBeLessThan(card.indexOf("What you share"));
    // The decision buttons come after the card, so you read it to reach them.
    const acts = html.indexOf('class="deck-acts"');
    expect(acts).toBeGreaterThan(html.indexOf("Mango sticky rice"));
    expect(html.indexOf(">I&#39;m curious to know them</button>")).toBeGreaterThan(acts);
  });
});

describe.skipIf(!HAS_DB)("Passport as a quiet memory map", () => {
  it("leads with the districts visited, a plain 'so far' line, no ring, no medal, no stamp animation", async () => {
    const m = await createMember();
    await withType2(m, "BDSH");
    const empty = await (await req("/buddy/passport?lang=en", { cookie: m.cookie })).text();
    expect(empty).toContain("No districts yet");
    await db()
      .insert(passportStamps)
      .values(["bang_rak", "pathum_wan"].map((district) => ({ id: randomToken(8), accountId: m.id, district, source: "buddy", createdAt: new Date() })));
    const html = await (await req("/buddy/passport?lang=en", { cookie: m.cookie })).text();
    const card = html.slice(html.indexOf("passport-card"));
    expect(card).toContain("2 of 50 districts so far");
    // The places come first, before the count and the grid of every district.
    expect(card.indexOf("Bang Rak")).toBeLessThan(card.indexOf("2 of 50 districts so far"));
    expect(card.indexOf("2 of 50 districts so far")).toBeLessThan(card.indexOf('class="stamps"'));
    expect(html).not.toMatch(/class="ring|2 \/ 50|🏅|season-badge|on fresh/);
    expect(html).toContain("Season stamps");
    const th = await (await req("/buddy/passport?lang=th", { cookie: m.cookie })).text();
    expect(th).toContain("ไปมาแล้ว 2 จาก 50 เขต");
    // Stamping is a calm toast, not a party.
    const stamped = await (await req("/buddy?lang=en&notice=stamped", { cookie: m.cookie })).text();
    expect(stamped).toContain("New district stamped in your passport");
    expect(stamped).not.toContain("toast party");
  });
});
