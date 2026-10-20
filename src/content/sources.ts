/**
 * Where outside events come from (D46, D49), and how Jurrgun may read each.
 *
 *   page   a pasted link may be read once, at the host's request, for the
 *          page's own event description (schema.org Event, Open Graph as a
 *          fallback), after the site's robots.txt allows it
 *   link   the link is kept and credited, but the page is never read: the
 *          host types the details. Used where the site's terms bar access
 *          other than its own supported interfaces, or where we could not
 *          confirm the terms allow it (checked 2026-10-20, see
 *          design/reference/outside-event-sources.md)
 *
 * Calendar feeds (iCal) are a separate, published way in: an admin adds one
 * only after checking that source's terms, and says how in the feed's
 * terms note. Sites not listed here are read as "page", robots.txt first.
 */
export type SourceRead = "page" | "link";
export type Source = { hosts: string[]; name: string; read: SourceRead };

export const SOURCES: Source[] = [
  // Community platforms: Luma's terms allow only its publicly supported interfaces (its iCal feeds are one).
  { hosts: ["luma.com", "lu.ma"], name: "Luma", read: "link" },
  { hosts: ["meetup.com"], name: "Meetup", read: "link" },
  { hosts: ["eventbrite.com", "eventbrite.co.th", "eventbrite.co.uk"], name: "Eventbrite", read: "link" },
  // Thai ticketing.
  { hosts: ["ticketmelon.com"], name: "Ticketmelon", read: "link" },
  { hosts: ["megatix.co.th", "megatix.com", "megatix.in.th"], name: "Megatix", read: "link" },
  { hosts: ["eventpop.me"], name: "Eventpop", read: "link" },
  { hosts: ["thaiticketmajor.com"], name: "ThaiTicketMajor", read: "link" },
  // Social posts: pasted link only (D49), never read.
  { hosts: ["facebook.com", "fb.me", "fb.com"], name: "Facebook", read: "link" },
  { hosts: ["instagram.com"], name: "Instagram", read: "link" },
  // Music and nightlife: only where terms allow, so links only until a partner agrees.
  { hosts: ["ra.co", "residentadvisor.net"], name: "Resident Advisor", read: "link" },
  { hosts: ["dice.fm"], name: "Dice", read: "link" },
  { hosts: ["songkick.com"], name: "Songkick", read: "link" },
  { hosts: ["bandsintown.com"], name: "Bandsintown", read: "link" },
  // City guides: by agreement and with credit, never copied wholesale.
  { hosts: ["timeout.com"], name: "Time Out Bangkok", read: "link" },
  { hosts: ["bk.asia-city.com", "bkmagazine.com"], name: "BK Magazine", read: "link" },
  { hosts: ["bangkokpost.com"], name: "Bangkok Post", read: "link" },
  { hosts: ["internations.org"], name: "InterNations", read: "link" },
  // City and culture: public bodies publishing their own events.
  { hosts: ["bangkok.go.th"], name: "BMA", read: "page" },
  { hosts: ["visitbangkok.go.th", "visitbangkok.com"], name: "VisitBangkok", read: "page" },
  { hosts: ["tcdc.or.th"], name: "TCDC", read: "page" },
  { hosts: ["bangkokdesignweek.com"], name: "Bangkok Design Week", read: "page" },
  { hosts: ["bacc.or.th"], name: "BACC", read: "page" },
];

/** The listed source for a hostname (subdomains included), or null. */
export function sourceForHost(hostname: string): Source | null {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return SOURCES.find((s) => s.hosts.some((x) => h === x || h.endsWith(`.${x}`))) ?? null;
}

/** A readable name for any host: the listed one, or the site's own domain. */
export function sourceName(hostname: string): string {
  return sourceForHost(hostname)?.name ?? hostname.toLowerCase().replace(/^www\./, "");
}
