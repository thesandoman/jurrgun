/**
 * The evening summary (owner, 2026-10-17): non-urgent notifications still
 * land in the bell at once, but the phone hears about them once a day, at
 * 18:00 Bangkok, in one push. Urgent ones (and a Pinky unlock) never wait.
 * Quiet hours and the notifications consent still apply. On the bell page the
 * day's non-urgent items sit under one "สรุปวันนี้ / Today's summary" heading.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ENV, HAS_DB, createMember, db, req, type Member } from "./helpers";
import { consents, notifications } from "../src/schema";
import { newId } from "../src/lib/crypto";
import { DIGEST_KINDS, KIND_DIGEST, digestText, isDigest } from "../src/domain/digest";
import { runDigest } from "../src/services/clock";

const HOUR = 3_600_000;
const day = new Date();
/** 18:00 in Bangkok today. */
const SIX_PM = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 11, 0, 0));

describe("the summary's words", () => {
  it("counts by kind in a fixed order, Thai first and natural English", () => {
    const kinds = ["graduated", "thanks", "thanks", "thanks"];
    expect(digestText(kinds, "th")).toBe("วันนี้: ขอบคุณ 3 · เพื่อนใหม่ 1");
    expect(digestText(kinds, "en")).toBe("Today: 3 thank-yous · 1 new friend");
    expect(digestText(["thanks", "pitch", "pitch", "contact_shared"], "en")).toBe("Today: 1 thank-you · 2 plan ideas · 1 other update");
    expect(digestText(["connection"], "th")).toBe("วันนี้: คนรู้จักใหม่ 1");
  });

  it("classifies: urgent kinds and a Pinky unlock are never summarised", () => {
    for (const k of Object.keys(DIGEST_KINDS)) expect(isDigest(k, k === "connection" ? "/connections" : "/x")).toBe(true);
    expect(isDigest("connection", "/people/abc")).toBe(false); // Pinky unlock
    for (const k of ["event_notice", "event_changed", "event_cancelled", "waitlist_offer", "waitlist", "rsvp", "event_tomorrow", "event_today", "people_window", "eta_late", "report", "strike", "moderation", "buddy_match", "buddy_wrap", "chat"]) {
      expect(isDigest(k, "/x")).toBe(false);
    }
  });
});

const note = (m: Member, kind: string, over: Partial<typeof notifications.$inferInsert> = {}) => ({
  id: newId(),
  accountId: m.id,
  kind,
  titleTh: `ไทย ${kind}`,
  titleEn: `Note ${kind}`,
  link: kind === "connection" ? "/connections" : "/thanks",
  createdAt: new Date(SIX_PM.getTime() - 2 * HOUR),
  ...over,
});
const markers = (m: Member) => db().select().from(notifications).where(and(eq(notifications.accountId, m.id), eq(notifications.kind, KIND_DIGEST)));

describe.skipIf(!HAS_DB)("the evening summary", () => {
  it("one summary at 18:00 for the day's unread non-urgent rows, once, and never for urgent ones", async () => {
    const m = await createMember();
    const urgentOnly = await createMember();
    await db().insert(notifications).values([
      note(m, "thanks"),
      note(m, "thanks"),
      note(m, "thanks"),
      note(m, "graduated"),
      // Not counted: urgent, read already, older than a day, or not here yet.
      note(m, "rsvp"),
      note(m, "thanks", { readAt: new Date(SIX_PM.getTime() - HOUR) }),
      note(m, "thanks", { createdAt: new Date(SIX_PM.getTime() - 30 * HOUR) }),
      note(m, "still_in_touch", { createdAt: new Date(SIX_PM.getTime() + 5 * HOUR) }),
      note(urgentOnly, "waitlist_offer"),
      note(urgentOnly, "connection", { link: `/people/${newId()}` }),
    ]);
    // Not before 18:00.
    await runDigest(ENV, new Date(SIX_PM.getTime() - HOUR));
    expect(await markers(m)).toHaveLength(0);
    const run = await runDigest(ENV, SIX_PM);
    expect(run.sent).toBeGreaterThanOrEqual(1);
    const [mark] = await markers(m);
    expect(mark.titleTh).toBe("วันนี้: ขอบคุณ 3 · เพื่อนใหม่ 1");
    expect(mark.titleEn).toBe("Today: 3 thank-yous · 1 new friend");
    expect(mark.readAt).not.toBeNull(); // never adds to the bell's count
    expect(await markers(urgentOnly)).toHaveLength(0);
    // The next hour (or a task that arrived twice) sends nothing more that day.
    await runDigest(ENV, new Date(SIX_PM.getTime() + HOUR));
    await Promise.all([runDigest(ENV, SIX_PM), runDigest(ENV, SIX_PM)]);
    expect(await markers(m)).toHaveLength(1);
  });

  it("respects quiet hours and a no to notifications", async () => {
    const no = await createMember();
    await db().insert(consents).values({ id: newId(), accountId: no.id, category: "notifications", granted: false, version: "test", createdAt: new Date(Date.now() + 1000) });
    const late = await createMember();
    await db().insert(notifications).values([note(no, "thanks"), note(late, "thanks", { createdAt: new Date(SIX_PM.getTime() + 2 * HOUR) })]);
    await runDigest(ENV, SIX_PM);
    expect(await markers(no)).toHaveLength(0);
    // 21:00 is quiet: the row from 20:00 waits for tomorrow's summary.
    await runDigest(ENV, new Date(SIX_PM.getTime() + 3 * HOUR));
    expect(await markers(late)).toHaveLength(0);
  });

  it("the bell page puts the day's non-urgent items under one Today's summary heading", async () => {
    const m = await createMember();
    const now = Date.now();
    await db().insert(notifications).values([
      note(m, "thanks", { titleEn: "Ann sent you a thank-you", createdAt: new Date(now - 60_000) }),
      note(m, "rsvp", { titleEn: "You're in: Board games", link: "/me/events", createdAt: new Date(now - 30_000) }),
      { id: newId(), accountId: m.id, kind: KIND_DIGEST, titleTh: "วันนี้: ขอบคุณ 1", titleEn: "Today: 1 thank-you", link: "/notifications", createdAt: new Date(now - 10_000), readAt: new Date(now - 10_000) },
    ]);
    const html = await (await req("/notifications", { cookie: `${m.cookie}; lang=en` })).text();
    const summary = html.indexOf("Today&#39;s summary");
    expect(summary).toBeGreaterThan(-1);
    expect(html.indexOf("Ann sent you a thank-you")).toBeGreaterThan(summary);
    expect(html.indexOf("You&#39;re in: Board games")).toBeLessThan(summary);
    // The marker row itself is never listed.
    expect(html).not.toContain("Today: 1 thank-you");
    const th = await (await req("/notifications", { cookie: `${m.cookie}; lang=th` })).text();
    expect(th).toContain("สรุปวันนี้");
    const panel = await (await req("/notifications/panel", { cookie: `${m.cookie}; lang=en` })).text();
    expect(panel).not.toContain("Today: 1 thank-you");
  });
});
