/** Circle chat extras: photos from the day and quick polls (pure rules). */
import { describe, expect, it } from "vitest";
import { PHOTOS_PER_DAY, PHOTO_MAX_BYTES, checkPhoto, checkPoll, tally } from "../src/domain/chat";

const ok = { kind: "circle" as const, met: true, open: true, sentToday: 0 };

describe("photos in circle chats", () => {
  it("only in circles, only once the hangout started, only real images up to 5 MB", () => {
    expect(checkPhoto({ type: "image/jpeg", size: 1000 }, ok)).toEqual({ ok: true });
    expect(checkPhoto({ type: "image/jpeg", size: 1000 }, { ...ok, kind: "buddy" })).toEqual({ ok: false, reason: "not_circle" });
    expect(checkPhoto({ type: "image/jpeg", size: 1000 }, { ...ok, met: false })).toEqual({ ok: false, reason: "not_yet" });
    expect(checkPhoto({ type: "image/gif", size: 1000 }, ok)).toEqual({ ok: false, reason: "type" });
    expect(checkPhoto({ type: "image/png", size: PHOTO_MAX_BYTES + 1 }, ok)).toEqual({ ok: false, reason: "size" });
    expect(checkPhoto(null, ok)).toEqual({ ok: false, reason: "type" });
    expect(checkPhoto({ type: "image/webp", size: 10 }, { ...ok, sentToday: PHOTOS_PER_DAY })).toEqual({ ok: false, reason: "photo_cap" });
    expect(checkPhoto({ type: "image/webp", size: 10 }, { ...ok, open: false })).toEqual({ ok: false, reason: "closed" });
  });
});

describe("polls", () => {
  it("needs a question and 2 to 4 distinct options, circles only", () => {
    expect(checkPoll(" Which  Sunday? ", ["18th", "25th", "", "18th"], { kind: "circle", open: true })).toEqual({ ok: true, question: "Which Sunday?", options: ["18th", "25th"] });
    expect(checkPoll("Q", ["only one"], { kind: "circle", open: true })).toEqual({ ok: false, reason: "options" });
    expect(checkPoll("Q", ["a", "b", "c", "d", "e"], { kind: "circle", open: true })).toEqual({ ok: false, reason: "options" });
    expect(checkPoll("", ["a", "b"], { kind: "circle", open: true })).toEqual({ ok: false, reason: "question" });
    expect(checkPoll("Q", ["a", "b"], { kind: "conn", open: true })).toEqual({ ok: false, reason: "not_circle" });
  });

  it("tallies one vote per row, ignoring bad options", () => {
    expect(tally(3, [{ option: 0 }, { option: 2 }, { option: 2 }, { option: 7 }])).toEqual([1, 0, 2]);
  });
});
