/**
 * Offline next table: the service worker keeps only the member's own pass
 * page, stamps when it saved it, serves it only when the network fails,
 * drops it once the event has ended, and forgets everything on sign-out.
 * The worker script is run in a small fake worker scope (no browser needed).
 */
import { describe, expect, it } from "vitest";
import vm from "node:vm";
import app from "../src/index";
import { OFFLINE_CACHE } from "../src/ui/offline-next";

type Handler = (e: Record<string, unknown>) => void;

/** A minimal CacheStorage: named caches keyed by path. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const pathOf = (k: string | Request) => new URL(typeof k === "string" ? k : k.url, "https://jurrgun.test").pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (k: string | Request) => m.get(pathOf(k))?.clone(),
      put: async (k: string | Request, r: Response) => void m.set(pathOf(k), r),
      delete: async (k: string | Request) => m.delete(pathOf(k)),
      keys: async () => [...m.keys()].map((p) => new Request(`https://jurrgun.test${p}`)),
      addAll: async (urls: Request[]) => {
        for (const u of urls) m.set(pathOf(u), new Response("offline page"));
      },
    };
  };
  return {
    stores,
    api: {
      open,
      match: async (k: string | Request) => {
        for (const m of stores.values()) {
          const hit = m.get(pathOf(k));
          if (hit) return hit.clone();
        }
        return undefined;
      },
      delete: async (name: string) => stores.delete(name),
      keys: async () => [...stores.keys()],
    },
  };
}

async function worker(network: (url: string) => Promise<Response>) {
  const src = await (await app.request("/sw.js")).text();
  const handlers = new Map<string, Handler>();
  const caches = fakeCaches();
  const scope = {
    location: { origin: "https://jurrgun.test" },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    registration: {},
  };
  // Relative URLs resolve against the worker's origin, as they do in a real worker.
  const WorkerRequest = class extends Request {
    constructor(u: string, init?: RequestInit) {
      super(new URL(u, scope.location.origin), init);
    }
  };
  const ctx = vm.createContext({ self: scope, caches: caches.api, fetch: (u: string | Request) => network(typeof u === "string" ? u : u.url), Request: WorkerRequest, Response, URL, Date, Promise, console });
  vm.runInContext(src, ctx);
  const installing: Promise<unknown>[] = [];
  handlers.get("install")!({ waitUntil: (p: Promise<unknown>) => installing.push(p) });
  await Promise.all(installing);

  /** Navigate to a page; resolves with the response the worker gave and waits for its background work. */
  async function navigate(path: string, method = "GET") {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;
    const req = { method, mode: "navigate", url: `https://jurrgun.test${path}` };
    handlers.get("fetch")!({ request: req, respondWith: (p: Promise<Response>) => (responded = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    const res = responded ? await responded : null;
    await Promise.all(waits);
    return res as Response | null;
  }
  async function message(data: unknown) {
    const waits: Promise<unknown>[] = [];
    handlers.get("message")!({ data, origin: "https://jurrgun.test", waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }
  return { navigate, message, saved: () => caches.stores.get(OFFLINE_CACHE) ?? new Map<string, Response>() };
}

const passHtml = (endsAt: Date) =>
  `<html><body><p id="offline-saved" hidden></p><section class="card essentials" data-ends="${endsAt.toISOString()}" data-offline-saved=""><h1>Board games</h1></section></body></html>`;

describe("offline next table: service worker", () => {
  it("keeps the pass page with the time it was saved, and serves it only when the network fails", async () => {
    let online = true;
    const later = new Date(Date.now() + 86_400_000);
    const sw = await worker(async () => {
      if (!online) throw new TypeError("offline");
      return new Response(passHtml(later), { headers: { "content-type": "text/html" } });
    });
    const live = await sw.navigate("/me/events/abc-123/pass");
    expect(await live!.text()).toContain('data-offline-saved=""'); // the live page: no note
    expect(sw.saved().has("/me/events/abc-123/pass")).toBe(true);

    online = false;
    const cached = await sw.navigate("/me/events/abc-123/pass");
    const html = await cached!.text();
    expect(html).toMatch(/data-offline-saved="\d{4}-\d\d-\d\dT[^"]+"/);
    expect(html).toContain("Board games");
  });

  it("never keeps any other page", async () => {
    const sw = await worker(async () => new Response(passHtml(new Date(Date.now() + 86_400_000))));
    for (const p of ["/", "/me/events", "/chat/conn:x", "/events/abc/live", "/me/events/abc/pass?show=pass"]) await sw.navigate(p);
    expect(sw.saved().size).toBe(0);
  });

  it("does not keep a page without the essentials (the checked-in phone-down view), a sign-in redirect or an error", async () => {
    let body = "<html><h1>Phone down</h1></html>";
    let status = 200;
    const sw = await worker(async () => new Response(body, { status }));
    await sw.navigate("/me/events/a/pass");
    expect(sw.saved().size).toBe(0);
    body = passHtml(new Date(Date.now() + 86_400_000));
    status = 500;
    await sw.navigate("/me/events/a/pass");
    expect(sw.saved().size).toBe(0);
  });

  it("drops a pass once its event has ended, and when the seat is gone", async () => {
    let online = true;
    let html = passHtml(new Date(Date.now() - 60_000));
    let status = 200;
    const sw = await worker(async () => {
      if (!online) throw new TypeError("offline");
      return new Response(html, { status });
    });
    await sw.navigate("/me/events/old/pass");
    online = false;
    const res = await sw.navigate("/me/events/old/pass");
    expect(await res!.text()).toBe("offline page");
    expect(sw.saved().has("/me/events/old/pass")).toBe(false);

    online = true;
    html = passHtml(new Date(Date.now() + 86_400_000));
    await sw.navigate("/me/events/gone/pass");
    expect(sw.saved().has("/me/events/gone/pass")).toBe(true);
    status = 404;
    await sw.navigate("/me/events/gone/pass");
    expect(sw.saved().has("/me/events/gone/pass")).toBe(false);
  });

  it("saves the next passes from My events, drops the rest, and forgets everything on sign-out", async () => {
    const sw = await worker(async () => new Response(passHtml(new Date(Date.now() + 86_400_000))));
    await sw.message({ type: "jurrgun-save-next", urls: ["/me/events/a/pass", "/me/events/b/pass", "/", "https://evil.example/x"] });
    expect([...sw.saved().keys()].sort()).toEqual(["/me/events/a/pass", "/me/events/b/pass"]);
    await sw.message({ type: "jurrgun-save-next", urls: ["/me/events/b/pass"], replace: true });
    expect([...sw.saved().keys()]).toEqual(["/me/events/b/pass"]);
    await sw.navigate("/logout", "POST");
    expect(sw.saved().size).toBe(0);
  });
});

describe("offline next table: pages", () => {
  it("the offline page lists saved tables from the device, without any member data from the server", async () => {
    const html = await (await app.request("/offline")).text();
    expect(html).toContain('id="offline-next-list"');
    expect(html).toContain("นัดที่บันทึกไว้ในเครื่องนี้");
    expect(html).toContain(OFFLINE_CACHE);
    // The offline page is cached signed-out: it must not wipe the saved tables itself.
    expect(html).not.toContain("jurrgun-clear-next");
  });

  it("signed-out pages forget saved tables on this device", async () => {
    const html = await (await app.request("/login", {}, { NO_EXTERNAL: "1" })).text();
    expect(html).toContain("jurrgun-clear-next");
  });
});
