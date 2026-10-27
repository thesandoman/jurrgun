/**
 * The empty-district alert on the Discover map's empty state (owner card 7):
 * "Suggest an event" stays the primary action; the opt-in is a secondary
 * POST button (no script), a calm line once on, and a short link to Settings
 * while notifications are off.
 */
import { describe, expect, it } from "vitest";
import { tr } from "../src/lib/i18n";
import { NoEventsYet } from "../src/ui/discover-map";
import { alertFitsView } from "../src/domain/district-alert";
import { CONSENT_CATEGORIES, NOTICE_CHANGES, NOTICE_ISO } from "../src/content/privacy";
import { readFileSync } from "node:fs";

const en = tr("en");
const th = tr("th");
const at = (state: "off" | "on" | "consent") => ({ state, district: "bang_rak", settingsHref: "/settings#push" });

describe("district alert in the empty state", () => {
  it("off: a POST form after the primary Suggest an event button", () => {
    const html = String(<NoEventsYet t={th} filtered={false} clearHref="/" alert={at("off")} />);
    expect(html).toContain('<form method="post" action="/events/district-alert"');
    expect(html).toContain("แจ้งฉันเมื่อมีกิจกรรมเปิดในเขตบางรัก");
    expect(html.indexOf('class="btn primary" href="/host/new"')).toBeGreaterThan(-1);
    expect(html.indexOf("/host/new")).toBeLessThan(html.indexOf("/events/district-alert"));
    expect(html).toContain('class="btn ghost"');
    expect(html).not.toContain("<script");
    expect(String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={at("off")} />)).toContain("Tell me when an event opens in Bang Rak");
  });

  it("on: a calm line instead of the button", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={at("on")} />);
    expect(html).toContain("We&#39;ll tell you when an event opens in Bang Rak, at most once a week.");
    expect(html).not.toContain("/events/district-alert");
  });

  it("no yes to notifications: a link to Settings, never a form that says yes", () => {
    const html = String(<NoEventsYet t={en} filtered={false} clearHref="/" alert={at("consent")} />);
    expect(html).toContain('href="/settings#push"');
    expect(html).not.toContain("<form");
  });

  it("no dashes", () => {
    for (const s of ["off", "on", "consent"] as const) {
      for (const filtered of [false, true]) {
        expect(String(<NoEventsYet t={th} filtered={filtered} clearHref="/" alert={at(s)} />)).not.toMatch(/[–—]/);
      }
    }
  });
});

describe("district alert in the filtered empty state", () => {
  const back = "/?district=bang_rak&view=map";
  const filteredAt = (state: "off" | "on" | "consent") => ({ ...at(state), back });

  it("filtered to your own district: offered, after Clear filters", () => {
    expect(alertFitsView({ ownDistrict: "bang_rak", filtered: true, filterDistrict: "bang_rak" })).toBe(true);
    const html = String(<NoEventsYet t={en} filtered clearHref="/" alert={filteredAt("off")} />);
    expect(html).toContain('<form method="post" action="/events/district-alert"');
    expect(html).toContain("Tell me when an event opens in Bang Rak");
    expect(html.indexOf("Clear filters")).toBeLessThan(html.indexOf("/events/district-alert"));
    // Back to the same filters once it's on.
    expect(html).toContain('name="back" value="/?district=bang_rak&amp;view=map"');
    expect(html).not.toContain("<script");
  });

  it("filtered to your own district, already on: the same calm line", () => {
    const html = String(<NoEventsYet t={en} filtered clearHref="/" alert={filteredAt("on")} />);
    expect(html).toContain("We&#39;ll tell you when an event opens in Bang Rak, at most once a week.");
    expect(html).not.toContain("<form");
  });

  it("filtered to another district, or filtered without a district: no offer, the alert can't cover it", () => {
    expect(alertFitsView({ ownDistrict: "bang_rak", filtered: true, filterDistrict: "pathum_wan" })).toBe(false);
    expect(alertFitsView({ ownDistrict: "bang_rak", filtered: true, filterDistrict: "" })).toBe(false);
    expect(alertFitsView({ ownDistrict: "", filtered: true, filterDistrict: "" })).toBe(false);
    expect(alertFitsView({ ownDistrict: "bang_rak", filtered: false, filterDistrict: "" })).toBe(true);
    // The route then passes no alert: Clear filters alone.
    const html = String(<NoEventsYet t={en} filtered clearHref="/" alert={null} />);
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("district-alert");
  });

  it("filtered, no yes to notifications: the link to Settings, never a form that says yes", () => {
    const html = String(<NoEventsYet t={en} filtered clearHref="/" alert={filteredAt("consent")} />);
    expect(html).toContain('href="/settings#push"');
    expect(html).toContain("Turn on notifications in Settings to hear about events in Bang Rak");
    expect(html).not.toContain("<form");
  });
});

describe("the privacy notice names the alert (owner-approved legal edit)", () => {
  it("the notifications line adds the weekly district note, in both languages, with no dashes", () => {
    const hint = CONSENT_CATEGORIES.find((c) => c.key === "notifications")!.hint;
    expect(hint.en).toBe("Reminders before events and when a spot opens, and, if you turn it on, a weekly note when something opens in your district.");
    expect(hint.th).toBe("เตือนก่อนกิจกรรมและเมื่อมีที่ว่าง และหากคุณเปิดไว้ จะมีข้อความสัปดาห์ละครั้งเมื่อมีกิจกรรมเปิดในเขตของคุณ");
    expect(`${hint.th} ${hint.en}`).not.toMatch(/[–—]/);
  });
});

describe("today's notice tells members about the alert (owner, 2026-10-26)", () => {
  it("the 26 October notice listed the weekly district note; the 27 October one lists only what changed since", () => {
    // The weekly note was in the 26 October "What changed" card; card P1 (27 October) moved the date on.
    expect(NOTICE_ISO).toBe("2026-10-27");
    expect(NOTICE_CHANGES.some((c) => c.en.includes("weekly note"))).toBe(false);
  });
  it("the onboarding consent summary matches the notice", () => {
    const src = readFileSync("src/routes/onboarding.tsx", "utf8");
    expect(src).toContain("Reminders: before events and when a spot opens, and, if you turn it on, a weekly note when something opens in your district.");
    expect(src).toContain("และหากคุณเปิดไว้ จะมีข้อความสัปดาห์ละครั้งเมื่อมีกิจกรรมเปิดในเขตของคุณ");
  });
});
