/** Chat alerts end to end: the hourly pass, its guards, and the moderator's recorded reveal. */
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMember, db, ENV, HAS_DB, req } from "./helpers";
import { newId } from "../src/lib/crypto";
import { ALERT_REPORTER } from "../src/domain/chat-alerts";
import { auditLog, chatMessages, connections, notifications, pinkies, reports } from "../src/schema";
import { runChatAlerts } from "../src/services/chat-alerts";

const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

async function connect(x: string, y: string, eventId = `ev_${newId()}`, level = "friend") {
  const [a, b] = pair(x, y);
  const id = newId();
  await db().insert(connections).values({ id, aAccount: a, bAccount: b, level, eventId });
  return id;
}
const say = (thread: string, sender: string, body: string, moneyFlag = false) => db().insert(chatMessages).values({ id: newId(), thread, sender, body, moneyFlag });
const alertsAbout = (id: string) => db().select().from(reports).where(and(eq(reports.reporter, ALERT_REPORTER), eq(reports.targetAccount, id)));

describe.skipIf(!HAS_DB)("chat alerts", () => {
  async function scammer() {
    const s = await createMember();
    for (let i = 0; i < 3; i++) {
      const other = await createMember();
      await say(`conn:${await connect(s.id, other.id)}`, s.id, "please lend me 500 baht", true);
    }
    return s;
  }

  it("opens one alert with counts only, and never twice while it's open", async () => {
    const s = await scammer();
    await runChatAlerts(ENV as never);
    await runChatAlerts(ENV as never);
    const rows = await alertsAbout(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toContain("kind=money people=3");
    expect(rows[0].details).not.toContain("lend me");
    expect(rows[0].severity).toBe("standard");
  });

  it("doesn't count Pinky or romance pairs, or group chats", async () => {
    const s = await createMember();
    const [o1, o2, o3] = [await createMember(), await createMember(), await createMember()];
    await say(`conn:${await connect(s.id, o1.id)}`, s.id, "please lend me 500 baht", true);
    await say(`conn:${await connect(s.id, o2.id, undefined, "romance")}`, s.id, "please lend me 500 baht", true);
    const third = await connect(s.id, o3.id);
    const [a, b] = pair(s.id, o3.id);
    await db().insert(pinkies).values({ id: newId(), aAccount: a, bAccount: b, source: "table", sourceKey: "e", connectionId: third });
    await say(`conn:${third}`, s.id, "please lend me 500 baht", true);
    await say(`table:${newId()}`, s.id, "please lend me 500 baht", true);
    await say(`circle:${newId()}`, s.id, "please lend me 500 baht", true);
    await runChatAlerts(ENV as never);
    expect(await alertsAbout(s.id)).toHaveLength(0);
  });

  it("shows the pattern first, and opening the messages is recorded", async () => {
    const s = await scammer();
    await runChatAlerts(ENV as never);
    const [alert] = await alertsAbout(s.id);
    const mod = await createMember({ role: "moderator" });
    const page = await (await req(`/admin/moderation/${alert.id}`, { cookie: mod.cookie })).text();
    expect(page).toContain("เปิดอ่านข้อความ");
    expect(page).not.toContain("lend me");
    const opened = await req(`/admin/moderation/${alert.id}/alert-messages`, { method: "POST", cookie: mod.cookie });
    expect(opened.status).toBe(200);
    expect(opened.headers.get("cache-control")).toContain("no-store");
    const html = await opened.text();
    expect(html).toContain("lend me");
    expect(html).toContain("ถึง A");
    const logged = await db().select().from(auditLog).where(and(eq(auditLog.actor, mod.id), eq(auditLog.action, "moderation.view_alert_messages")));
    expect(logged).toHaveLength(1);
  });

  it("hides an alert about a moderator from moderators", async () => {
    const other = await createMember({ role: "moderator" });
    for (let i = 0; i < 3; i++) {
      const o = await createMember();
      await say(`conn:${await connect(other.id, o.id)}`, other.id, "please lend me 500 baht", true);
    }
    await runChatAlerts(ENV as never);
    const [alert] = await alertsAbout(other.id);
    const mod = await createMember({ role: "moderator" });
    expect((await req(`/admin/moderation/${alert.id}`, { cookie: mod.cookie })).status).toBe(404);
    expect((await req(`/admin/moderation/${alert.id}/alert-messages`, { method: "POST", cookie: mod.cookie })).status).toBe(404);
  });

  it("closes quietly, and only newer messages can raise another", async () => {
    const s = await scammer();
    await runChatAlerts(ENV as never);
    const [alert] = await alertsAbout(s.id);
    const mod = await createMember({ role: "moderator" });
    const closed = await req(`/admin/moderation/${alert.id}/action`, { method: "POST", cookie: mod.cookie, form: { action: "dismiss", note: "Split bill" } });
    expect(closed.status).toBeLessThan(400);
    const [after] = await db().select().from(reports).where(eq(reports.id, alert.id));
    expect(after.status).toBe("dismissed");
    expect(await db().select().from(notifications).where(eq(notifications.accountId, ALERT_REPORTER))).toHaveLength(0);
    expect(await db().select().from(notifications).where(and(eq(notifications.accountId, s.id), eq(notifications.kind, "report_closed")))).toHaveLength(0);
    await runChatAlerts(ENV as never);
    expect(await alertsAbout(s.id)).toHaveLength(1);
  });

  it("asking the team to check files a possible scam, with kinder words back", async () => {
    const [sender, me] = [await createMember(), await createMember()];
    const conn = await connect(sender.id, me.id);
    const id = newId();
    await db().insert(chatMessages).values({ id, thread: `conn:${conn}`, sender: sender.id, body: "join my group" });
    const page = await (await req(`/chat/conn:${conn}`, { cookie: me.cookie })).text();
    expect(page).toContain("ให้ทีมงานช่วยดู");
    const res = await req(`/chat/conn:${conn}/report/${id}`, { method: "POST", cookie: me.cookie, form: { help: "1" } });
    expect(res.headers.get("location")).toContain("notice=asked");
    const [r] = await db().select().from(reports).where(eq(reports.targetMessage, id));
    expect(r.reason).toBe("spam_scam");
    expect(r.severity).toBe("standard");
  });
});
