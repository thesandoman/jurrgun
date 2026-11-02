import { describe, expect, it } from "vitest";
import { alertDetails, findAlert, normalizeBody, parseAlertDetails, type AlertMessage } from "../src/domain/chat-alerts";

const at = new Date("2026-11-01T10:00:00Z");
let n = 0;
const msg = (recipient: string, body: string, over: Partial<AlertMessage> = {}): AlertMessage => ({ id: `m${n++}`, sender: "s", recipient, body, moneyFlag: false, createdAt: at, eventId: null, ...over });
const copy = "Hi there, I have a great offer for you today";

describe("chat alerts", () => {
  it("alerts on money to 3 people, not 2", () => {
    const two = [msg("a", "lend me 500", { moneyFlag: true }), msg("b", "lend me 500", { moneyFlag: true }), msg("a", "please", { moneyFlag: true })];
    expect(findAlert(two)).toBeNull();
    const three = findAlert([...two, msg("c", "need money", { moneyFlag: true })]);
    expect(three).toMatchObject({ kind: "money", people: 3, messages: 4 });
  });

  it("alerts on money even from one event, and says so", () => {
    const f = findAlert(["a", "b", "c"].map((r) => msg(r, "transfer me 200 for dinner", { moneyFlag: true, eventId: "e1" })));
    expect(f).toMatchObject({ kind: "money", people: 3, oneEvent: 3 });
  });

  it("alerts on one message copied to 3 people, whatever the spacing", () => {
    const f = findAlert([msg("a", copy), msg("b", copy.toUpperCase()), msg("c", `${copy}!!`)]);
    expect(f).toMatchObject({ kind: "same", people: 3 });
  });

  it("ignores short messages, starters and a thank-you to one event", () => {
    expect(findAlert(["a", "b", "c"].map((r) => msg(r, "see you there!")))).toBeNull();
    expect(findAlert(["a", "b", "c"].map((r) => msg(r, copy)), new Set([normalizeBody(copy)]))).toBeNull();
    expect(findAlert(["a", "b", "c"].map((r) => msg(r, copy, { eventId: "e1" })))).toBeNull();
    const mixed = findAlert([msg("a", copy, { eventId: "e1" }), msg("b", copy, { eventId: "e1" }), msg("c", copy, { eventId: "e2" })]);
    expect(mixed).toMatchObject({ kind: "same", oneEvent: 2 });
  });

  it("counts one person once, however many messages", () => {
    expect(findAlert([msg("a", copy), msg("a", copy), msg("a", copy), msg("b", copy)])).toBeNull();
  });

  it("keeps counts in the row, never message text", () => {
    const since = new Date("2026-10-25T10:00:00Z");
    const text = alertDetails({ kind: "same", people: 3, messages: 4, oneEvent: 2 }, since);
    expect(text).not.toContain("offer");
    expect(parseAlertDetails(text)).toEqual({ kind: "same", people: 3, messages: 4, oneEvent: 2, since });
    expect(parseAlertDetails("Chat message: hello")).toBeNull();
  });
});
