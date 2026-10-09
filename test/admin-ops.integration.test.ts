/**
 * Staff operations: dashboard, moderation, users, City Pulse manager,
 * City Insight, partners & roles, audit log — against local Postgres.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import {
  accounts,
  auditLog,
  moderationActions,
  notifications,
  pulseQuestions,
  pulseResponses,
  reports,
  sessions,
} from "../src/schema";

async function report(reporter: string, target: string | null, extra: Partial<typeof reports.$inferInsert> = {}) {
  const id = newId();
  await db().insert(reports).values({ id, reporter, targetAccount: target, reason: "harassment", details: "test", ...extra });
  return id;
}

async function auditRows(actor: string, action: string) {
  return db().select().from(auditLog).where(and(eq(auditLog.actor, actor), eq(auditLog.action, action))).limit(50);
}

describe.skipIf(!HAS_DB)("admin role gating", () => {
  it("lets each role reach only its own modules", async () => {
    const host = await createMember({ role: "host" });
    for (const p of ["/admin/moderation", "/admin/users", "/admin/pulse", "/admin/insights", "/admin/partners", "/admin/audit"]) {
      expect((await req(p, { cookie: host.cookie })).status, p).toBe(403);
    }
    expect((await req("/admin", { cookie: host.cookie })).status).toBe(200);

    const viewer = await createMember({ role: "insight_viewer" });
    expect((await req("/admin/insights", { cookie: viewer.cookie })).status).toBe(200);
    expect((await req("/admin/moderation", { cookie: viewer.cookie })).status).toBe(403);
    expect((await req("/admin", { cookie: viewer.cookie })).status).toBe(200);

    const mod = await createMember({ role: "moderator" });
    expect((await req("/admin/pulse", { cookie: mod.cookie })).status).toBe(403);
    expect((await req("/admin/moderation", { cookie: mod.cookie })).status).toBe(200);
    expect((await req("/admin", { cookie: mod.cookie })).status).toBe(200);

    const member = await createMember();
    expect((await req("/admin", { cookie: member.cookie })).status).toBe(403);
    expect((await req("/admin/moderation")).status).toBe(302);

    const admin = await createMember({ role: "bma_admin" });
    expect((await req("/admin", { cookie: admin.cookie })).status).toBe(200);
  });
});

describe.skipIf(!HAS_DB)("moderation", () => {
  it("suspends a member: status, sessions, notification, audit", async () => {
    const mod = await createMember({ role: "moderator" });
    const reporter = await createMember();
    const target = await createMember({ relationship: "married" });
    const id = await report(reporter.id, target.id, { severity: "critical" });

    const queue = await req("/admin/moderation", { cookie: mod.cookie });
    expect(await queue.text()).toContain(`/admin/moderation/${id}`);

    const detail = await req(`/admin/moderation/${id}`, { cookie: `${mod.cookie}; lang=en` });
    expect(detail.status).toBe(200);
    const html = await detail.text();
    expect(html).not.toMatch(/married|แต่งงาน/);
    expect(html).not.toContain(target.researchId);
    expect((await auditRows(mod.id, "moderation.view_report")).some((r) => r.targetId === id)).toBe(true);

    // Note is required for suspension.
    expect((await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "suspend", days: "7" } })).status).toBe(400);
    expect((await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "suspend", days: "120", note: "x" } })).status).toBe(400);

    const r = await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "suspend", days: "7", note: "Repeated harassment" } });
    expect(r.status).toBe(302);

    const [acct] = await db().select().from(accounts).where(eq(accounts.id, target.id));
    expect(acct.status).toBe("suspended");
    const days = (acct.suspendedUntil!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(await db().select().from(sessions).where(eq(sessions.accountId, target.id))).toHaveLength(0);

    const next = await req("/events", { cookie: target.cookie });
    expect(next.status).toBe(302);
    expect(next.headers.get("location")).toMatch(/^\/login/);

    const notes = await db().select().from(notifications).where(eq(notifications.accountId, target.id));
    expect(notes.some((n) => n.kind === "moderation")).toBe(true);
    expect(notes.map((n) => n.titleEn + n.titleTh).join(" ")).not.toContain(reporter.username);

    const [rep] = await db().select().from(reports).where(eq(reports.id, id));
    expect(rep.status).toBe("actioned");
    expect(rep.resolvedBy).toBe(mod.id);
    const acts = await db().select().from(moderationActions).where(eq(moderationActions.accountId, target.id));
    expect(acts.map((a) => a.action)).toContain("suspend");
    expect(await auditRows(mod.id, "moderation.suspend")).toHaveLength(1);
  });

  it("audits the participation-history view", async () => {
    const mod = await createMember({ role: "moderator" });
    const target = await createMember();
    const id = await report((await createMember()).id, target.id);
    const r = await req(`/admin/moderation/${id}?history=1`, { cookie: mod.cookie });
    expect(r.status).toBe(200);
    const rows = await auditRows(mod.id, "moderation.view_history");
    expect(rows).toHaveLength(1);
    expect(rows[0].targetId).toBe(target.id);
  });

  it("refuses moderator actions against a BMA admin", async () => {
    const mod = await createMember({ role: "moderator" });
    const admin = await createMember({ role: "bma_admin" });
    const id = await report((await createMember()).id, admin.id);
    const r = await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "warning", note: "nope" } });
    expect(r.status).toBe(403);
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, admin.id));
    expect(acct.status).toBe("active");
  });

  it("dismisses a report and 404s an unknown one", async () => {
    const mod = await createMember({ role: "moderator" });
    const id = await report((await createMember()).id, (await createMember()).id);
    const r = await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "dismiss" } });
    expect(r.status).toBe(302);
    const [rep] = await db().select().from(reports).where(eq(reports.id, id));
    expect(rep.status).toBe("dismissed");
    expect(rep.resolvedAt).not.toBeNull();
    expect((await req(`/admin/moderation/nope-${newId()}`, { cookie: mod.cookie })).status).toBe(404);
  });

  it("warns, then lifts", async () => {
    const mod = await createMember({ role: "moderator" });
    const target = await createMember();
    const id = await report((await createMember()).id, target.id);
    expect((await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "warning" } })).status).toBe(400);
    expect((await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "ban", note: "x" } })).status).toBe(302);
    let [acct] = await db().select().from(accounts).where(eq(accounts.id, target.id));
    expect(acct.status).toBe("banned");
    expect((await req(`/admin/moderation/${id}/action`, { cookie: mod.cookie, form: { action: "lift" } })).status).toBe(302);
    [acct] = await db().select().from(accounts).where(eq(accounts.id, target.id));
    expect(acct.status).toBe("active");
  });
});

describe.skipIf(!HAS_DB)("user lookup", () => {
  it("audits searches and never shows private profile fields", async () => {
    const mod = await createMember({ role: "moderator" });
    const married = await createMember({ relationship: "married", genderIdentity: "woman", ageMin: 33, ageMax: 47 });

    const s = await req(`/admin/users?q=${married.username}`, { cookie: mod.cookie });
    expect(s.status).toBe(200);
    expect(await s.text()).toContain(`/admin/users/${married.id}`);
    const searches = await auditRows(mod.id, "users.search");
    expect(searches).toHaveLength(1);

    for (const lang of ["th", "en"]) {
      const d = await req(`/admin/users/${married.id}`, { cookie: `${mod.cookie}; lang=${lang}` });
      expect(d.status).toBe(200);
      const html = await d.text();
      expect(html).toContain(married.username);
      expect(html).not.toMatch(/married|แต่งงาน/i);
    }
    expect((await auditRows(mod.id, "users.view")).length).toBe(2);
    expect((await req(`/admin/users/missing-${newId()}`, { cookie: mod.cookie })).status).toBe(404);
  });

  it("lets only BMA admins change verification", async () => {
    const mod = await createMember({ role: "moderator" });
    const admin = await createMember({ role: "bma_admin" });
    const m = await createMember();
    expect((await req(`/admin/users/${m.id}/verification`, { cookie: mod.cookie, form: { value: "verified" } })).status).toBe(403);
    expect((await req(`/admin/users/${m.id}/verification`, { cookie: admin.cookie, form: { value: "bogus" } })).status).toBe(400);
    expect((await req(`/admin/users/${m.id}/verification`, { cookie: admin.cookie, form: { value: "verified" } })).status).toBe(302);
    expect((await req(`/admin/users/${m.id}/bkk`, { cookie: admin.cookie, form: { value: "verified" } })).status).toBe(302);
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, m.id));
    expect(acct.verification).toBe("verified");
    expect(acct.bkkRegistered).toBe("verified");
    expect(await auditRows(admin.id, "users.set_verification")).toHaveLength(1);
    expect(await auditRows(admin.id, "users.set_bkk_registered")).toHaveLength(1);
  });
});

describe.skipIf(!HAS_DB)("City Pulse manager", () => {
  const base = {
    promptTh: "อะไรทำให้คุณไม่ออกไปพบผู้คน",
    promptEn: "What stops you going out?",
    kind: "single",
    sortOrder: "0",
    status: "draft",
  };

  it("validates options, activates and suppresses small cells", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const bad = await req("/admin/pulse/new", { cookie: admin.cookie, form: { ...base, options: "Bad Value|ไทย|English\nb|ข|B" } });
    expect(bad.status).toBe(400);
    const one = await req("/admin/pulse/new", { cookie: admin.cookie, form: { ...base, options: "a|ก|A" } });
    expect(one.status).toBe(400);

    const ok = await req("/admin/pulse/new", {
      cookie: admin.cookie,
      form: { ...base, options: "cost|ค่าใช้จ่าย|Cost\ntime|ไม่มีเวลา|No time", districts: ["bang_rak"], ageBands: ["25-29"], activeFrom: "2026-10-01T09:00" },
    });
    expect(ok.status).toBe(302);
    const qid = decodeURIComponent(ok.headers.get("location")!.split("/")[3]);
    const [q] = await db().select().from(pulseQuestions).where(eq(pulseQuestions.id, qid));
    expect(q.options).toHaveLength(2);
    expect(q.activeFrom!.toISOString()).toBe("2026-10-01T02:00:00.000Z");
    expect(q.segment).toEqual({ districts: ["bang_rak"], ageBands: ["25-29"] });

    const edit = await req(`/admin/pulse/${qid}/edit`, { cookie: admin.cookie });
    expect(await edit.text()).toContain("No time");

    expect((await req(`/admin/pulse/${qid}/status`, { cookie: admin.cookie, form: { status: "active" } })).status).toBe(302);
    const [active] = await db().select().from(pulseQuestions).where(eq(pulseQuestions.id, qid));
    expect(active.status).toBe("active");

    const researchIds: string[] = [];
    const rows = [];
    for (let i = 0; i < 15; i++) {
      const rid = newId();
      researchIds.push(rid);
      rows.push({ id: newId(), questionId: qid, researchId: rid, answer: i < 12 ? "cost" : "time", district: "bang_rak", ageBand: "25-29" });
    }
    await db().insert(pulseResponses).values(rows);

    const res = await req(`/admin/pulse/${qid}/results`, { cookie: `${admin.cookie}; lang=en` });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<td>12</td>");
    expect(html).toContain("<td>&lt;10</td>");
    expect(html).not.toContain("<td>3</td>");
    for (const rid of researchIds) expect(html).not.toContain(rid);

    const csv = await req(`/admin/pulse/${qid}/export.csv`, { cookie: admin.cookie });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("overall,all,cost,Cost,12");
    expect(text).toContain("overall,all,time,No time,<10");
    expect(text).not.toMatch(/,3\r?\n/);
    for (const rid of researchIds) expect(text).not.toContain(rid);
  });

  it("never shows free-text answers", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const ok = await req("/admin/pulse/new", { cookie: admin.cookie, form: { ...base, kind: "text", options: "" } });
    expect(ok.status).toBe(302);
    const qid = decodeURIComponent(ok.headers.get("location")!.split("/")[3]);
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: newId(),
      questionId: qid,
      researchId: newId(),
      answer: `secret phrase ${i} zebra`,
      district: "dusit",
      ageBand: "30-34",
    }));
    await db().insert(pulseResponses).values(rows);
    const res = await req(`/admin/pulse/${qid}/results`, { cookie: admin.cookie });
    const html = await res.text();
    expect(html).not.toContain("zebra");
    expect(html).toContain(">11<");
    const csv = await (await req(`/admin/pulse/${qid}/export.csv`, { cookie: admin.cookie })).text();
    expect(csv).not.toContain("zebra");
  });

  it("counts multi-choice and scale answers", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const multi = await req("/admin/pulse/new", { cookie: admin.cookie, form: { ...base, kind: "multi", options: "cost|ค่าใช้จ่าย|Cost\ntime|ไม่มีเวลา|No time\nfar|ไกล|Too far" } });
    const scale = await req("/admin/pulse/new", { cookie: admin.cookie, form: { ...base, kind: "scale", options: "" } });
    const mid = decodeURIComponent(multi.headers.get("location")!.split("/")[3]);
    const sid = decodeURIComponent(scale.headers.get("location")!.split("/")[3]);
    const row = (questionId: string, answer: string | string[] | number) => ({ id: newId(), questionId, researchId: newId(), answer, district: "dusit", ageBand: "35-44" });
    await db().insert(pulseResponses).values([
      ...Array.from({ length: 11 }, () => row(mid, ["cost", "time"])),
      row(mid, ["far"]),
      ...Array.from({ length: 10 }, () => row(sid, 4)),
    ]);
    const m = await (await req(`/admin/pulse/${mid}/export.csv`, { cookie: admin.cookie })).text();
    expect(m).toContain("overall,all,_respondents,Respondents,12");
    expect(m).toContain("overall,all,cost,Cost,11");
    expect(m).toContain("overall,all,time,No time,11");
    expect(m).toContain("overall,all,far,Too far,<10");
    expect(m).toContain("district,dusit,cost,Cost,11");
    const sc = await (await req(`/admin/pulse/${sid}/export.csv`, { cookie: admin.cookie })).text();
    expect(sc).toContain("overall,all,_mean,Mean,4.00");
    expect(sc).toContain("overall,all,4,4,10");
    expect(sc).toContain("overall,all,5,5,<10");
  });

  it("is closed to moderators", async () => {
    const mod = await createMember({ role: "moderator" });
    expect((await req("/admin/pulse/new", { cookie: mod.cookie, form: { ...base, options: "a|ก|A\nb|ข|B" } })).status).toBe(403);
  });
});

describe.skipIf(!HAS_DB)("City Insight", () => {
  it("renders with suppression and window choice", async () => {
    const viewer = await createMember({ role: "insight_viewer" });
    for (const days of ["30", "90", "365", "7"]) {
      const r = await req(`/admin/insights?days=${days}`, { cookie: viewer.cookie });
      expect(r.status).toBe(200);
      const html = await r.text();
      expect(html).toContain("&lt;10");
      expect(html).toContain("≥ 40%");
    }
  });
});

describe.skipIf(!HAS_DB)("partners & roles", () => {
  it("creates orgs, sets roles, refuses self-demotion", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const m = await createMember();

    expect((await req("/admin/partners/orgs", { cookie: admin.cookie, form: { name: "" } })).status).toBe(400);
    const orgName = `Org ${newId()}`;
    expect((await req("/admin/partners/orgs", { cookie: admin.cookie, form: { name: orgName } })).status).toBe(302);
    expect(await (await req("/admin/partners", { cookie: admin.cookie })).text()).toContain(orgName);

    expect((await req("/admin/partners/roles", { cookie: admin.cookie, form: { username: m.username, role: "partner_admin" } })).status).toBe(400);
    expect((await req("/admin/partners/roles", { cookie: admin.cookie, form: { username: m.username, role: "host" } })).status).toBe(302);
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, m.id));
    expect(acct.role).toBe("host");
    expect(await auditRows(admin.id, "partners.set_role")).toHaveLength(1);

    const self = await req("/admin/partners/roles", { cookie: admin.cookie, form: { username: admin.username, role: "user" } });
    expect(self.status).toBe(400);
    const [me] = await db().select().from(accounts).where(eq(accounts.id, admin.id));
    expect(me.role).toBe("bma_admin");

    const audit = await req(`/admin/audit?action=partners.&actor=${admin.id}`, { cookie: admin.cookie });
    expect(audit.status).toBe(200);
    const html = await audit.text();
    expect(html).toContain("partners.set_role");
    expect(html).toContain("partners.create_org");
  });
});
