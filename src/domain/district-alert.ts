/**
 * The empty-district alert (owner card 7, approved after the design panel).
 * One opt-in, "แจ้งฉันเมื่อมีกิจกรรมเปิดในเขต{district} / Tell me when an
 * event opens in {district}", using the member's own district. The hourly
 * clock (src/services/clock.ts runDistrictAlerts) sends at most one alert a
 * week, only while the notifications consent is yes, and one tap in the alert
 * turns it off. No badge, no streak, no counts.
 *
 * Wording (D5): the alert matches every published, upcoming event the member
 * may see in their district, not only Tables, so it says กิจกรรม / event, not
 * โต๊ะ / table.
 *
 * Pure module: no database.
 */
import { DISTRICTS, label, values } from "../lib/constants";
import type { Lang } from "../lib/i18n";

/** The notification kind. It waits for the evening summary (src/domain/digest.ts). */
export const KIND_DISTRICT_ALERT = "district_alert";
/** At most one alert in this many days. */
export const DISTRICT_ALERT_DAYS = 7;
/** The audit action written when a member opts in: the job reads its time as "opted in at". */
export const DISTRICT_ALERT_ON = "district_alert.on";

const DAY = 86_400_000;

/** The district's display name, or null when it isn't one of Bangkok's 50 districts. */
export function districtName(district: string, lang: Lang): string | null {
  return values(DISTRICTS).includes(district) ? label(DISTRICTS, district, lang) : null;
}

type T = (th: string, en: string) => string;

/** The opt-in: "แจ้งฉันเมื่อมีกิจกรรมเปิดในเขตบางรัก / Tell me when an event opens in Bang Rak". */
export function optInText(district: string, t: T): string {
  return t(`แจ้งฉันเมื่อมีกิจกรรมเปิดในเขต${districtName(district, "th")}`, `Tell me when an event opens in ${districtName(district, "en")}`);
}

/** The calm line shown instead of the opt-in once it is on. */
export function optedInText(district: string, t: T): string {
  return t(
    `เราจะแจ้งคุณเมื่อมีกิจกรรมเปิดในเขต${districtName(district, "th")} สัปดาห์ละไม่เกินครั้งเดียว`,
    `We'll tell you when an event opens in ${districtName(district, "en")}, at most once a week.`,
  );
}

/** Shown instead of the opt-in while notifications are off: a way to Settings, never a silent yes. */
export function needsConsentText(district: string, t: T): string {
  return t(`เปิดการแจ้งเตือนในการตั้งค่า เพื่อรู้เมื่อมีกิจกรรมในเขต${districtName(district, "th")}`, `Turn on notifications in Settings to hear about events in ${districtName(district, "en")}`);
}

/** The alert in the bell. It names the district, never an event. */
export function alertText(district: string, lang: Lang): string {
  const name = districtName(district, lang);
  return lang === "en" ? `Something new opened in ${name}` : `มีกิจกรรมใหม่เปิดในเขต${name}`;
}

/**
 * Where the alert leads: Discover, filtered to the district. The Bangkok date
 * makes each week's alert its own row (the clock's notification id is made
 * from the kind, member and link), while two runs on the same day share one.
 */
export function alertLink(district: string, bangkokDate: string): string {
  return `/events?district=${encodeURIComponent(district)}&alert=${bangkokDate}`;
}

/** The one-tap off in the alert. */
export const ALERT_OFF = { th: "ปิดการแจ้งเตือนนี้", en: "Turn this alert off" } as const;

/** Whether the weekly limit allows another alert. */
export function alertDue(lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= DISTRICT_ALERT_DAYS * DAY;
}

/**
 * Only events that went public after this count: the last alert, or the
 * opt-in when that is later (or there was no alert yet). Null when neither
 * is known, and then nothing matches.
 */
export function alertCutoff(lastSentAt: Date | null, optedInAt: Date | null): Date | null {
  if (!lastSentAt) return optedInAt;
  if (!optedInAt) return lastSentAt;
  return lastSentAt.getTime() > optedInAt.getTime() ? lastSentAt : optedInAt;
}

/**
 * When an event went public. social_events has no published_at, and the
 * "event.publish" audit row is written only by the admin Publish button, so
 * neither alone is reliable. This takes the latest of created_at (events
 * created already published: admin, partner API, trusted hosts) and the
 * audit rows that publish an existing event: "event.publish" (a draft
 * published by staff), "event.review_approve" (a member's proposal
 * approved) and "event.update" whose status went to published from
 * anything else.
 */
export const PUBLISH_ACTIONS = ["event.publish", "event.review_approve", "event.update"] as const;

export function publishedAt(createdAt: Date, audits: { action: string; detail: Record<string, unknown>; createdAt: Date }[]): Date {
  let at = createdAt.getTime();
  for (const a of audits) {
    if (a.action === "event.update") {
      const s = a.detail.status;
      if (!Array.isArray(s) || s[1] !== "published" || s[0] === "published") continue;
    } else if (!(PUBLISH_ACTIONS as readonly string[]).includes(a.action)) continue;
    at = Math.max(at, a.createdAt.getTime());
  }
  return new Date(at);
}
