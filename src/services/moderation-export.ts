/**
 * The "moderation actions about me" part of the data export (PDPA access).
 * Field list agreed with Trust & Operations, 2026-10-27, under Main's rule:
 * only what the member was already told in their notice.
 *
 * In:  warnings (and the 3-flag automatic suspension), suspensions, bans,
 *      lifts; the named rule in member wording; dates; flags still counting;
 *      "ask us to look again" requests with the member's own words and the
 *      outcome.
 * Out: "note" actions (never told to the member), the moderator's free text
 *      after the [rule] prefix (can name other people), who acted, report ids
 *      and report details about anyone else.
 *
 * Pure: the route reads the rows and passes them in.
 */
import { FLAG_WINDOW_DAYS } from "../domain/rules";
import { isLookAgain, LOOK_AGAIN_PREFIX, ruleName, ruleOf } from "./outcomes";

export type ActionRow = { action: string; until: Date | null; note: string; reportId: string | null; createdAt: Date };
export type OwnReportRow = { id: string; reporter: string; targetAccount: string | null; details: string; status: string; resolvedAt: Date | null; createdAt: Date };

type Rule = { key: string | null; th: string; en: string };

export type ModerationHistory = {
  actions: { action: "warning" | "suspend" | "ban" | "lift"; rule: Rule | null; suspendedUntil: Date | null; because3Flags: boolean; at: Date }[];
  flagsOnRecordNow: number;
  flags: { warnedAt: Date; countsUntil: Date }[];
  lookAgainRequests: { askedAt: Date; yourWords: string | null; outcome: "open" | "lifted" | "ban stands"; decidedAt: Date | null }[];
};

const TOLD = new Set(["warning", "suspend", "ban", "lift"]);
const DAY = 86_400_000;

function rule(note: string, auto: boolean): Rule | null {
  const key = ruleOf(note);
  if (!key && !auto) return null;
  const [th, en] = ruleName(key);
  return { key, th, en };
}

export function moderationHistory(accountId: string, actions: ActionRow[], ownReports: OwnReportRow[], now = new Date()): ModerationHistory {
  const told = actions.filter((a) => TOLD.has(a.action)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: ModerationHistory["actions"] = told.map((a) => {
    // The automatic suspension at 3 flags is stored as a warning with `until` and no rule.
    const auto = a.action === "warning" && !!a.until && !ruleOf(a.note);
    return {
      action: a.action as ModerationHistory["actions"][number]["action"],
      rule: a.action === "lift" ? null : rule(a.note, auto),
      suspendedUntil: a.action === "suspend" || auto ? a.until : null,
      because3Flags: auto,
      at: a.createdAt,
    };
  });
  const windowStart = now.getTime() - FLAG_WINDOW_DAYS * DAY;
  const flags = told
    .filter((a) => a.action === "warning" && a.createdAt.getTime() > windowStart)
    .map((a) => ({ warnedAt: a.createdAt, countsUntil: new Date(a.createdAt.getTime() + FLAG_WINDOW_DAYS * DAY) }));
  const lookAgainRequests = ownReports
    .filter((r) => r.reporter === accountId && isLookAgain(r))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => {
      const lift = told.find((a) => a.action === "lift" && a.reportId === r.id);
      const words = r.details.startsWith(`${LOOK_AGAIN_PREFIX}: `) ? r.details.slice(LOOK_AGAIN_PREFIX.length + 2) : null;
      const outcome: "open" | "lifted" | "ban stands" = lift ? "lifted" : r.status === "open" ? "open" : "ban stands";
      return { askedAt: r.createdAt, yourWords: words, outcome, decidedAt: lift ? lift.createdAt : outcome === "open" ? null : r.resolvedAt };
    });
  return { actions: out, flagsOnRecordNow: flags.length, flags, lookAgainRequests };
}
