/**
 * The privacy notice's promises, against the running app and local Postgres.
 * One test per promise, so the notice and the code can't drift apart.
 *
 * Tests marked PENDING check code the privacy fixes are bringing (owner,
 * 16 Oct 2026, design/reference/privacy-risk-assessment.md §7). They fail
 * until those changes land; they are not to be weakened.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import app from "../src/index";
import { ENV, HAS_DB, attendedOnce, createMember, db, req } from "./helpers";
import * as schema from "../src/schema";
import {
  accounts,
  auditLog,
  blocks,
  buddyOptins,
  chatMessages,
  consents,
  datingIntents,
  events,
  feedback,
  loginAttempts,
  notifications,
  pulseQuestions,
  pulseResponses,
  registrations,
  thanks,
  vibes,
} from "../src/schema";
import { newId, randomToken, sha256 } from "../src/lib/crypto";
import { CONSENT_CATEGORIES } from "../src/content/privacy";
import { DEACTIVATED_RETENTION_DAYS, runRetention } from "../src/services/retention";
import { KIND_TOMORROW, runClock } from "../src/services/clock";
import { ARCHETYPES } from "../src/vibe/archetypes";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const latest = async (id: string, category: string) =>
  (await db().select().from(consents).where(and(eq(consents.accountId, id), eq(consents.category, category))).orderBy(desc(consents.createdAt)).limit(1))[0];

describe.skipIf(!HAS_DB)("consent centre", () => {
  it("lists every category with its state and date, and links to export and delete", async () => {
    const m = await createMember({ research: true });
    for (const lang of ["th", "en"] as const) {
      const html = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=${lang}` })).text();
      for (const c of CONSENT_CATEGORIES) expect(html, c.key).toContain(c.title[lang]);
      expect(html).toContain('href="/settings/privacy/export"');
      expect(html).toContain('href="/settings/privacy#deactivate"');
      expect(html).toContain('href="/privacy"');
    }
    const en = await (await req("/settings/consents", { cookie: `${m.cookie}; lang=en` })).text();
    expect(en).toMatch(/Given \d{1,2} [A-Z][a-z]{2} \d{4}/);
    // Required ones are explained, never a switch.
    expect(en).not.toContain('name="consent_service"');
    expect(en).not.toContain('name="consent_safety"');
    for (const key of ["personalization", "research", "notifications", "profile_links"]) expect(en).toContain(`name="consent_${key}"`);
  });

  it("is linked from Me, the Privacy Center and the notice", async () => {
    const m = await createMember();
    expect(await (await req("/settings", { cookie: m.cookie })).text()).toContain('href="/settings/consents"');
    expect(await (await req("/settings/privacy", { cookie: m.cookie })).text()).toContain('href="/settings/consents"');
    expect(await (await app.request("/privacy")).text()).toContain('href="/settings/consents"');
    expect(await (await req("/settings", { cookie: m.cookie })).text()).toContain('href="/safety/how"');
  });

  it("switches social links on and off with append-only rows, through the same handler", async () => {
    const m = await createMember();
    let r = await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1", consent_profile_links: "1" } });
    expect(r.headers.get("location")).toBe("/settings/consents?notice=saved");
    expect((await latest(m.id, "profile_links")).granted).toBe(true);
    // The Privacy Center's older form has no social links switch: it never turns them off.
    await req("/settings/privacy", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "profile_links")).granted).toBe(true);
    await new Promise((res) => setTimeout(res, 5));
    r = await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "profile_links")).granted).toBe(false);
    const rows = await db().select().from(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "profile_links")));
    expect(rows).toHaveLength(2);
  });
});

describe.skipIf(!HAS_DB)("the notice's promises", () => {
  it("withdrawing Open to something more deletes dating goals at once (PENDING: privacy fixes)", async () => {
    const m = await createMember({ relationship: "single" });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single", romanceOn: "1", romanceConsent: "1", genderIdentity: "woman", romanceOpenTo: "everyone" } });
    await db().insert(datingIntents).values({ accountId: m.id, mode: "dating", reasons: ["new_city"], prefs: { kids: "open" } }).onConflictDoNothing();
    await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "romance_data")).granted).toBe(false);
    expect(await db().select().from(datingIntents).where(eq(datingIntents.accountId, m.id))).toHaveLength(0);
  });

  it("relationship status is saved with a consent row (PENDING: privacy fixes)", async () => {
    const m = await createMember({ relationship: "prefer_not" });
    await req("/settings/connections", { cookie: m.cookie, form: { relationship: "single" } });
    expect((await latest(m.id, "relationship_data"))?.granted).toBe(true);
  });

  it("turning City Pulse off deletes or unlinks past answers (PENDING: privacy fixes)", async () => {
    const m = await createMember({ research: true });
    const qid = newId();
    await db().insert(pulseQuestions).values({ id: qid, promptTh: "ทดสอบ", promptEn: "Withdraw test", kind: "text", status: "archived", createdBy: "test" });
    await db().insert(pulseResponses).values({ id: newId(), questionId: qid, researchId: m.researchId, answer: "keep me?" });
    await req("/settings/consents", { cookie: m.cookie, form: { present: "1", consent_personalization: "1", consent_notifications: "1" } });
    expect((await latest(m.id, "research")).granted).toBe(false);
    expect(await db().select().from(pulseResponses).where(eq(pulseResponses.researchId, m.researchId))).toHaveLength(0);
  });

  it("no answer about reminders means no reminders (PENDING: privacy fixes)", async () => {
    const m = await createMember();
    await db().delete(consents).where(and(eq(consents.accountId, m.id), eq(consents.category, "notifications")));
    const day = new Date();
    const now = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 0, 0));
    const ev = newId();
    await db().insert(events).values({ id: ev, title: `PRIV-${ev.slice(0, 8)}`, startsAt: new Date(now.getTime() + 24 * HOUR), endsAt: new Date(now.getTime() + 26 * HOUR), venueName: "Lumphini Park", district: "pathum_wan", capacity: 10, status: "published", createdBy: "test" });
    await db().insert(registrations).values({ id: newId(), eventId: ev, accountId: m.id, status: "confirmed", passToken: randomToken(18) });
    await runClock(ENV, now);
    const got = await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, KIND_TOMORROW)));
    await db().delete(events).where(eq(events.id, ev));
    expect(got).toHaveLength(0);
  });

  it("buddy cards show no photo or age, and a hidden Bangkok Type stays hidden (PENDING: privacy fixes)", async () => {
    const a = await createMember({ nickname: "CardReader" });
    const b = await createMember({ nickname: "HiddenType", birthDate: "1990-01-01" });
    await db().insert(vibes).values({ accountId: a.id, vector: {}, archetype: "BDSH", visible: true }).onConflictDoNothing();
    await db().insert(vibes).values({ accountId: b.id, vector: {}, archetype: "CDSH", visible: false }).onConflictDoNothing();
    await req("/buddy/optin", { cookie: a.cookie, form: { intent: "friends" } });
    await req("/buddy/optin", { cookie: b.cookie, form: { intent: "friends" } });
    await db().update(buddyOptins).set({ active: false }).where(sql`${buddyOptins.accountId} not in (${a.id}, ${b.id})`);
    const html = await (await req("/buddy/deck?lang=en", { cookie: a.cookie })).text();
    const card = html.slice(html.indexOf('class="deck-card"'), html.indexOf('class="deck-acts"'));
    expect(card).toContain("HiddenType");
    expect(card).not.toContain("<img");
    expect(card).not.toMatch(/\b3[0-9] (years|yrs)\b/);
    expect(card).not.toContain(ARCHETYPES.CDSH.name.en);
  });

  it("sign-in attempts keep neither the username nor a plain IP hash (PENDING: privacy fixes)", async () => {
    const username = `nobody_${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
    const ip = "203.0.113.77";
    const body = new URLSearchParams({ username, password: "wrongpass12" }).toString();
    await app.request("/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip }, body }, ENV);
    const rows = await db().select().from(loginAttempts).where(eq(loginAttempts.ipHash, await sha256(ip)));
    expect(rows).toHaveLength(0);
    expect(await db().select().from(loginAttempts).where(eq(loginAttempts.username, username))).toHaveLength(0);
  });

  it("read notifications go after 90 days and the audit log after 2 years (PENDING: privacy fixes)", async () => {
    const m = await createMember();
    const old = new Date(Date.now() - 91 * DAY);
    const readId = newId();
    const unreadId = newId();
    await db().insert(notifications).values([
      { id: readId, accountId: m.id, kind: "test", titleTh: "อ่านแล้ว", titleEn: "Read", link: "/", createdAt: old, readAt: old },
      { id: unreadId, accountId: m.id, kind: "test", titleTh: "ยังไม่อ่าน", titleEn: "Unread", link: "/", createdAt: old },
    ]);
    const auditId = newId();
    await db().insert(auditLog).values({ id: auditId, actor: m.id, action: "test.old", createdAt: new Date(Date.now() - 731 * DAY) });
    await runRetention(ENV);
    expect(await db().select().from(notifications).where(eq(notifications.id, readId))).toHaveLength(0);
    expect(await db().select().from(auditLog).where(eq(auditLog.id, auditId))).toHaveLength(0);
  });

  it("the data export includes chats, dating goals, buddy data, feedback and thank-yous (PENDING: privacy fixes)", async () => {
    const m = await createMember();
    const other = await createMember();
    const marker = `export-${randomToken(6)}`;
    const ev = await attendedOnce(m.id);
    await db().insert(chatMessages).values({ id: newId(), thread: `circle:${ev}`, sender: m.id, body: `${marker}-chat` });
    await db().insert(datingIntents).values({ accountId: m.id, mode: "dating", reasons: [`${marker}-why`] });
    await db().insert(buddyOptins).values({ accountId: m.id, intent: "friends", active: true, updatedAt: new Date() }).onConflictDoNothing();
    await db().insert(thanks).values({ id: newId(), fromAccount: m.id, toAccount: other.id, context: `conn:${newId()}`, body: `${marker}-thanks` });
    await db().insert(feedback).values({ id: newId(), eventId: ev, accountId: m.id, comment: `${marker}-feedback` }).onConflictDoNothing();
    const text = await (await req("/settings/privacy/export", { cookie: m.cookie })).text();
    for (const part of ["chat", "why", "thanks", "feedback"]) expect(text, part).toContain(`${marker}-${part}`);
    expect(text).toMatch(/buddy/i);
  });

  it("a closed account is deleted everywhere after 30 days, except safety records (PENDING: privacy fixes)", async () => {
    const m = await createMember();
    const other = await createMember();
    const ev = await attendedOnce(m.id);
    await db().insert(blocks).values({ id: newId(), blocker: m.id, blocked: other.id });
    await db().insert(chatMessages).values({ id: newId(), thread: `circle:${ev}`, sender: m.id, body: "bye" });
    await db().insert(datingIntents).values({ accountId: m.id, mode: "friends" }).onConflictDoNothing();
    await db().insert(thanks).values({ id: newId(), fromAccount: other.id, toAccount: m.id, context: `conn:${newId()}`, body: "thanks" });
    await db().insert(feedback).values({ id: newId(), eventId: ev, accountId: m.id, comment: "lovely" }).onConflictDoNothing();
    await db()
      .update(accounts)
      .set({ status: "deactivated", deactivatedAt: new Date(Date.now() - (DEACTIVATED_RETENTION_DAYS + 1) * DAY) })
      .where(eq(accounts.id, m.id));
    await runRetention(ENV);
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, m.id));
    expect(acct.status).toBe("deleted");
    // Kept on purpose, each with its own period in the notice.
    const KEPT = new Set(["identity_accounts", "social_reports", "social_moderation_actions", "social_strikes", "identity_audit_log"]);
    const left: string[] = [];
    for (const value of Object.values(schema)) {
      if (!value || typeof value !== "object" || !(Symbol.for("drizzle:IsDrizzleTable") in (value as object))) continue;
      const cfg = getTableConfig(value as PgTable);
      if (KEPT.has(cfg.name)) continue;
      for (const col of cfg.columns.filter((c) => c.getSQLType() === "text" && c.name !== "id")) {
        const rows = await db().execute(sql`select 1 from ${sql.identifier(cfg.name)} where ${sql.identifier(col.name)} = ${m.id} limit 1`);
        if ((rows as unknown as unknown[]).length || (rows as unknown as { rows?: unknown[] }).rows?.length) left.push(`${cfg.name}.${col.name}`);
      }
    }
    // Attendance and ratings stay for event totals, pointing at the scrubbed account with your name and details removed (the notice says so).
    expect(left.sort()).toEqual(["social_feedback.account_id", "social_registrations.account_id"]);
    const [fb] = await db().select().from(feedback).where(eq(feedback.accountId, m.id));
    expect(fb?.comment ?? "").toBe("");
    expect(acct.username).not.toContain(m.username ?? "@@none@@");
  }, 30_000); // touches every table that holds a person: about 6 s locally, over vitest's 5 s default
});
