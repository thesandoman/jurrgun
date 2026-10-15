/**
 * Kaipa partner events: cleaning up their PublicEvent, prices, the gentle
 * cached fetch, and the Discover section + detail page (fetch faked; no
 * network in tests).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPrice, kaipaConfig, kaipaEvent, kaipaEvents, resetKaipaCache, toPartnerEvent } from "../src/services/kaipa";
import { ENV, HAS_DB, createMember } from "./helpers";
import app from "../src/index";

const KAIPA = { KAIPA_API_URL: "https://dev.kaipa.io", KAIPA_FRONTEND_URL: "https://dev-frontend.kaipa.io", KAIPA_COUNTRIES: "*" };
const cfg = kaipaConfig(KAIPA)!;
const soon = new Date(Date.now() + 5 * 86_400_000);
const iso = (d: Date) => d.toISOString().replace("Z", "+00:00");

const raw = (over: Record<string, unknown> = {}) => ({
  id: 42,
  event_name: "Rooftop Mixer",
  event_description: "Line one\r\n\r\nLine two",
  event_performers: [{ performer_name: "DJ Nova" }],
  event_start_date: soon.toISOString().slice(0, 10),
  event_start_time: "13:00:00",
  local_start_datetime: iso(soon),
  local_end_datetime: iso(new Date(soon.getTime() + 3 * 3_600_000)),
  event_timezone: "Asia/Bangkok",
  event_location: "Sky Bar",
  event_street_address_line_1: "1 Silom Rd",
  event_city: "Bangkok",
  event_country: "Thailand",
  poster: "https://cdn.example/poster.jpg",
  host_name: "Example Host",
  is_private: false,
  tickets: [
    { ticket_type: "VIP", customer_price: 1200, ticket_category: "standard", is_active: true, is_sold_out: false, display_order: 2 },
    { ticket_type: "General", customer_price: 350.5, ticket_category: "standard", is_active: true, is_sold_out: false, display_order: 1 },
    { ticket_type: "Guest list", customer_price: 0, ticket_category: "guest", is_active: true, is_sold_out: false },
    { ticket_type: "Early bird", customer_price: 200, ticket_category: "standard", is_active: true, is_sold_out: true },
  ],
  add_ons: [{ name: "T-shirt", customer_price: "300.00", is_active: true }],
  ...over,
});

function fakeKaipa(events: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const u = new URL(String(url));
      const m = u.pathname.match(/^\/api\/events\/(\d+)\/$/);
      if (m) {
        const e = (events as { id: number }[]).find((x) => x.id === Number(m[1]));
        return e ? new Response(JSON.stringify({ event: e }), { status: 200 }) : new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ event_list: events, total_pages: 1, current_page: 1 }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetKaipaCache();
});

describe("Kaipa event clean-up", () => {
  it("is off without both URLs, defaults to Thailand, accepts '*'", () => {
    expect(kaipaConfig({})).toBeNull();
    expect(kaipaConfig({ KAIPA_API_URL: "https://dev.kaipa.io" })).toBeNull();
    expect(kaipaConfig({ KAIPA_API_URL: "https://x", KAIPA_FRONTEND_URL: "https://y" })!.countries).toEqual(["Thailand"]);
    expect(cfg.countries).toBe("all");
  });

  it("shows the customer price, hides guest and sold-out tickets, keeps order, and builds the buy link", () => {
    const e = toPartnerEvent(raw(), cfg)!;
    expect(e.tickets.map((x) => x.name)).toEqual(["General", "VIP"]);
    expect(e.tickets[0].price).toBe("฿350.50");
    expect(e.cheapest).toBe("฿350.50");
    expect(e.hasFree).toBe(false);
    expect(e.addOns).toEqual([{ name: "T-shirt", price: "฿300.00" }]);
    expect(e.description).toBe("Line one\n\nLine two");
    expect(e.buyUrl).toBe("https://dev-frontend.kaipa.io/event/42");
    expect(e.startsAt.getTime()).toBe(soon.getTime());
  });

  it("drops private, unnamed or undated events and http posters", () => {
    expect(toPartnerEvent(raw({ is_private: true }), cfg)).toBeNull();
    expect(toPartnerEvent(raw({ event_name: "" }), cfg)).toBeNull();
    expect(toPartnerEvent(raw({ local_start_datetime: null, event_start_date: null }), cfg)).toBeNull();
    expect(toPartnerEvent(raw({ poster: "http://insecure/p.jpg" }), cfg)!.poster).toBeNull();
    // An end before the start (seen in Kaipa's dev data) is ignored.
    expect(toPartnerEvent(raw({ local_end_datetime: iso(new Date(soon.getTime() - 86_400_000)) }), cfg)!.endsAt).toBeNull();
  });

  it("formats each country's currency, with no decimals for yen", () => {
    expect(formatPrice(22.68, "United Kingdom")).toBe("£22.68");
    expect(formatPrice(1000, "Japan")).toBe("¥1,000");
    expect(formatPrice(9.5, "Atlantis")).toBe("9.50");
  });
});

describe("Kaipa fetch", () => {
  it("returns upcoming events only, and caches the list for 10 minutes", async () => {
    const past = raw({ id: 7, local_start_datetime: "2020-01-01T10:00:00+07:00", local_end_datetime: "2020-01-01T12:00:00+07:00" });
    const calls = fakeKaipa([raw(), past]);
    const first = await kaipaEvents(KAIPA);
    expect(first.map((e) => e.id)).toEqual([42]);
    await kaipaEvents(KAIPA);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("per_page=50");
  });

  it("asks by country when limited, and is silent offline or in tests", async () => {
    const calls = fakeKaipa([raw()]);
    await kaipaEvents({ ...KAIPA, KAIPA_COUNTRIES: "Thailand" });
    expect(calls[0]).toContain("country=Thailand");
    expect(await kaipaEvents({ ...KAIPA, NO_EXTERNAL: "1" })).toEqual([]);
    expect(await kaipaEvents({})).toEqual([]);
  });

  it("finds one event in the list, else asks Kaipa, and never returns private or unknown ones", async () => {
    fakeKaipa([raw(), raw({ id: 9, is_private: true })]);
    expect((await kaipaEvent(KAIPA, 42))!.name).toBe("Rooftop Mixer");
    expect(await kaipaEvent(KAIPA, 9)).toBeNull();
    expect(await kaipaEvent(KAIPA, 12345)).toBeNull();
    expect(await kaipaEvent(KAIPA, -1)).toBeNull();
  });

  it("returns nothing (not an error) when Kaipa is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 500 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await kaipaEvents(KAIPA)).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("Kaipa on Discover", () => {
  const env = { ...ENV, NO_EXTERNAL: "", ...KAIPA };
  const get = (path: string, cookie: string) => app.request(path, { headers: { cookie: `${cookie}; lang=en` } }, env);

  it("lists partner events under Jurrgun's own and links to their page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).startsWith("https://dev.kaipa.io")) return new Response(JSON.stringify({ event_list: [raw()], total_pages: 1 }), { status: 200 });
      return new Response("{}", { status: 503 }); // weather etc.
    }));
    const m = await createMember();
    const html = await (await get("/events?view=list", m.cookie)).text();
    expect(html).toContain("Ticketed events from our partner Kaipa");
    expect(html).toContain('href="/partner-events/kaipa/42"');
    expect(html).toContain("From ฿350.50");
    // A Jurrgun-only filter hides them.
    expect(await (await get("/events?view=list&district=bang_rak", m.cookie)).text()).not.toContain("Ticketed events from our partner Kaipa");
  });

  it("shows the detail page with a ticket link, and 404s anything else", async () => {
    fakeKaipa([raw()]);
    const m = await createMember();
    const r = await get("/partner-events/kaipa/42", m.cookie);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('href="https://dev-frontend.kaipa.io/event/42"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("DJ Nova");
    expect(html).not.toContain("Guest list");
    expect((await get("/partner-events/kaipa/999", m.cookie)).status).toBe(404);
    expect((await get("/partner-events/kaipa/abc", m.cookie)).status).toBe(404);
  });
});
