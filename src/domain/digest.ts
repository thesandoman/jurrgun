/**
 * The evening summary (owner, 2026-10-17: "less autopilot"). Non-urgent
 * notifications still land in the bell straight away, but a phone hears about
 * them once a day, at 18:00 Bangkok, in one push: "วันนี้: ขอบคุณ 3 ·
 * เพื่อนใหม่ 1 / Today: 3 thank-yous · 1 new friend". The clock sends it
 * (src/services/clock.ts runDigest).
 *
 * Urgent kinds are never summarised: day-of status and event changes
 * (event_notice, event_changed, event_cancelled), waitlist offers and RSVP
 * results, reminders and the People I Met window (event_tomorrow,
 * event_today, people_window), running late (eta_late), safety and
 * moderation (report, strike, strike_waived, moderation), buddy proposals
 * and wrap-ups, and a Pinky unlock. A Pinky unlock is stored as a
 * "connection" with a /people/... link (neutral words on a lock screen), so
 * only a connection that links to /connections counts as non-urgent.
 *
 * Pure module: no database.
 */
import type { Lang } from "../lib/i18n";

/** The marker row the clock writes when it sends a member's summary. Kept out of the bell. */
export const KIND_DIGEST = "digest";
/** The summary goes at the first hourly run from 18:00 Bangkok (quiet hours start at 21:00). */
export const DIGEST_HOUR = 18;

type Group = "thanks" | "friend" | "connection" | "plan" | "other";

/** Every non-urgent kind, and the line of the summary it adds to. */
export const DIGEST_KINDS: Record<string, Group> = {
  thanks: "thanks", // a thank-you note
  graduated: "friend", // met three times: a friendship
  connection: "connection", // a mutual choice after a table (only with link /connections)
  pitch: "plan", // a plan idea from someone you know, or someone joining yours
  contact_shared: "other", // someone shared a contact with you
  invite_accepted: "other", // someone you invited signed up
  table_join: "other", // someone joined your Regular Table (hosts)
  still_in_touch: "other", // "Still in touch?" a while after a friendship
  buddy_quest: "other", // your buddy marked the quest done
  buddy_stamp: "other", // a new district stamp
  buddy_keep: "other", // your buddy took back a wrap-up
  event_update: "other", // a host's plain update (time, venue and cancel changes stay urgent)
};

/** Whether a notification waits for the evening summary instead of counting as urgent. */
export function isDigest(kind: string, link: string | null): boolean {
  if (!(kind in DIGEST_KINDS)) return false;
  return kind !== "connection" || link === "/connections";
}

const ORDER: Group[] = ["thanks", "friend", "connection", "plan", "other"];
const WORDS: Record<Group, { th: string; en: [string, string] }> = {
  thanks: { th: "ขอบคุณ", en: ["thank-you", "thank-yous"] },
  friend: { th: "เพื่อนใหม่", en: ["new friend", "new friends"] },
  connection: { th: "คนรู้จักใหม่", en: ["new connection", "new connections"] },
  plan: { th: "ไอเดียแผน", en: ["plan idea", "plan ideas"] },
  other: { th: "อัปเดตอื่น", en: ["other update", "other updates"] },
};

/** "วันนี้: ขอบคุณ 3 · เพื่อนใหม่ 1" / "Today: 3 thank-yous · 1 new friend" from the kinds being summarised. */
export function digestText(kinds: string[], lang: Lang): string {
  const n = new Map<Group, number>();
  for (const k of kinds) {
    const g = DIGEST_KINDS[k];
    if (g) n.set(g, (n.get(g) ?? 0) + 1);
  }
  const parts = ORDER.filter((g) => n.get(g)).map((g) => {
    const c = n.get(g)!;
    return lang === "en" ? `${c} ${WORDS[g].en[c === 1 ? 0 : 1]}` : `${WORDS[g].th} ${c}`;
  });
  return `${lang === "en" ? "Today" : "วันนี้"}: ${parts.join(" · ")}`;
}
