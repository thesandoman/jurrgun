/**
 * Owner card 1 (2026-10-27): one line at the top of /admin while the hourly
 * clock is not Running. It repeats the clock card's own tag (one status
 * computation, clockStatus), links to #clock and never offers Start.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { tr } from "../src/lib/i18n";
import { ClockLine, clockStatus } from "../src/routes/admin/dashboard";
import type { ClockHealth } from "../src/services/clock";
import { ENV, HAS_DB, createMember } from "./helpers";

const en = tr("en");
const th = tr("th");
const HOUR = 3_600_000;
const soon = Date.now() + HOUR;

const states: [string, ClockHealth | null, string, string][] = [
  ["restarted", { state: "rearmed", next: soon, lastTick: Date.now() - 3 * HOUR }, "Restarted", "เพิ่งเริ่มใหม่"],
  ["started", { state: "rearmed", next: soon, lastTick: null }, "Started", "เพิ่งเริ่ม"],
  ["unavailable", { state: "unavailable", next: null, lastTick: null }, "Status unavailable", "อ่านสถานะไม่ได้"],
  ["stopped", { state: "off", next: null, lastTick: null }, "Stopped", "หยุดอยู่"],
  ["no health", null, "Stopped", "หยุดอยู่"],
];

describe("the clock line", () => {
  for (const [name, h, label, thLabel] of states) {
    it(`shows the card's tag when the clock is ${name}`, () => {
      expect(clockStatus(h, en)).toMatchObject({ running: false, label });
      const html = String(<ClockLine health={h} t={en} />);
      expect(html).toContain('href="#clock"');
      expect(html).toContain(`Hourly clock: <strong>${label}</strong>`);
      expect(html).toMatch(/class="notice (warn|info) clock-line"/);
      expect(html).toContain('role="status"');
      expect(html).not.toContain("<form");
      expect(html).not.toContain("/admin/clock");
      expect(html).not.toMatch(/Start the clock|<button/);
      expect(String(<ClockLine health={h} t={th} />)).toContain(`นาฬิการายชั่วโมง: <strong>${thLabel}</strong>`);
    });
  }

  it("is a warning only for a restart, calm info otherwise", () => {
    expect(String(<ClockLine health={states[0][1]} t={en} />)).toContain('class="notice warn clock-line"');
    expect(String(<ClockLine health={states[3][1]} t={en} />)).toContain('class="notice info clock-line"');
  });

  it("is absent while the clock is Running", () => {
    const h: ClockHealth = { state: "on_time", next: soon, lastTick: Date.now() - HOUR };
    expect(clockStatus(h, en)).toMatchObject({ running: true, label: "Running" });
    expect(String(<ClockLine health={h} t={en} />)).toBe("");
  });
});

/** An in-memory stand-in for SV Cloud's stateful-object binding (as in clock-watchdog). */
function fakeState(store: Map<string, unknown>) {
  const stub = {
    sizeBytes: async () => 0,
    get: async (_t: string, k: string) => store.get(k),
    put: async (_t: string, k: string, v: unknown) => void store.set(k, v),
    delete: async (_t: string, k: string) => store.delete(k),
    list: async () => Object.fromEntries(store),
    scheduleTask: async () => {},
    takeTaskEvents: async () => [],
    cancelTasks: async () => 0,
    broadcast: async () => {},
    fetch: async () => new Response(null),
  };
  return {
    STATE_DIRECTORY: { resolve: async () => ({ id: "clock" }) },
    STATE_OBJECTS: { idFromString: (s: string) => s as unknown as DurableObjectId, get: () => stub },
    CLOUD_STATE_TOKEN: "token",
    TASK_WEBHOOK_SECRET: "secret",
  };
}

describe.skipIf(!HAS_DB)("/admin, the clock line", () => {
  const top = (html: string) => html.slice(html.indexOf("<h1"), html.indexOf('<section id="clock"'));
  const get = async (cookie: string, env: Record<string, unknown> = {}) =>
    (await app.request("/admin?lang=en", { headers: { cookie } }, { ...ENV, ...env })).text();

  it("shows Status unavailable locally (no stateful objects), linking to the card, with no Start button", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const html = await get(admin.cookie);
    expect(html).toContain('<section id="clock">');
    const head = top(html);
    expect(head).toContain('class="notice info clock-line"');
    expect(head).toContain('href="#clock"');
    expect(head).toContain("Status unavailable");
    expect(head).not.toContain("<form");
    expect(head).not.toContain("Start the clock");
  });

  it("shows Stopped when staff stopped it, and nothing while it is Running", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const stopped = top(await get(admin.cookie, fakeState(new Map<string, unknown>([["on", false]]))));
    expect(stopped).toContain("Stopped");
    expect(stopped).not.toContain("Start the clock");
    const running = top(await get(admin.cookie, fakeState(new Map<string, unknown>([["on", true], ["next", Date.now() + HOUR]]))));
    expect(running).not.toContain(`clock-line"`);
  });

  it("shows Restarted after the watchdog re-armed a missed tick", async () => {
    const admin = await createMember({ role: "bma_admin" });
    const store = new Map<string, unknown>([["on", true], ["next", Date.now() - 2 * HOUR], ["lastTick", Date.now() - 3 * HOUR]]);
    const head = top(await get(admin.cookie, fakeState(store)));
    expect(head).toContain('class="notice warn clock-line"');
    expect(head).toContain("Restarted");
  });

  it("is only on /admin for admins: other staff and other pages have no line", async () => {
    const mod = await createMember({ role: "moderator" });
    expect(await get(mod.cookie)).not.toContain(`clock-line"`);
    const admin = await createMember({ role: "bma_admin" });
    const other = await (await app.request("/admin/events?lang=en", { headers: { cookie: admin.cookie } }, ENV)).text();
    expect(other).not.toContain(`clock-line"`);
  });
});
