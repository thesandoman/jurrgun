/**
 * Buddy-to-partner Pinky (owner card C4): the same Pinky on a Bangkok Buddy
 * pairing. The row depends only on the viewer and the pairing (💘 on, 2
 * finished quests, no block, not ended by "Back to friends", active or ended
 * under 7 days); a tap is answered the same way whatever the buddy's status;
 * it unlocks silently; it posts to the pairing's own action; and a Pinky never
 * changes quests.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req, type Member } from "./helpers";
import { newId } from "../src/lib/crypto";
import { buddyMatches, buddyOptins, buddyQuests, connectionChoices, connections, notifications, profiles } from "../src/schema";

const DAY = 86_400_000;
const en = (m: Member) => `${m.cookie}; lang=en`;
const heart = (gender: string) => ({ romanceOn: true, relationship: "single", genderIdentity: gender, romanceOpenTo: "everyone" as const });

async function buddies(opts: { quests?: number; state?: string; endedAt?: Date; endReason?: string } = {}) {
  const [a, b] = await Promise.all([createMember({ ...heart("woman"), nickname: "Ploy" }), createMember({ ...heart("man"), nickname: "Ken" })]);
  await db().insert(buddyOptins).values([
    { accountId: a.id, intent: "friends" },
    { accountId: b.id, intent: "friends" },
  ]);
  const id = newId();
  await db().insert(buddyMatches).values({ id, aAccount: a.id, bAccount: b.id, week: "2026-W40", state: opts.state ?? "active", endedAt: opts.endedAt ?? null, endReason: opts.endReason ?? null });
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "activity", eventId: `buddy:${id}` });
  for (let i = 0; i < (opts.quests ?? 2); i++) {
    await db().insert(buddyQuests).values({ id: newId(), matchId: id, week: `2026-W3${i}`, scenario: "s", typeCode: "BDSH", district: "bang_rak", aDoneAt: new Date(), bDoneAt: new Date() });
  }
  return { a, b, id };
}
const page = (m: Member) => req("/buddy?pinky=open", { cookie: en(m) }).then((r) => r.text());
function row(html: string): string {
  const i = html.indexOf('<section class="pinky"');
  return i < 0 ? "" : html.slice(i, html.indexOf("</section>", i));
}
const tap = (m: Member, id: string, action = "tap") => req(`/buddy/${id}/pinky`, { cookie: m.cookie, form: { action } });
async function level(id: string, a: Member, b: Member) {
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const [c] = await db().select().from(connections).where(and(eq(connections.aAccount, x), eq(connections.bAccount, y), eq(connections.eventId, `buddy:${id}`)));
  return c?.level;
}

describe.skipIf(!HAS_DB)("buddy-to-partner Pinky (C4)", () => {
  it("shows the same row after 2 quests with 💘 on, posting to the pairing's own action", async () => {
    const { a, b, id } = await buddies();
    const r = row(await page(a));
    expect(r).toContain("Two quests done together.");
    expect(r).toContain(`action="/buddy/${id}/pinky"`);
    expect(r).toContain("A Pinky never changes your quests.");
    // The buddy's status never changes the row.
    await db().update(profiles).set({ romanceOn: false }).where(eq(profiles.accountId, b.id));
    expect(row(await page(a))).toBe(r);
    // Their page has no row: 💘 is off for them.
    expect(row(await page(b))).toBe("");
    // Wrap up and Block sit on the same sheet.
    const html = await page(a);
    expect(html).toContain("Wrap up kindly");
    expect(html).toContain(`action="/block/${b.id}"`);
  });

  it("no row before 2 finished quests", async () => {
    const { a } = await buddies({ quests: 1 });
    expect(row(await page(a))).toBe("");
  });

  it("a one-sided tap never leaks, and both taps unlock with neutral words", async () => {
    const { a, b, id } = await buddies();
    const before = row(await page(b));
    const res = await tap(a, id);
    expect(res.headers.get("location")).toBe("/buddy?pinky=open#pinky");
    expect(row(await page(a))).toContain("Your pinky is out");
    expect(row(await page(b))).toBe(before);
    expect(await db().select().from(notifications).where(eq(notifications.accountId, b.id))).toEqual([]);
    await tap(b, id);
    expect(await level(id, a, b)).toBe("romance");
    expect(row(await page(a))).toContain("You and Ken both hooked pinkies");
    for (const m of [a, b]) {
      const notes = await db().select().from(notifications).where(eq(notifications.accountId, m.id));
      expect(notes.length).toBe(1);
      expect(`${notes[0].titleEn} ${notes[0].titleTh}`.toLowerCase()).not.toMatch(/date|pinky|romance|buddy|เดต|เกี่ยวก้อย/);
    }
  });

  it("never unlocks when the buddy has 💘 off, and answers the tap the same way", async () => {
    const { a, b, id } = await buddies();
    await db().insert(connectionChoices).values({ id: newId(), eventId: `buddy:${id}`, fromAccount: b.id, toAccount: a.id, choice: "romance" });
    await db().update(profiles).set({ romanceOn: false }).where(eq(profiles.accountId, b.id));
    const res = await tap(a, id);
    expect(res.headers.get("location")).toBe("/buddy?pinky=open#pinky");
    expect(await level(id, a, b)).toBe("activity");
  });

  it("Back to friends returns to the buddy friendship, clears both taps, and takes no new tap", async () => {
    const { a, b, id } = await buddies();
    await tap(a, id);
    await tap(b, id);
    const res = await tap(b, id, "back");
    expect(res.headers.get("location")).toBe("/buddy?notice=back_to_friends");
    expect(await level(id, a, b)).toBe("activity");
    expect(await db().select().from(connectionChoices).where(and(eq(connectionChoices.eventId, `buddy:${id}`), eq(connectionChoices.choice, "romance")))).toEqual([]);
    expect(row(await page(a))).toBe("");
    await tap(a, id);
    expect(await db().select().from(connectionChoices).where(eq(connectionChoices.eventId, `buddy:${id}`))).toEqual([]);
  });

  it("a last buddy keeps the row for 7 days after the pairing ends, never after a block", async () => {
    const recent = await buddies({ state: "ended", endedAt: new Date(Date.now() - 2 * DAY), endReason: "mutual" });
    const html = await page(recent.a);
    expect(html).toContain("Your last buddy: Ken");
    expect(row(html)).toContain("Open until");
    const old = await buddies({ state: "ended", endedAt: new Date(Date.now() - 8 * DAY), endReason: "mutual" });
    expect(row(await page(old.a))).toBe("");
    const blocked = await buddies({ state: "ended", endedAt: new Date(Date.now() - DAY), endReason: "blocked" });
    expect(await page(blocked.a)).not.toContain("Your last buddy");
  });
});
