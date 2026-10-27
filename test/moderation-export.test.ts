import { describe, expect, it } from "vitest";
import { FLAG_WINDOW_DAYS } from "../src/domain/rules";
import { LOOK_AGAIN_PREFIX } from "../src/services/outcomes";
import { moderationHistory, type ActionRow, type OwnReportRow } from "../src/services/moderation-export";

const ME = "me";
const DAY = 86_400_000;
const now = new Date("2026-10-27T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const act = (action: string, note: string, d: number, extra: Partial<ActionRow> = {}): ActionRow => ({ action, note, until: null, reportId: null, createdAt: ago(d), ...extra });

describe("moderation history in the data export", () => {
  const actions: ActionRow[] = [
    act("note", "[harassment] internal: spoke to Pim about it", 50),
    act("warning", "[harassment] reported by Pim, she sent screenshots", 40),
    act("warning", "", 30, { until: ago(-10) }),
    act("suspend", "[harassment] second report from Pim", 20, { until: ago(-5) }),
    act("ban", "[harassment] third time", 10),
    act("lift", "Looked again, lifting", 5, { reportId: "r-look" }),
    act("warning", "[harassment] old one", FLAG_WINDOW_DAYS + 5),
  ];
  const own: OwnReportRow[] = [
    { id: "r-look", reporter: ME, targetAccount: ME, details: `${LOOK_AGAIN_PREFIX}: I was not there that night`, status: "actioned", resolvedAt: ago(5), createdAt: ago(8) },
    { id: "r-other", reporter: ME, targetAccount: "someone", details: "they were rude", status: "open", resolvedAt: null, createdAt: ago(3) },
  ];
  const h = moderationHistory(ME, actions, own, now);

  it("never exports moderator notes, names in them, or note actions", () => {
    const json = JSON.stringify(h);
    expect(json).not.toContain("Pim");
    expect(json).not.toContain("screenshots");
    expect(json).not.toContain("internal");
    expect(json).not.toContain("Looked again, lifting");
    expect(json).not.toContain("they were rude");
    expect(h.actions.map((a) => a.action)).toEqual(["warning", "warning", "warning", "suspend", "ban", "lift"]);
  });

  it("names the rule in member wording, and the 3-flag suspension as such", () => {
    const named = h.actions.find((a) => a.action === "suspend")!;
    expect(named.rule?.key).toBe("harassment");
    expect(named.rule?.en).toBeTruthy();
    const auto = h.actions.find((a) => a.because3Flags)!;
    expect(auto.action).toBe("warning");
    expect(auto.rule).toEqual({ key: null, th: expect.any(String), en: "3 warnings" });
    expect(auto.suspendedUntil).toEqual(ago(-10));
    expect(h.actions.find((a) => a.action === "lift")!.rule).toBeNull();
  });

  it("counts flags still inside the window, with when each stops counting", () => {
    expect(h.flagsOnRecordNow).toBe(2);
    expect(h.flags[0]).toEqual({ warnedAt: ago(40), countsUntil: new Date(ago(40).getTime() + FLAG_WINDOW_DAYS * DAY) });
  });

  it("gives look-again requests with the member's own words and the outcome", () => {
    expect(h.lookAgainRequests).toEqual([{ askedAt: ago(8), yourWords: "I was not there that night", outcome: "lifted", decidedAt: ago(5) }]);
    const standing = moderationHistory(ME, [], [{ ...own[0], status: "dismissed" }], now);
    expect(standing.lookAgainRequests[0]).toMatchObject({ outcome: "ban stands", decidedAt: ago(5) });
    const open = moderationHistory(ME, [], [{ ...own[0], status: "open", resolvedAt: null }], now);
    expect(open.lookAgainRequests[0]).toMatchObject({ outcome: "open", decidedAt: null });
  });
});
