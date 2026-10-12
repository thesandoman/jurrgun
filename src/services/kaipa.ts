/**
 * Kaipa (partner ticketing): public events shown on Discover, with tickets
 * bought on Kaipa's own page. Read-only: no Kaipa account, token or payment
 * ever passes through Jurrgun.
 *
 * Rules from Kaipa's integration guide that this file keeps:
 *  - Called only from the server, never from the browser.
 *  - Gentle: one shared list, cached for 10 minutes per app instance, pages
 *    fetched one second apart, no polling (a stale list is refreshed when
 *    someone opens Discover, in the background if a copy is already cached).
 *  - Private events are never listed; guest, inactive and sold-out tickets are
 *    hidden; buyers see the customer price (face + fees), not the face value.
 *  - Times come as UTC; `local_start_datetime` carries the event's own offset.
 *  - Ticket links only go to events we have just seen in the list or detail.
 *
 * Off unless KAIPA_API_URL is set. KAIPA_COUNTRIES picks which countries to
 * show (comma separated, exact Kaipa names, "*" for all; default Thailand).
 */

export type KaipaConfig = { api: string; frontend: string; countries: string[] | "all" };

export function kaipaConfig(env: { KAIPA_API_URL?: string; KAIPA_FRONTEND_URL?: string; KAIPA_COUNTRIES?: string; NO_EXTERNAL?: string }): KaipaConfig | null {
  if (!env.KAIPA_API_URL || !/^https:\/\//.test(env.KAIPA_API_URL)) return null;
  const frontend = env.KAIPA_FRONTEND_URL && /^https:\/\//.test(env.KAIPA_FRONTEND_URL) ? env.KAIPA_FRONTEND_URL : null;
  if (!frontend) return null;
  const raw = (env.KAIPA_COUNTRIES ?? "Thailand").trim();
  const countries = raw === "*" ? "all" : raw.split(",").map((s) => s.trim()).filter(Boolean);
  return { api: env.KAIPA_API_URL.replace(/\/+$/, ""), frontend: frontend.replace(/\/+$/, ""), countries };
}

/** What Discover and the detail page need, already cleaned up. */
export type PartnerEvent = {
  id: number;
  name: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  /** The event's own clock, e.g. "Asia/Bangkok", for showing times. */
  timezone: string;
  venue: string;
  address: string;
  city: string;
  country: string;
  poster: string | null;
  posterFocus: [number, number];
  hostName: string | null;
  performers: string[];
  /** On-sale tickets; `price` is the customer price, empty when free. */
  tickets: { name: string; price: string; free: boolean; description: string }[];
  addOns: { name: string; price: string }[];
  /** Cheapest paid ticket (customer price), or null when none is paid. */
  cheapest: string | null;
  /** Some free ticket is on sale. */
  hasFree: boolean;
  buyUrl: string;
};

const CURRENCY: Record<string, { code: string; digits: number }> = {
  "United Kingdom": { code: "GBP", digits: 2 },
  "United States": { code: "USD", digits: 2 },
  Malaysia: { code: "MYR", digits: 2 },
  Japan: { code: "JPY", digits: 0 },
  Thailand: { code: "THB", digits: 2 },
  France: { code: "EUR", digits: 2 },
  Bangladesh: { code: "BDT", digits: 2 },
};

/** Buyers see the customer price, in the event's currency (Kaipa's own formatting shows "$" for some countries). */
export function formatPrice(amount: number, country: string): string {
  const cur = CURRENCY[country];
  if (!cur) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur.code, currencyDisplay: "narrowSymbol", minimumFractionDigits: cur.digits, maximumFractionDigits: cur.digits }).format(amount);
  } catch {
    return `${amount.toFixed(cur.digits)} ${cur.code}`;
  }
}

