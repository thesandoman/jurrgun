/**
 * The bell is a dropdown: the badge shows unread notifications, the list is
 * fetched (and marked read) only when the menu opens, and the full page
 * stays as the no-JS fallback.
 */
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { HAS_DB, createMember, db, req } from "./helpers";
import { notifications } from "../src/schema";
import { newId } from "../src/lib/crypto";

describe.skipIf(!HAS_DB)("notifications dropdown", () => {
  it("badges unread items, lists them on open, then clears the badge", async () => {
    const m = await createMember();
    const cookie = `${m.cookie}; lang=en`;
    await db().insert(notifications).values([
      { id: newId(), accountId: m.id, kind: "rsvp", titleTh: "ยืนยันแล้ว", titleEn: "You're in: Board games", link: "/me/events" },
      { id: newId(), accountId: m.id, kind: "group", titleTh: "กลุ่ม 2", titleEn: "You're in group 2", link: "https://evil.example" },
    ]);

    let html = await (await req("/events?view=list", { cookie })).text();
    expect(html).toContain('id="notif"');
    expect(html).toContain('<span class="notif-dot" aria-hidden="true">2</span>');
    expect(html).toContain('href="/notifications"');

    const panel = await req("/notifications/panel", { cookie });
    expect(panel.status).toBe(200);
    const body = await panel.text();
    expect(body).not.toContain("<html");
    expect(body).toContain("You&#39;re in: Board games");
    expect(body).toContain('href="/me/events"');
    expect(body).not.toContain("evil.example"); // off-site links are dropped
    expect(await db().select().from(notifications).where(and(eq(notifications.accountId, m.id), isNull(notifications.readAt)))).toHaveLength(0);

    html = await (await req("/events?view=list", { cookie })).text();
    expect(html).not.toContain('class="notif-dot"');
  });

  it("needs a signed-in member", async () => {
    const r = await req("/notifications/panel");
    expect(r.status).toBe(302);
  });
});
