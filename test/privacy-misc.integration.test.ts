/**
 * Privacy risk assessment R8 to R11 (design/reference/privacy-risk-assessment.md):
 * the buddy deck respects a hidden Bangkok Type, the audit log never names the
 * other person in a block or a removal, client IPs are keyed hashes, and
 * sign-in usernames are never stored in the clear.
 */
import { describe, expect, it } from "vitest";
import { eq, notInArray } from "drizzle-orm";
import app from "../src/index";
import { createMember, db, ENV, HAS_DB, req, type Member } from "./helpers";
import { hmacSha256, newId, sha256 } from "../src/lib/crypto";
import { shownTarget } from "../src/lib/records";
import { auditLog, buddyOptins, connections, loginAttempts, vibes } from "../src/schema";
import { ARCHETYPES } from "../src/vibe/archetypes";

const withType = (m: Member, archetype: string, visible: boolean) =>
  db().insert(vibes).values({ accountId: m.id, vector: {}, archetype, visible }).onConflictDoUpdate({ target: vibes.accountId, set: { archetype, visible } });

describe.skipIf(!HAS_DB)("R8: the buddy deck respects a hidden Bangkok Type", () => {
  it("shows the type only when its owner chose to show it", async () => {
    const [a, b] = await Promise.all([createMember({ nickname: "DeckA" }), createMember({ nickname: "DeckB" })]);
    await withType(a, "BDSH", true);
    await withType(b, "CDSH", false);
    for (const m of [a, b]) await req("/buddy/optin", { cookie: m.cookie, form: { intent: "friends" } });
    await db().update(buddyOptins).set({ active: false }).where(notInArray(buddyOptins.accountId, [a.id, b.id]));
    const card = async () => {
      const html = await (await req("/buddy/deck?lang=en", { cookie: a.cookie })).text();
      return html.slice(html.indexOf('class="deck-card"'), html.indexOf('class="deck-acts"'));
    };
    const hidden = await card();
    expect(hidden).toContain("DeckB");
    expect(hidden).not.toContain(ARCHETYPES.CDSH.name.en);
    expect(hidden).not.toContain(ARCHETYPES.CDSH.emoji);
    await withType(b, "CDSH", true);
    expect(await card()).toContain(ARCHETYPES.CDSH.name.en);
  });
});

describe.skipIf(!HAS_DB)("R9: the audit log never names the other person in a block or a removal", () => {
  it("block and remove are logged without a target, and older rows are shown without it", async () => {
    const [me, other, third] = await Promise.all([createMember(), createMember(), createMember()]);
    const [x, y] = [me.id, third.id].sort();
    await db().insert(connections).values({ id: newId(), aAccount: x, bAccount: y, level: "friend", eventId: newId() });
    await req(`/connections/${third.id}/remove`, { cookie: me.cookie, method: "POST" });
    await req(`/block/${other.id}`, { cookie: me.cookie, method: "POST" });
    const rows = await db().select().from(auditLog).where(eq(auditLog.actor, me.id));
    const logged = rows.filter((r) => r.action === "block.create" || r.action === "connection.remove");
    expect(logged.length).toBeGreaterThan(0);
    for (const r of logged) {
      expect(r.targetId).toBeNull();
      expect(JSON.stringify(r.detail)).not.toContain(other.id);
      expect(JSON.stringify(r.detail)).not.toContain(third.id);
    }
    expect(shownTarget("block.create", "account", other.id)).toBe("account:[private]");
    expect(shownTarget("event.update", "event", "e1")).toBe("event:e1");
  });
});

describe.skipIf(!HAS_DB)("R10, R11: sign-in attempts keep no raw IP hash or username", () => {
  it("stores a keyed IP hash and a hashed username, and the lock still works", async () => {
    const m = await createMember();
    const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const login = (env: Record<string, string> = {}) =>
      app.request(
        "/login",
        { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip }, body: new URLSearchParams({ username: m.username, password: "wrongpass1" }).toString() },
        { ...ENV, ...env },
      );
    for (let i = 0; i < 5; i++) expect((await login()).status).toBe(400);
    expect((await login()).status).toBe(429);
    // Tests set no secret: the key is just the prefix.
    const ipHash = await hmacSha256("ip:", ip);
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.ipHash, ipHash));
    expect(rows).toHaveLength(5);
    expect(await db().select().from(loginAttempts).where(eq(loginAttempts.username, m.username))).toEqual([]);
    expect(await db().select().from(loginAttempts).where(eq(loginAttempts.ipHash, await sha256(ip)))).toEqual([]);
    expect(new Set(rows.map((r) => r.username))).toEqual(new Set([`user:${await hmacSha256("user:", m.username)}`]));
    // With a secret set, both hashes change: they really are keyed.
    await login({ IP_HASH_SECRET: "another-test-secret" });
    const keyed = await db().select().from(loginAttempts).where(eq(loginAttempts.ipHash, await hmacSha256("ip:another-test-secret", ip)));
    expect(keyed.map((r) => r.username)).toEqual([`user:${await hmacSha256("user:another-test-secret", m.username)}`]);
  });
});
