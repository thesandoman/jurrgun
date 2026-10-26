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
import { buddyMatches, buddyOptins, chatMessages, consents, datingIntents, meetFeedback, planPitches, profiles, safeArrivals, thanks, weeklyPlans } from "../src/schema";

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
    expect(data.datingIntents).toMatchObject({ mode: "dating", reasons: ["long_term"] });
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
});
