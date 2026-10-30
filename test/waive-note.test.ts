/** D1 (owner, 2026-10-30): a waive note goes into the member's export, so it never names anyone else. */
import { describe, expect, it } from "vitest";
import { isWaiveReason, noteNamesSomeone, WAIVE_REASONS } from "../src/domain/waive-note";

const people = ["Nim", "nim_bkk", "พลอย", "Ken"];

describe("waive notes never name anyone else", () => {
  it("refuses another attendee's nickname or username, in either language", () => {
    expect(noteNamesSomeone("Came with Nim, who vouched for her", people)).toBe(true);
    expect(noteNamesSomeone("came with NIM", people)).toBe(true);
    expect(noteNamesSomeone("nim_bkk says she was there", people)).toBe(true);
    expect(noteNamesSomeone("มากับพลอยแต่ไม่ได้เช็กอิน", people)).toBe(true);
    expect(noteNamesSomeone("Ken's car broke down", people)).toBe(true);
  });

  it("refuses any @handle or phone number, even of someone not at the event", () => {
    expect(noteNamesSomeone("ask @someone_else", people)).toBe(true);
    expect(noteNamesSomeone("call 081-234-5678", people)).toBe(true);
    expect(noteNamesSomeone("call +66 81 234 5678", people)).toBe(true);
  });

  it("lets ordinary notes through, including words that merely contain a name", () => {
    expect(noteNamesSomeone("Was at the hospital, sent a message before the start", people)).toBe(false);
    expect(noteNamesSomeone("Token booth was closed; nimble excuse but fair", people)).toBe(false);
    expect(noteNamesSomeone("ไม่สบาย แจ้งก่อนเริ่ม 1 ชั่วโมง", people)).toBe(false);
    expect(noteNamesSomeone("Arrived 19:40, table 3 was full", people)).toBe(false);
  });

  it("ignores one-letter names", () => {
    expect(noteNamesSomeone("A quick note", ["A"])).toBe(false);
  });

  it("has a fixed reason list with Thai and English, and 'other' last", () => {
    expect(WAIVE_REASONS.length).toBeGreaterThanOrEqual(4);
    for (const r of WAIVE_REASONS) expect(r.th && r.en).toBeTruthy();
    expect(WAIVE_REASONS[WAIVE_REASONS.length - 1].value).toBe("other");
    expect(isWaiveReason("unwell")).toBe(true);
    expect(isWaiveReason("because")).toBe(false);
  });
});
