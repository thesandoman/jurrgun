/**
 * The hourly clock heals itself (2026-10-26: one undelivered tick at 04:00 UTC
 * ended the chain, silently). ensureClock re-arms a clock that is on but
 * overdue, never one an admin stopped; onClockTask records each tick and
 * collapses duplicate chains; /api/health reports the clock.
 */
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { CLOCK_TASK, ensureClock, onClockTask, startClock, stopClock, watchClock } from "../src/services/clock";
import { ENV, HAS_DB } from "./helpers";

const HOUR = 3_600_000;

/** An in-memory stand-in for SV Cloud's stateful-object binding. */
function fakeState(opts: { failSchedule?: boolean } = {}) {
  const store = new Map<string, unknown>();
  const tasks: { name: string; runAt: number }[] = [];
  const calls: string[] = [];
  const stub = {
    sizeBytes: async () => 0,
    get: async (_t: string, k: string) => store.get(k),
    put: async (_t: string, k: string, v: unknown) => void store.set(k, v),
    delete: async (_t: string, k: string) => store.delete(k),
    list: async () => Object.fromEntries(store),
    scheduleTask: async (_t: string, name: string, runAt: number) => {
      calls.push("schedule");
      if (opts.failSchedule) throw new Error("platform down");
      tasks.push({ name, runAt });
    },
    takeTaskEvents: async () => (calls.push("take"), []),
    cancelTasks: async (_t: string, name: string) => {
      calls.push("cancel");
      const before = tasks.length;
      for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].name === name) tasks.splice(i, 1);
      return before - tasks.length;
    },
    broadcast: async () => {},
    fetch: async () => new Response(null),
  };
  const env = {
    STATE_DIRECTORY: { resolve: async () => ({ id: "clock" }) },
    STATE_OBJECTS: { idFromString: (s: string) => s as unknown as DurableObjectId, get: () => stub },
    CLOUD_STATE_TOKEN: "token",
    TASK_WEBHOOK_SECRET: "secret",
  };
  return { env: env as unknown as typeof ENV & typeof env, store, tasks, calls };
}

describe("ensureClock, the watchdog", () => {
  const now = Date.UTC(2026, 9, 26, 7, 20); // 14:20 Bangkok

  it("leaves a clock that is on time alone", async () => {
    const s = fakeState();
    await startClock(s.env, new Date(now));
    s.calls.length = 0;
    expect((await ensureClock(s.env, now)).state).toBe("on_time");
    expect(s.calls).toEqual([]);
  });

  it("re-arms a clock whose tick never came, one minute out, as a single chain", async () => {
    const s = fakeState();
    // The state prod was left in: a booked hour long past, from before "on" existed.
    s.store.set("next", now - 3 * HOUR);
    const h = await ensureClock(s.env, now);
    expect(h).toMatchObject({ state: "rearmed", next: now + 60_000 });
    expect(s.tasks).toEqual([{ name: CLOCK_TASK, runAt: now + 60_000 }]);
    expect(s.calls.indexOf("cancel")).toBeLessThan(s.calls.indexOf("schedule"));
    expect(s.store.get("on")).toBe(true);
    // A second look a moment later finds it on time again and books nothing more.
    expect((await ensureClock(s.env, now + 5_000)).state).toBe("on_time");
    expect(s.tasks).toHaveLength(1);
  });

  it("never restarts a clock an admin stopped, or one never started", async () => {
    const s = fakeState();
    await startClock(s.env, new Date(now - 5 * HOUR));
    await stopClock(s.env);
    expect((await ensureClock(s.env, now)).state).toBe("off");
    expect(s.tasks).toEqual([]);
    expect((await ensureClock(fakeState().env, now)).state).toBe("off");
  });

  it("is quiet where there are no stateful objects (local, tests)", async () => {
    expect((await ensureClock(ENV as never, now)).state).toBe("unavailable");
  });

  it("watchClock checks at most once per isolate every 10 minutes, off the response path", async () => {
    const s = fakeState();
    const waits: Promise<unknown>[] = [];
    const t0 = now + 7 * HOUR; // later than any earlier call in this file
    watchClock(s.env, (p) => waits.push(p), t0);
    watchClock(s.env, (p) => waits.push(p), t0 + 60_000);
    expect(waits).toHaveLength(1);
    watchClock(s.env, (p) => waits.push(p), t0 + 11 * 60_000);
    expect(waits).toHaveLength(2);
    watchClock(s.env, null, t0 + 30 * 60_000); // no execution context: nothing
    expect(waits).toHaveLength(2);
    await Promise.all(waits);
  });
});

describe.skipIf(!HAS_DB)("onClockTask and /api/health", () => {
  it("records each tick and books exactly one next hour", async () => {
    const s = fakeState();
    const firedAt = Math.floor(Date.now() / HOUR) * HOUR;
    s.tasks.push({ name: CLOCK_TASK, runAt: firedAt + HOUR }); // a duplicate chain's pending task
    const env = { ...ENV, ...s.env };
    await onClockTask(env, firedAt);
    expect(s.store.get("lastTick")).toBe(firedAt);
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0].runAt).toBeGreaterThan(Date.now());
  });

  it("still does the hour's work when booking fails, and the watchdog repairs the chain", async () => {
    const s = fakeState({ failSchedule: true });
    s.store.set("on", true);
    const firedAt = Math.floor(Date.now() / HOUR) * HOUR;
    const run = await onClockTask({ ...ENV, ...s.env }, firedAt);
    expect(run).not.toBeNull(); // the work ran
    expect(s.store.get("lastTick")).toBe(firedAt);
  });

  it("/api/health reports the clock, and heals it", async () => {
    const s = fakeState();
    s.store.set("next", Date.now() - 2 * HOUR);
    s.store.set("lastTick", Date.now() - 3 * HOUR);
    const r = await app.request("/api/health", {}, { ...ENV, ...s.env });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string; clock: string; clockLastTick?: string };
    expect(body).toMatchObject({ status: "ok", clock: "rearmed" });
    expect(typeof body.clockLastTick).toBe("string");
    const again = (await (await app.request("/api/health", {}, { ...ENV, ...s.env })).json()) as { clock: string };
    expect(again.clock).toBe("on_time");
  });
});
