/**
 * Reading outside events (D46): the event description a page publishes for
 * search engines and calendars (schema.org Event in JSON-LD, Open Graph as a
 * fallback), and the events in an iCal feed. Pure functions, no fetching:
 * src/services/outside-fetch.ts gets the text.
 *
 * Only facts are kept (name, a short description, times, place, the page's
 * own link, the organiser for the credit). Images and long text are never
 * copied: every card credits its source and links back (D46, D49).
 */
export type OutsideEvent = {
  title: string;
  description: string;
  startsAt: Date | null;
  endsAt: Date | null;
  venueName: string | null;
  venueAddress: string | null;
  url: string | null;
  organizer: string | null;
  /** The page says the event happens online only (D50: never a Discover event). */
  online: boolean;
  /** iCal UID, when the event came from a feed. */
  uid?: string;
};

export const DESCRIPTION_MAX = 600;
export const TITLE_MAX = 120;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*|#39);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain text: tags out, entities decoded, whitespace folded, cut to `max` at a word. */
export function plain(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const text = decodeEntities(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u2013\u2014]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

function date(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  // A date with no time means the whole day; keep it as midnight Bangkok time.
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? `${v.trim()}T00:00:00+07:00` : v.trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isEventType = (t: unknown): boolean => (Array.isArray(t) ? t.some(isEventType) : typeof t === "string" && /(^|[/:])(\w*Event)$/.test(t) && t !== "EventSeries" && !/Reservation/.test(t));

function address(a: unknown): string | null {
  if (typeof a === "string") return plain(a, 300) || null;
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    const parts = [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode].filter((x): x is string => typeof x === "string" && !!x.trim());
    return parts.length ? plain(parts.join(", "), 300) : null;
  }
  return null;
}

function nameOf(v: unknown): string | null {
  if (typeof v === "string") return plain(v, 200) || null;
  if (Array.isArray(v)) return nameOf(v[0]);
  if (v && typeof v === "object") return nameOf((v as Record<string, unknown>).name);
  return null;
}

function fromJsonLd(o: Record<string, unknown>): OutsideEvent | null {
  const title = plain(o.name, TITLE_MAX);
  if (!title) return null;
  const locs = (Array.isArray(o.location) ? o.location : [o.location]).filter((l): l is Record<string, unknown> => !!l && typeof l === "object");
  const place = locs.find((l) => !/VirtualLocation/.test(String(l["@type"] ?? ""))) ?? null;
  const mode = String(o.eventAttendanceMode ?? "");
  const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
  const url = typeof o.url === "string" ? o.url : typeof offers?.url === "string" ? offers.url : null;
  return {
    title,
    description: plain(o.description, DESCRIPTION_MAX),
    startsAt: date(o.startDate),
    endsAt: date(o.endDate),
    venueName: place ? nameOf(place.name) : typeof o.location === "string" ? plain(o.location, 200) : null,
    venueAddress: place ? address(place.address) : null,
    url,
    organizer: nameOf(o.organizer),
    online: /OnlineEventAttendanceMode/.test(mode) || (locs.length > 0 && !place),
  };
}

function* walk(v: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || !v || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v.slice(0, 50)) yield* walk(x, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  if (isEventType(o["@type"])) yield o;
  if (o["@graph"]) yield* walk(o["@graph"], depth + 1);
  if (o.mainEntity) yield* walk(o.mainEntity, depth + 1);
}

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const content = tag ? /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag) : null;
  const v = content ? (content[2] ?? content[3] ?? "") : "";
  return v.trim() ? decodeEntities(v.trim()) : null;
}

