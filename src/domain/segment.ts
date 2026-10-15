/**
 * Which Jurrgun a member gets (design/reference/customer-profile.md), from
 * their own "Bangkok story" answer and the "new in town" flag. Never from
 * names, languages or looks. It only changes what we suggest first, never what
 * anyone may join.
 *
 *  - international: expats, digital nomads, people here for a while. Lead with
 *    English-friendly tables, language exchange and Thai friends.
 *  - newcomer: from another province, here to study, Thai back from abroad,
 *    or anyone who ticked "new in town". Lead with newcomer tables and the city.
 *  - local: born and raised here, not new. Lead with their own district, meeting
 *    again and hosting.
 */
import { cleanBio } from "../content/profile";

export type Segment = "local" | "newcomer" | "international";

const INTERNATIONAL = new Set(["expat", "nomad", "visiting"]);
const NEWCOMER = new Set(["province", "student", "returnee"]);

export function segmentOf(p: { newcomer: boolean; bio: unknown }): Segment {
  const story = cleanBio(p.bio).story;
  if (story && INTERNATIONAL.has(story)) return "international";
  if (p.newcomer || (story && NEWCOMER.has(story))) return "newcomer";
  return "local";
}

/** Event tags to suggest first for each segment. */
export const SEGMENT_TAGS: Record<Segment, string[]> = {
  international: ["english_friendly", "language_exchange", "newcomers", "city_quest"],
  newcomer: ["newcomers", "city_quest", "language_exchange", "daytime"],
  local: ["run", "board_game", "volunteer", "food"],
};

/** Bangkok story values behind each segment, for SQL that must agree with segmentOf. */
export const INTERNATIONAL_STORIES = [...INTERNATIONAL];
export const NEWCOMER_STORIES = [...NEWCOMER];
