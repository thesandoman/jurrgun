/**
 * Privacy risk assessment R4 (design/reference/privacy-risk-assessment.md): the
 * data export includes chats (my own messages), dating intents, buddy data,
 * meet feedback, thanks, plans and "home safe?" answers, with no secrets and
 * nothing private about other people beyond what the member already sees.
 */
import { describe, expect, it } from "vitest";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { eq } from "drizzle-orm";
import { buddyMatches, buddyOptins, chatMessages, connections, consents, datingIntents, events, graduations, meetFeedback, moderationActions, planPitches, profiles, safeArrivals, strikes, thanks, weeklyPlans } from "../src/schema";

describe.skipIf(!HAS_DB)("R4: the data export is complete", () => {
  it("includes the member's own chats, dating, buddy, feedback, thanks, plans and safety checks", async () => {
    const [m, other] = await Promise.all([createMember({ nickname: "Exporter" }), createMember({ nickname: "Buddyname" })]);
    const [a, b] = [m.id, other.id].sort();
    const match = newId();
    const thread = `buddy:${match}`;
    await db().insert(consents).values({ id: newId(), accountId: m.id, category: "romance_data", granted: true, version: "test" });
    await db().insert(datingIntents).values({ accountId: m.id, mode: "dating", reasons: ["long_term"] });
    await db().insert(buddyOptins).values({ accountId: m.id, intent: "friends" });
    await db().insert(buddyMatches).values({ id: match, aAccount: a, bAccount: b, week: "2026-W41", state: "active" });
    await db().insert(chatMessages).values([
      { id: newId(), thread, sender: m.id, body: "my own words", kind: "photo", photoKey: "chat/secret-key.jpg" },
      { id: newId(), thread, sender: other.id, body: "their words" },
    ]);
    await db().insert(meetFeedback).values({ id: newId(), kind: "quest", ref: newId(), accountId: m.id, aboutAccount: other.id, feltSafe: 5, comment: "lovely" });
    await db().insert(meetFeedback).values({ id: newId(), kind: "quest", ref: newId(), accountId: other.id, aboutAccount: m.id, feltSafe: 1, comment: "THEIR PRIVATE FEEDBACK" });
    await db().insert(thanks).values([
      { id: newId(), fromAccount: m.id, toAccount: other.id, context: "conn:x", body: "thanks sent" },
      { id: newId(), fromAccount: other.id, toAccount: m.id, context: "conn:x", body: "thanks got" },
    ]);
    await db().insert(weeklyPlans).values({ id: newId(), accountId: m.id, week: "2026-W41" });
    await db().insert(planPitches).values({ id: newId(), accountId: m.id, week: "2026-W41", what: "kayak pitch", district: "bang_rak", whenText: "Sun", audience: "buddy" });
    await db().insert(safeArrivals).values({ id: newId(), accountId: m.id, context: thread, backBy: new Date(), answer: "safe" });

    const text = await (await req("/settings/privacy/export", { cookie: m.cookie })).text();
    const data = JSON.parse(text);
    expect(data.chatMessagesISent.map((x: { body: string }) => x.body)).toEqual(["my own words"]);
    expect(data.chatMessagesISent[0]).toMatchObject({ thread: "buddy", hasPhoto: true });
    // Card D3: dating "reasons" and "challenges" are no longer collected or exported.
    expect(data.datingIntents).toMatchObject({ mode: "dating" });
    expect(data.datingIntents.reasons).toBeUndefined();
    expect(data.bangkokBuddy.optIn.intent).toBe("friends");
    expect(data.bangkokBuddy.buddies[0]).toMatchObject({ with: "Buddyname", state: "active" });
    expect(data.meetFeedbackIGave.map((x: { comment: string }) => x.comment)).toEqual(["lovely"]);
    expect(data.thanksISent[0]).toMatchObject({ to: "Buddyname", body: "thanks sent" });
    expect(data.thanksIReceived[0]).toMatchObject({ from: "Buddyname", body: "thanks got" });
    expect(data.weeklyPlans).toHaveLength(1);
    expect(data.planPitches[0].what).toBe("kayak pitch");
    expect(data.homeSafeChecks[0]).toMatchObject({ about: "buddy", answer: "safe" });
    // No secrets, nothing private about the other person, no account ids.
    for (const bad of ["their words", "THEIR PRIVATE FEEDBACK", "secret-key", match, other.id, m.id]) expect(text).not.toContain(bad);
    expect(text).not.toMatch(/password|salt|passToken|photoKey/i);
  });

  it("lists the empty-district alert's two fields with the profile", async () => {
    const m = await createMember();
    const sent = new Date("2026-10-20T03:00:00Z");
    await db().update(profiles).set({ districtAlertOptIn: true, districtAlertLastSentAt: sent }).where(eq(profiles.accountId, m.id));
    const data = JSON.parse(await (await req("/settings/privacy/export", { cookie: m.cookie })).text());
    expect(data.profile.districtAlertOptIn).toBe(true);
    expect(data.profile.districtAlertLastSentAt).toBe(sent.toISOString());
    await db().update(profiles).set({ districtAlertOptIn: false }).where(eq(profiles.accountId, m.id));
  });

  it("includes moderation about me, without moderator notes or who acted", async () => {
    const [m, mod] = await Promise.all([createMember(), createMember({ role: "moderator" })]);
    await db().insert(moderationActions).values([
      { id: newId(), accountId: m.id, action: "warning", note: "[harassment] Reporter Nok sent screenshots", by: mod.id },
      { id: newId(), accountId: m.id, action: "note", note: "internal only", by: mod.id },
    ]);
    const text = await (await req("/settings/privacy/export", { cookie: m.cookie })).text();
    const data = JSON.parse(text);
    expect(data.moderationAboutMe.actions).toHaveLength(1);
    expect(data.moderationAboutMe.actions[0]).toMatchObject({ action: "warning", rule: { key: "harassment" } });
    expect(data.moderationAboutMe.flagsOnRecordNow).toBe(1);
    expect(text).not.toContain("Nok");
    expect(text).not.toContain("internal only");
    expect(text).not.toContain(mod.id);
  });

  it("card D1: my own still-in-touch answer and the strike waive reason and note, never the other person's answer or who waived", async () => {
    const [m, other, host] = await Promise.all([createMember({ nickname: "Mine" }), createMember({ nickname: "Theirs" }), createMember({ role: "host" })]);
    const [a, b] = [m.id, other.id].sort();
    const conn = newId();
    await db().insert(connections).values({ id: conn, aAccount: a, bAccount: b, level: "friend", eventId: newId() });
    await db().insert(graduations).values({ id: newId(), connectionId: conn, aStill: a === m.id, bStill: b === m.id });
    const ev = newId();
    const startsAt = new Date(Date.now() - 3 * 86_400_000);
    await db().insert(events).values({ id: ev, title: "Gone", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), venueName: "V", district: "bang_rak", capacity: 6, status: "published", createdBy: host.id });
    await db().insert(strikes).values({ id: newId(), accountId: m.id, eventId: ev, reason: "no_show", expiresAt: new Date(Date.now() + 80 * 86_400_000), waivedBy: host.id, waivedReason: "[travel] Came with Nim, who vouched for her" });
    await db().insert(strikes).values({ id: newId(), accountId: m.id, eventId: newId(), reason: "no_show", expiresAt: new Date(Date.now() + 80 * 86_400_000), waivedBy: host.id, waivedReason: "Old free text before the list" });
    const text = await (await req("/settings/privacy/export", { cookie: m.cookie })).text();
    const data = JSON.parse(text);
    expect(data.friendshipsOutsideTheApp).toEqual([{ with: "Theirs", since: expect.any(String), myStillInTouchAnswer: true }]);
    // Owner decision (2026-10-30): the reason AND the note; older waivers export their note. Never who waived it.
    type S = { waivedBecause: { key: string } | null; waivedNote: string | null };
    const byNote = Object.fromEntries(data.strikes.map((x: S) => [x.waivedNote, x.waivedBecause?.key ?? null]));
    expect(byNote).toEqual({ "Came with Nim, who vouched for her": "travel", "Old free text before the list": null });
    expect(text).not.toContain(host.id);
  });
});
