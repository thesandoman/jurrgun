import { afterEach, describe, expect, it } from "vitest";
import { checkOutsideUrl, outsideGet, robotsAllows, setOutsideFetch } from "../src/services/outside-fetch";
import { dedupeKey, plain, readEventPage, readIcal } from "../src/domain/outside-events";
import { sourceForHost, sourceName } from "../src/content/sources";

afterEach(() => setOutsideFetch(null));

describe("checkOutsideUrl: only public https pages", () => {
  it.each([
    "http://example.com/e",
    "https://localhost/e",
    "https://127.0.0.1/e",
    "https://10.0.0.5/",
    "https://0x7f000001/",
    "https://2130706433/",
    "https://[::1]/",
    "https://intranet/",
    "https://db.internal/x",
    "https://printer.local/",
    "https://jurrgun.apps.sv-academy.org/admin",
    "https://user:pw@example.com/",
    "https://example.com:8443/",
    "ftp://example.com/",
    "javascript:alert(1)",
    "",
  ])("refuses %s", (u) => expect(checkOutsideUrl(u)).toBeNull());

  it("keeps a normal page, without the fragment", () => {
    expect(checkOutsideUrl(" https://www.ticketmelon.com/event/x?y=1#top ")?.toString()).toBe("https://www.ticketmelon.com/event/x?y=1");
  });
});

describe("sources", () => {
  it("knows the big platforms and never reads their pages", () => {
    expect(sourceForHost("www.ticketmelon.com")).toMatchObject({ name: "Ticketmelon", read: "link" });
    expect(sourceForHost("lu.ma")?.read).toBe("link");
    expect(sourceForHost("m.facebook.com")?.name).toBe("Facebook");
    expect(sourceName("www.some-gallery.co.th")).toBe("some-gallery.co.th");
  });
});

describe("robots.txt", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/events\n\nUser-agent: BadBot\nDisallow: /\n";
  it("follows the longest rule", () => {
    expect(robotsAllows(robots, "/events/1")).toBe(true);
    expect(robotsAllows(robots, "/private/x")).toBe(false);
    expect(robotsAllows(robots, "/private/events/1")).toBe(true);
  });
  it("a group for JurrgunBot wins over *", () => {
    expect(robotsAllows("User-agent: *\nAllow: /\nUser-agent: JurrgunBot\nDisallow: /\n", "/e")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /\n", "/e")).toBe(false);
    expect(robotsAllows("", "/e")).toBe(true);
  });
});

describe("readEventPage", () => {
  const ld = (o: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;
  it("reads a schema.org Event, inside @graph too", () => {
    const html = ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "x" },
        {
          "@type": "MusicEvent",
          name: "Jazz &amp; Noodles",
          description: "<p>Live jazz — by the river</p>",
          startDate: "2026-11-07T19:30:00+07:00",
          endDate: "2026-11-07T22:00:00+07:00",
          location: { "@type": "Place", name: "Riverside Hall", address: { streetAddress: "1 Charoen Krung", addressLocality: "Bangkok" } },
          organizer: { name: "Soi Social Club" },
          offers: { url: "/tickets/jazz" },
        },
      ],
    });
    const ev = readEventPage(html, "https://example.com/e/jazz");
    expect(ev).toMatchObject({
      title: "Jazz & Noodles",
      description: "Live jazz , by the river",
      venueName: "Riverside Hall",
      venueAddress: "1 Charoen Krung, Bangkok",
      organizer: "Soi Social Club",
      url: "https://example.com/tickets/jazz",
      online: false,
    });
    expect(ev?.startsAt?.toISOString()).toBe("2026-11-07T12:30:00.000Z");
  });

  it("marks online-only events", () => {
    const ev = readEventPage(ld({ "@type": "Event", name: "Webinar", startDate: "2026-11-01", eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode" }), "https://e.com/w");
    expect(ev?.online).toBe(true);
  });

  it("falls back to Open Graph, and skips broken JSON", () => {
    const html = `<script type="application/ld+json">{oops</script><meta property="og:title" content="Night Market Walk"><meta property="og:description" content="Meet &quot;by the gate&quot;"><meta property="og:url" content="https://e.com/nm">`;
    expect(readEventPage(html, "https://e.com/x")).toMatchObject({ title: "Night Market Walk", description: 'Meet "by the gate"', url: "https://e.com/nm", startsAt: null });
  });

  it("nothing to read is null", () => expect(readEventPage("<p>hi</p>", "https://e.com")).toBeNull());
  it("cuts long text at a word", () => expect(plain("word ".repeat(300), 50).length).toBeLessThanOrEqual(51));
});

describe("readIcal", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const feed = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:abc@luma",
    "SUMMARY:Board games at Lumph",
    " ini Park",
    "DTSTART;TZID=Asia/Bangkok:20261025T180000",
    "DTEND;TZID=Asia/Bangkok:20261025T200000",
    "LOCATION:Lumphini Park\\, Gate 1, Rama IV",
    "URL:https://lu.ma/abc",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:old",
    "SUMMARY:Past",
    "DTSTART:20261001T100000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:gone",
    "SUMMARY:Called off",
    "STATUS:CANCELLED",
    "DTSTART:20261101T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads upcoming events, unfolded, in Bangkok time", () => {
    const evs = readIcal(feed, now);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ title: "Board games at Lumphini Park", venueName: "Lumphini Park", venueAddress: "Gate 1, Rama IV", url: "https://lu.ma/abc", uid: "abc@luma" });
    expect(evs[0].startsAt?.toISOString()).toBe("2026-10-25T11:00:00.000Z");
    expect(dedupeKey(evs[0], "f1")).toBe("uid:f1:abc@luma");
  });

  it("dedupe keys ignore tracking", () => {
    expect(dedupeKey({ url: "https://e.com/a/?utm_source=x&id=2#t" })).toBe("url:https://e.com/a/?id=2");
  });
});

describe("outsideGet", () => {
  it("re-checks every redirect and refuses internal targets", async () => {
    setOutsideFetch(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/admin" } }));
    expect(await outsideGet("https://example.com/e", { maxBytes: 1000, accept: "text/html", textTypes: /html/ })).toEqual({ ok: false, error: "blocked_host" });
  });

  it("stops reading past the size limit", async () => {
    setOutsideFetch(async () => new Response("x".repeat(5000), { headers: { "content-type": "text/html" } }));
    expect(await outsideGet("https://example.com/e", { maxBytes: 1000, accept: "text/html", textTypes: /html/ })).toEqual({ ok: false, error: "too_large" });
  });

  it("refuses non-text", async () => {
    setOutsideFetch(async () => new Response("x", { headers: { "content-type": "image/png" } }));
    expect(await outsideGet("https://example.com/e", { maxBytes: 1000, accept: "text/html", textTypes: /html/ })).toEqual({ ok: false, error: "not_text" });
  });

  it("follows a good redirect and names itself", async () => {
    const seen: Request[] = [];
    setOutsideFetch(async (req) => {
      seen.push(req);
      return seen.length === 1 ? new Response(null, { status: 301, headers: { location: "/final" } }) : new Response("<html>ok</html>", { headers: { "content-type": "text/html" } });
    });
    const res = await outsideGet("https://example.com/e", { maxBytes: 1000, accept: "text/html", textTypes: /html/ });
    expect(res).toMatchObject({ ok: true, url: "https://example.com/final", text: "<html>ok</html>" });
    expect(seen[0].headers.get("user-agent")).toMatch(/^JurrgunBot/);
    expect(seen[0].headers.get("cookie")).toBeNull();
  });
});
