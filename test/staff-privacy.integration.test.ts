/**
 * BMA staff roles (bma_admin, moderator, insight_viewer) moderate and oversee
 * Jurrgun, but never see a member's private life (PRD v3 §3.4, §13.0; the
 * privacy notice): relationship status, Open to something more and its
 * settings, gender identity, orientation, dating answers, private choices or
 * other people's chats.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMember, db, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { connections, profiles } from "../src/schema";
import { datingDeckFor, promptById } from "../src/content/profile";
import { redactSensitive } from "../src/lib/records";

describe("audit detail redaction", () => {
  it("hides private keys at any depth and keeps the rest", () => {
    expect(redactSensitive({ changed: { romance_data: false, research: true }, relationship: "single", nested: [{ genderIdentity: "woman", n: 2 }] })).toEqual({
      changed: { romance_data: "[private]", research: true },
      relationship: "[private]",
      nested: [{ genderIdentity: "[private]", n: 2 }],
    });
  });
});

describe.skipIf(!HAS_DB)("what BMA staff can see", () => {
  it("staff pages never show a member's romance, relationship, gender or dating data", async () => {
    const secret = `Sunset boat ${newId().slice(0, 8)}`;
    const m = await createMember({ relationship: "prefer_not", nickname: "Ploy" });
    await req("/settings/quick", { cookie: m.cookie, form: { key: "romance", on: "1", consent: "1" } });
    const id = datingDeckFor(m.id).find((x) => promptById(x)!.kind === "text")!;
    await db()
      .update(profiles)
      .set({ orientation: "bi", genderIdentity: "non-binary", gender: "non-binary", bio: { datingDeck: datingDeckFor(m.id), answers: { [id]: { kind: "text", value: secret } } } })
      .where(eq(profiles.accountId, m.id));
    // Withdrawing romance data writes a consent change to the audit log.
    await req("/settings/privacy", { cookie: m.cookie, form: { save: "1" } });

    const [admin, mod, viewer] = await Promise.all([createMember({ role: "bma_admin" }), createMember({ role: "moderator" }), createMember({ role: "insight_viewer" })]);
    const pages = ["/admin", "/admin/users", `/admin/users?q=${m.id}`, `/admin/users/${m.id}`, "/admin/audit", "/admin/moderation", "/admin/review", "/admin/insights", "/admin/pulse", "/admin/partners", "/admin/events"];
    for (const staff of [admin, mod, viewer]) {
      for (const path of pages) {
        const html = await (await req(`${path}${path.includes("?") ? "&" : "?"}lang=en`, { cookie: staff.cookie })).text();
        expect(html, path).not.toContain(secret);
        expect(html, path).not.toMatch(/romance_data(&quot;|")?\s*:\s*(true|false)/);
        expect(html, path).not.toContain("relationship_changed");
        expect(html, path).not.toMatch(/Open to something more|เปิดใจมากกว่าเพื่อน/);
        expect(html, path).not.toMatch(/Bisexual|ไบเซ็กชวล/);
      }
    }
    // The consent change is in the log (so the checks above mean something), with its key redacted.
    const log = await (await req("/admin/audit?lang=en", { cookie: admin.cookie })).text();
    expect(log).toContain("consent.updated");
    expect(log).toContain("[private]");
  });

  it("staff can't open members' chats or profiles they aren't part of", async () => {
    const [a, b, admin] = await Promise.all([createMember(), createMember(), createMember({ role: "bma_admin" })]);
    const conn = newId();
    await db().insert(connections).values({ id: conn, aAccount: a.id, bAccount: b.id, level: "friend", eventId: newId() });
    expect([403, 404]).toContain((await req(`/chat/conn:${conn}`, { cookie: admin.cookie })).status);
    expect((await req(`/people/${a.id}`, { cookie: admin.cookie })).status).toBe(404);
  });
});
