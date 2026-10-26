/**
 * The empty-district alert on the Discover map's empty state (owner card 7):
 * "Suggest an event" stays the primary action; the opt-in is a secondary
 * POST button (no script), a calm line once on, and a short link to Settings
 * while notifications are off.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { NoEventsYet } from "../src/ui/discover-map";

const en = tr("en");
const th = tr("th");
const at = (state: "off" | "on" | "consent") => ({ state, district: "bang_rak", settingsHref: "/settings#push" });

describe("district alert in the empty state", () => {
  it("off: a POST form after the primary Suggest an event button", () => {
    const html = String(<NoEventsYet t={th} filtered={false} clearHref="/events" alert={at("off")} />);
    expect(html).toContain('<form method="post" action="/events/district-alert"');
    expect(html).toContain("แจ้งฉันเมื่อมีกิจกรรมเปิดในเขตบางรัก");
    expect(html.indexOf('class="btn primary" href="/host/new"')).toBeGreaterThan(-1);
    expect(html.indexOf("/host/new")).toBeLessThan(html.indexOf("/events/district-alert"));
    expect(html).toContain('class="btn ghost"');
    expect(html).not.toContain("<script");
    expect(String(<NoEventsYet t={en} filtered={false} clearHref="/events" alert={at("off")} />)).toContain("Tell me when an event opens in Bang Rak");
  });

  it("on: a calm line instead of the button", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/events" alert={at("on")} />);
    expect(html).toContain("We&#39;ll tell you when an event opens in Bang Rak, at most once a week.");
    expect(html).not.toContain("/events/district-alert");
  });

  it("no yes to notifications: a link to Settings, never a form that says yes", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/events" alert={at("consent")} />);
    expect(html).toContain('href="/settings#push"');
    expect(html).not.toContain("<form");
  });

  it("not on a filtered empty state, and no dashes", () => {
    expect(String(<NoEventsYet t={en} filtered clearHref="/events" alert={at("off")} />)).not.toContain("district-alert");
    for (const s of ["off", "on", "consent"] as const) {
      expect(String(<NoEventsYet t={th} filtered={false} clearHref="/events" alert={at(s)} />)).not.toMatch(/[–—]/);
    }
  });
});