type RawTicket = {
  ticket_type?: string;
  customer_price?: number | string;
  ticket_category?: string;
  is_active?: boolean;
  is_sold_out?: boolean;
  description?: string;
  display_order?: number;
};
type RawEvent = {
  id?: number;
  event_name?: string;
  event_description?: string;
  event_performers?: { performer_name?: string }[] | null;
  event_start_date?: string | null;
  event_start_time?: string | null;
  event_end_date?: string | null;
  event_end_time?: string | null;
  local_start_datetime?: string | null;
  local_end_datetime?: string | null;
  event_timezone?: string;
  event_location?: string;
  event_street_address_line_1?: string;
  event_street_address_line_2?: string;
  event_city?: string;
  event_country?: string;
  event_postcode?: string;
  poster?: string | null;
  poster_focus_x?: number;
  poster_focus_y?: number;
  host_name?: string | null;
  is_private?: boolean;
  tickets?: RawTicket[];
  add_ons?: { name?: string; customer_price?: string | number; is_active?: boolean; is_sold_out?: boolean }[];
};

const when = (local: string | null | undefined, date: string | null | undefined, time: string | null | undefined): Date | null => {
  // local_*_datetime carries the offset, so it is an exact instant; fall back to the raw UTC fields.
  const d = local ? new Date(local) : date ? new Date(`${date}T${time ?? "00:00:00"}Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const https = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : null);
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\r\n?/g, "\n").trim().slice(0, n) : "");

/** Kaipa's PublicEvent → PartnerEvent, or null for anything not to show (private, undated, malformed). */
export function toPartnerEvent(e: RawEvent, cfg: KaipaConfig): PartnerEvent | null {
  if (!e || !Number.isInteger(e.id) || (e.id as number) <= 0 || e.is_private) return null;
  const startsAt = when(e.local_start_datetime, e.event_start_date, e.event_start_time);
  if (!startsAt || !e.event_name) return null;
  const country = clip(e.event_country, 60);
  const visible = (e.tickets ?? [])
    .filter((t) => t.ticket_category !== "guest" && t.is_active !== false && !t.is_sold_out)
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  const tickets = visible.map((t) => {
    const amount = Number(t.customer_price ?? 0);
    const free = t.ticket_category === "free" || amount === 0;
    return { name: clip(t.ticket_type, 80) || "Ticket", price: free ? "" : formatPrice(amount, country), free, description: clip(t.description, 300) };
  });
  const paid = visible.filter((t) => t.ticket_category !== "free" && Number(t.customer_price) > 0).map((t) => Number(t.customer_price));
  const id = e.id as number;
  // An end before the start is a data slip on Kaipa's side: ignore it rather than show it.
  const end = when(e.local_end_datetime, e.event_end_date, e.event_end_time);
  return {
    id,
    name: clip(e.event_name, 140),
    description: clip(e.event_description, 4000),
    startsAt,
    endsAt: end && end > startsAt ? end : null,
    timezone: clip(e.event_timezone, 60) || "UTC",
    venue: clip(e.event_location, 140),
    address: [e.event_street_address_line_1, e.event_street_address_line_2, e.event_postcode].map((x) => clip(x, 140)).filter(Boolean).join(", "),
    city: clip(e.event_city, 80),
    country,
    poster: https(e.poster),
    posterFocus: [Math.max(0, Math.min(100, Number(e.poster_focus_x ?? 50))), Math.max(0, Math.min(100, Number(e.poster_focus_y ?? 50)))],
    hostName: clip(e.host_name, 80) || null,
    performers: (e.event_performers ?? []).map((p) => clip(p?.performer_name, 80)).filter(Boolean).slice(0, 12),
    tickets,
    addOns: (e.add_ons ?? [])
      .filter((a) => a.is_active !== false && !a.is_sold_out)
      .map((a) => ({ name: clip(a.name, 80), price: formatPrice(Number(a.customer_price ?? 0), country) }))
      .filter((a) => a.name),
    cheapest: paid.length ? formatPrice(Math.min(...paid), country) : null,
    hasFree: tickets.some((t) => t.free),
    buyUrl: `${cfg.frontend}/event/${id}`,
  };
}

const TTL_MS = 10 * 60_000;
/** A stale list is still shown for up to a day if Kaipa is down. */
const STALE_MS = 24 * 60 * 60_000;
const MAX_PAGES = 6;
const TIMEOUT_MS = 8000;

let cache: { at: number; key: string; events: PartnerEvent[] } | null = null;
let inflight: Promise<PartnerEvent[] | null> | null = null;

/** For tests: forget the cached list. */
export function resetKaipaCache() {
  cache = null;
  inflight = null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`kaipa ${r.status}`);
  return r.json();
}

async function fetchAll(cfg: KaipaConfig, now: number): Promise<PartnerEvent[]> {
  const countries = cfg.countries === "all" ? [null] : cfg.countries;
  const out: PartnerEvent[] = [];
  let first = true;
  for (const country of countries) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (!first) await pause(1000); // stay under ~1 request a second
      first = false;
      const q = new URLSearchParams({ per_page: "50", page: String(page) });
      if (country) q.set("country", country);
      const body = (await fetchJson(`${cfg.api}/api/events/?${q}`)) as { event_list?: RawEvent[]; total_pages?: number };
      const list = Array.isArray(body.event_list) ? body.event_list : [];
      for (const raw of list) {
        const e = toPartnerEvent(raw, cfg);
        // Upcoming only: still running or not yet started.
        if (e && (e.endsAt ?? e.startsAt).getTime() > now) out.push(e);
      }
      if (list.length === 0 || page >= Number(body.total_pages ?? 1)) break;
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Upcoming Kaipa events, soonest first. Fresh for 10 minutes; after that the
 * cached list is returned at once and refreshed in the background (`defer`,
 * usually executionCtx.waitUntil). Returns [] when Kaipa is off or unreachable.
 */
export async function kaipaEvents(
  env: { KAIPA_API_URL?: string; KAIPA_FRONTEND_URL?: string; KAIPA_COUNTRIES?: string; NO_EXTERNAL?: string },
  opts: { now?: number; defer?: (p: Promise<unknown>) => void } = {},
): Promise<PartnerEvent[]> {
  const cfg = kaipaConfig(env);
  if (!cfg || env.NO_EXTERNAL) return [];
  const now = opts.now ?? Date.now();
  const key = `${cfg.api}|${cfg.countries === "all" ? "*" : cfg.countries.join(",")}`;
  const usable = cache && cache.key === key && now - cache.at < STALE_MS ? cache : null;
  const upcoming = (list: PartnerEvent[]) => list.filter((e) => (e.endsAt ?? e.startsAt).getTime() > now);
  if (usable && now - usable.at < TTL_MS) return upcoming(usable.events);

  inflight ??= fetchAll(cfg, now)
    .then((events) => {
      cache = { at: Date.now(), key, events };
      return events;
    })
    .catch((err) => {
      console.warn(`[warn] kaipa.list_failed ${String(err)}`);
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  if (usable) {
    // Serve the stale copy now; refresh behind the response.
    opts.defer?.(inflight);
    return upcoming(usable.events);
  }
  return upcoming((await inflight) ?? []);
}

/**
 * One event, for its detail page: from the cached list, else asked from Kaipa
 * (so a just-published event still opens). Null if it isn't public and upcoming.
 */
export async function kaipaEvent(
  env: { KAIPA_API_URL?: string; KAIPA_FRONTEND_URL?: string; KAIPA_COUNTRIES?: string; NO_EXTERNAL?: string },
  id: number,
  opts: { now?: number; defer?: (p: Promise<unknown>) => void } = {},
): Promise<PartnerEvent | null> {
  const cfg = kaipaConfig(env);
  if (!cfg || env.NO_EXTERNAL || !Number.isInteger(id) || id <= 0) return null;
  const now = opts.now ?? Date.now();
  const listed = (await kaipaEvents(env, opts)).find((e) => e.id === id);
  if (listed) return listed;
  try {
    const body = (await fetchJson(`${cfg.api}/api/events/${id}/`)) as { event?: RawEvent };
    const e = body.event ? toPartnerEvent(body.event, cfg) : null;
    if (!e || (e.endsAt ?? e.startsAt).getTime() <= now) return null;
    if (cfg.countries !== "all" && !cfg.countries.includes(e.country)) return null;
    return e;
  } catch {
    return null;
  }
}
