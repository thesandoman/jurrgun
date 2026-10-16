/** The curated icebreaker bank: size, tone rules, and the per-event rotation. */
import { describe, expect, it } from "vitest";
import { ICEBREAKERS, icebreakersFor, icebreakerWindow } from "../src/content/icebreakers";

const DAY = 86_400_000;

// Topics the bank never touches (owner): dating, politics, religion, money, appearance.
const OFF_EN = /\b(date|dating|romance|romantic|crush|single|partner|boyfriend|girlfriend|politic\w*|election|government|vote|religio\w*|temple|church|mosque|monk|buddh\w*|god|pray\w*|money|salary|price|cost|baht|rich|expensive|cheap|looks?|weight|beautiful|handsome|cute|pretty|ugly|body)\b/i;
const OFF_TH = /(เดต|แฟน|โสด|จีบ|การเมือง|เลือกตั้ง|รัฐบาล|ศาสนา|ทำบุญ|พระสงฆ์|ไหว้พระ|เงิน|ราคา|บาท|แพง|ถูกดี|รวย|หน้าตา|สวย|หล่อ|น่ารัก|น้ำหนัก|อ้วน|ผอม|รูปร่าง)/;

describe("icebreaker bank", () => {
  it("is small and hand-picked: about 30, each Thai and English, ids unique", () => {
    expect(ICEBREAKERS.length).toBeGreaterThanOrEqual(25);
    expect(ICEBREAKERS.length).toBeLessThanOrEqual(35);
    expect(new Set(ICEBREAKERS.map((x) => x.id)).size).toBe(ICEBREAKERS.length);
    for (const x of ICEBREAKERS) {
      expect(x.th.trim().length).toBeGreaterThan(5);
      expect(x.en.trim().length).toBeGreaterThan(5);
      expect(x.th).toMatch(/[฀-๿]/);
    }
    for (const kind of ["city", "food", "you"] as const) expect(ICEBREAKERS.filter((x) => x.kind === kind).length).toBeGreaterThanOrEqual(5);
  });

  it("stays off dating, politics, religion, money and appearance, with no dashes or polite particles", () => {
    for (const x of ICEBREAKERS) {
      expect(x.en, x.id).not.toMatch(OFF_EN);
      expect(x.th, x.id).not.toMatch(OFF_TH);
      expect(`${x.th} ${x.en}`, x.id).not.toMatch(/[–—]/);
      expect(x.th, x.id).not.toMatch(/(ครับ|ค่ะ|คะ|จ้ะ|จ้า)$/);
    }
  });

  it("gives each event the same three (city, food, you), and rotates them between events", () => {
    const a = icebreakersFor("event-a");
    expect(a).toHaveLength(3);
    expect(a.map((x) => x.kind)).toEqual(["city", "food", "you"]);
    expect(icebreakersFor("event-a")).toEqual(a);
    const sets = new Set(Array.from({ length: 30 }, (_, i) => icebreakersFor(`ev-${i}`).map((x) => x.id).join("|")));
    expect(sets.size).toBeGreaterThan(20);
    const five = icebreakersFor("event-b", 5);
    expect(new Set(five.map((x) => x.id)).size).toBe(5);
  });

  it("shows from three days before the start until the event ends", () => {
    const start = new Date("2026-11-07T11:00:00Z");
    const end = new Date(start.getTime() + 3 * 3_600_000);
    expect(icebreakerWindow(start, end, new Date(start.getTime() - 4 * DAY))).toBe(false);
    expect(icebreakerWindow(start, end, new Date(start.getTime() - 3 * DAY))).toBe(true);
    expect(icebreakerWindow(start, end, new Date(start.getTime() + 60_000))).toBe(true);
    expect(icebreakerWindow(start, end, end)).toBe(false);
  });
});
