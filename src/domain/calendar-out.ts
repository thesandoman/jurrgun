/**
 * Calendars out (D48): iCal text and schema.org JSON-LD for Jurrgun events.
 * Pure: the routes in src/routes/calendar.ts choose which events go in.
 */
export type CalEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  venueAddress: string;
  url: string;
  costThb?: number;
  cancelled?: boolean;
  /** Paused by the team: still in the member's own feed, marked tentative. */
  paused?: boolean;
};

/** RFC 5545 TEXT: backslash, semicolon, comma and newlines escaped. */
export const icalText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 octets continue on the next line after a space (§3.1), never inside a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcal(name: string, evs: CalEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jurrgun//Events//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icalText(name)}`,
    "X-WR-TIMEZONE:Asia/Bangkok",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of evs) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@jurrgun`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(e.endsAt)}`,
      `SUMMARY:${icalText(e.title)}`,
      `LOCATION:${icalText([e.venueName, e.venueAddress].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${icalText(e.description)}`,
      `URL:${e.url}`,
      `STATUS:${e.cancelled ? "CANCELLED" : e.paused ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** A schema.org ItemList of Events, for sites that list events by reading pages (Time Out, Luma, partners). */
export function toJsonLd(name: string, evs: CalEvent[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: evs.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SocialEvent",
        "@id": e.url,
        name: e.title,
        description: e.description,
        startDate: e.startsAt.toISOString(),
        endDate: e.endsAt.toISOString(),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: e.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
        location: { "@type": "Place", name: e.venueName, address: e.venueAddress || undefined },
        url: e.url,
        isAccessibleForFree: (e.costThb ?? 0) === 0,
        ...(e.costThb ? { offers: { "@type": "Offer", price: e.costThb, priceCurrency: "THB", url: e.url } } : {}),
        organizer: { "@type": "Organization", name: "Jurrgun", url: new URL("/", e.url).toString() },
      },
    })),
  };
}