/** The first event a page describes: schema.org JSON-LD first, then Open Graph. */
export function readEventPage(html: string, pageUrl: string): OutsideEvent | null {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  let n = 0;
  for (const m of scripts) {
    if (++n > 20) break;
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      const ev = fromJsonLd(o);
      if (ev) return { ...ev, url: safeHttps(ev.url, pageUrl) ?? pageUrl };
    }
  }
  const title = plain(meta(html, "og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "", TITLE_MAX);
  if (!title) return null;
  return {
    title,
    description: plain(meta(html, "og:description") ?? meta(html, "description") ?? "", DESCRIPTION_MAX),
    startsAt: date(meta(html, "event:start_time") ?? meta(html, "og:start_time")),
    endsAt: date(meta(html, "event:end_time") ?? meta(html, "og:end_time")),
    venueName: null,
    venueAddress: null,
    url: safeHttps(meta(html, "og:url"), pageUrl) ?? pageUrl,
    organizer: meta(html, "og:site_name") ? plain(meta(html, "og:site_name"), 120) : null,
    online: false,
  };
}

/** An https URL resolved against the page, or null. */
export function safeHttps(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    return u.protocol === "https:" && u.toString().length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ iCal --

const unescapeIcal = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

/** An iCal DATE or DATE-TIME. Floating and TZID times are read as Bangkok time (the feeds we add are Bangkok calendars). */
export function icalDate(value: string, params: string): Date | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+07:00`);
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7] === "Z") return new Date(`${iso}Z`);
  // TZID other than Bangkok: common Asian offsets the city calendars use; anything else falls back to Bangkok.
  const tz = /TZID=([^;:]+)/i.exec(params)?.[1] ?? "Asia/Bangkok";
  const offsets: Record<string, string> = { "Asia/Bangkok": "+07:00", "Asia/Ho_Chi_Minh": "+07:00", "Asia/Jakarta": "+07:00", "Asia/Singapore": "+08:00", "Asia/Tokyo": "+09:00", UTC: "Z", "Etc/UTC": "Z" };
  const d = new Date(`${iso}${offsets[tz] ?? "+07:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const FEED_EVENTS_MAX = 300;

/** Upcoming events in an iCal feed (VEVENTs, no recurrence expansion), at most FEED_EVENTS_MAX. */
export function readIcal(text: string, now = new Date(), horizonDays = 120): OutsideEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: OutsideEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  const until = now.getTime() + horizonDays * 86_400_000;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const startsAt = cur.DTSTART ? icalDate(cur.DTSTART.value, cur.DTSTART.params) : null;
        const title = plain(unescapeIcal(cur.SUMMARY?.value ?? ""), TITLE_MAX);
        const status = (cur.STATUS?.value ?? "").toUpperCase();
        if (title && startsAt && startsAt.getTime() > now.getTime() && startsAt.getTime() < until && status !== "CANCELLED") {
          const loc = plain(unescapeIcal(cur.LOCATION?.value ?? ""), 300);
          const [venueName, ...rest] = loc.split(/,\s*/);
          const url = cur.URL?.value?.trim() ?? null;
          out.push({
            title,
            description: plain(unescapeIcal(cur.DESCRIPTION?.value ?? ""), DESCRIPTION_MAX),
            startsAt,
            endsAt: cur.DTEND ? icalDate(cur.DTEND.value, cur.DTEND.params) : null,
            venueName: venueName || null,
            venueAddress: rest.join(", ") || null,
            url: url && /^https:\/\//i.test(url) ? url.slice(0, 500) : null,
            organizer: cur.ORGANIZER ? plain(/CN=([^;:]+)/i.exec(cur.ORGANIZER.params)?.[1]?.replace(/^"|"$/g, "") ?? "", 120) || null : null,
            online: /^https?:\/\//i.test(loc) && !venueName.includes(" "),
            uid: plain(cur.UID?.value ?? "", 300) || undefined,
          });
          if (out.length >= FEED_EVENTS_MAX) break;
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (m && !cur[m[1]]) cur[m[1]] = { params: m[2], value: m[3] };
  }
  return out;
}

/** A stable key for de-duplication: the feed's UID, or the page URL without tracking bits. */
export function dedupeKey(ev: { uid?: string; url: string | null }, feedId?: string): string | null {
  if (ev.uid) return `uid:${feedId ?? ""}:${ev.uid}`.slice(0, 400);
  if (!ev.url) return null;
  try {
    const u = new URL(ev.url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|aff)/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return `url:${u.toString().replace(/\/$/, "")}`.slice(0, 400);
  } catch {
    return null;
  }
}
