/** Chat limits and healthy-habit rules (src/domain/chat.ts, src/domain/rules.ts): pure, no database. */
import { describe, expect, it } from "vitest";
import { BEFORE_MEET_BUDGET, checkMessage, MAX_CHARS, notifyAt, parseThread, PER_DAY_TOTAL, PER_THREAD_PER_DAY, shouldNudge } from "../src/domain/chat";
import { isPaused, lateOrLong } from "../src/domain/rules";

const ok = { met: true, open: true, sentToday: 0, sentTodayAll: 0, sentInThread: 0 };

describe("chat limits", () => {
  it("parses only known thread keys", () => {
    expect(parseThread("buddy:abc123")).toEqual({ kind: "buddy", ref: "abc123" });
    expect(parseThread("circle:ev-1")).toEqual({ kind: "circle", ref: "ev-1" });
    expect(parseThread("dm:x")).toBeNull();
    expect(parseThread("conn:../x")).toBeNull();
  });

  it("caps length and daily volume, and refuses closed threads", () => {
    expect(checkMessage("  hi   there ", ok)).toEqual({ ok: true, body: "hi there", moneyFlag: false });
    expect(checkMessage("   ", ok)).toEqual({ ok: false, reason: "empty" });
    expect(checkMessage("x".repeat(MAX_CHARS + 1), ok)).toEqual({ ok: false, reason: "too_long" });
    expect(checkMessage("hi", { ...ok, sentToday: PER_THREAD_PER_DAY })).toEqual({ ok: false, reason: "thread_cap" });
    expect(checkMessage("hi", { ...ok, sentTodayAll: PER_DAY_TOTAL })).toEqual({ ok: false, reason: "day_cap" });
    expect(checkMessage("hi", { ...ok, open: false })).toEqual({ ok: false, reason: "closed" });
  });

  it("before the first meet: no links, numbers or handles, and a small budget", () => {
    const pre = { ...ok, met: false };
    for (const m of ["see www.example.com", "https://x.co/a", "call 081 234 5678", "my line id: sunny_99", "add me @sunny.bkk", "ig: sunny99"]) {
      expect(checkMessage(m, pre)).toEqual({ ok: false, reason: "contact_before_meet" });
    }
    expect(checkMessage("Saturday 10:00 at Lumphini?", pre).ok).toBe(true);
    expect(checkMessage("hi", { ...pre, sentInThread: BEFORE_MEET_BUDGET })).toEqual({ ok: false, reason: "budget" });
    // After meeting, sharing a link is fine.
    expect(checkMessage("menu: www.example.com", ok).ok).toBe(true);
  });

  it("flags money requests for the receiver, in Thai and English", () => {
    for (const m of ["โอนเงินให้หน่อย", "can you lend me 500", "ขอยืมเงินหน่อย", "send me money", "PromptPay me"]) {
      const r = checkMessage(m, ok);
      expect(r.ok && r.moneyFlag, m).toBe(true);
    }
    const plain = checkMessage("see you at 6", ok);
    expect(plain.ok && plain.moneyFlag).toBe(false);
  });

  it("nudges to meet after 30 messages without meeting", () => {
    expect(shouldNudge(false, 29)).toBe(false);
    expect(shouldNudge(false, 30)).toBe(true);
    expect(shouldNudge(true, 300)).toBe(false);
  });

  it("holds notifications during quiet hours (23:00 to 07:00 Bangkok)", () => {
    const at = (iso: string) => new Date(iso);
    // 14:00 Bangkok = 07:00Z: now.
    expect(notifyAt(at("2026-10-15T07:00:00Z")).toISOString()).toBe("2026-10-15T07:00:00.000Z");
    // 23:30 Bangkok = 16:30Z: next day 07:00 Bangkok = 00:00Z.
    expect(notifyAt(at("2026-10-15T16:30:00Z")).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    // 02:00 Bangkok = 19:00Z the day before: same morning 07:00 Bangkok.
    expect(notifyAt(at("2026-10-15T19:00:00Z")).toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
});

describe("healthy limits", () => {
  it("late-night or very long events need review", () => {
    // 19:00 to 21:00 Bangkok: fine.
    expect(lateOrLong(new Date("2026-10-15T12:00:00Z"), new Date("2026-10-15T14:00:00Z"))).toBe(false);
    // 22:30 Bangkok start.
    expect(lateOrLong(new Date("2026-10-15T15:30:00Z"), new Date("2026-10-15T17:00:00Z"))).toBe(true);
    // 6 hours long.
    expect(lateOrLong(new Date("2026-10-15T02:00:00Z"), new Date("2026-10-15T08:00:00Z"))).toBe(true);
  });

  it("pause lasts until its date", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    expect(isPaused({ pausedUntil: new Date("2026-10-20T00:00:00Z") }, now)).toBe(true);
    expect(isPaused({ pausedUntil: new Date("2026-10-01T00:00:00Z") }, now)).toBe(false);
    expect(isPaused({ pausedUntil: null }, now)).toBe(false);
  });
});
