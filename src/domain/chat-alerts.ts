/**
 * Chat alerts (owner decision F3, 2026-11-02). Pure rules: from one person's
 * recent one-to-one messages, is there a pattern a moderator should look at?
 *
 *  - money: money-flagged messages to 3 or more people;
 *  - same: one message, word for word, to 3 or more people.
 *
 * An alert only asks a moderator to look. Nothing happens to the account by
 * itself, and an alert is not a flag: only a moderator's upheld warning is.
 *
 * Guards against false alarms:
 *  - short messages and the app's own conversation starters never count as "same";
 *  - the same message to people who all came from one event is a thank-you,
 *    not a pattern, so it doesn't alert. Money still does, and the moderator
 *    sees that they all came from one event (usually a split bill).
 */

/** The reporter on an alert's row: nobody filed it, so nobody hears when it closes. */
export const ALERT_REPORTER = "system:chat-alert";
/** Its own reason, so it stays out of the rules a moderator can name and out of member report counts. */
export const ALERT_REASON = "chat_alert";
export const ALERT_WINDOW_DAYS = 7;
export const ALERT_MIN_PEOPLE = 3;
/** Shorter messages ("see you there!") are too ordinary to count as the same message. */
export const SAME_MIN_CHARS = 20;

export type AlertKind = "money" | "same";

export type AlertMessage = {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  moneyFlag: boolean;
  createdAt: Date;
  /** The event the two met at; null for a buddy pairing. */
  eventId: string | null;
};

export type AlertFinding = {
  kind: AlertKind;
  /** Different people these messages reached. */
  people: number;
  messages: number;
  /** The most of those people who came from one event. */
  oneEvent: number;
  matched: AlertMessage[];
};

/** Lower case, letters and digits only (Thai vowel and tone marks stay), so spacing and punctuation can't hide a copy. */
export const normalizeBody = (body: string) => body.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, "");

function finding(kind: AlertKind, matched: AlertMessage[]): AlertFinding {
  const people = new Set(matched.map((m) => m.recipient));
  const perEvent = new Map<string, Set<string>>();
  for (const m of matched) {
    if (!m.eventId) continue;
    perEvent.set(m.eventId, (perEvent.get(m.eventId) ?? new Set()).add(m.recipient));
  }
  const oneEvent = Math.max(0, ...[...perEvent.values()].map((s) => s.size));
  return { kind, people: people.size, messages: matched.length, oneEvent, matched };
}

function moneyFinding(rows: AlertMessage[]): AlertFinding | null {
  const f = finding("money", rows.filter((m) => m.moneyFlag));
  return f.people >= ALERT_MIN_PEOPLE ? f : null;
}

function sameFinding(rows: AlertMessage[], ignore: ReadonlySet<string>): AlertFinding | null {
  const groups = new Map<string, AlertMessage[]>();
  for (const m of rows) {
    const n = normalizeBody(m.body);
    if (n.length < SAME_MIN_CHARS || ignore.has(n)) continue;
    groups.set(n, [...(groups.get(n) ?? []), m]);
  }
  let best: AlertFinding | null = null;
  for (const g of groups.values()) {
    const f = finding("same", g);
    if (f.people < ALERT_MIN_PEOPLE || f.oneEvent === f.people) continue;
    if (!best || f.people > best.people) best = f;
  }
  return best;
}

/** One sender's messages: the pattern to alert on, money first. `only` reads back one kind for the moderator's reveal. */
export function findAlert(rows: AlertMessage[], ignore: ReadonlySet<string> = new Set(), only?: AlertKind): AlertFinding | null {
  if (only === "money") return moneyFinding(rows);
  if (only === "same") return sameFinding(rows, ignore);
  return moneyFinding(rows) ?? sameFinding(rows, ignore);
}

/** What an alert's row keeps: counts and the pattern, never message text. */
export type AlertDetails = { kind: AlertKind; people: number; messages: number; oneEvent: number; since: Date };

export function alertDetails(f: Pick<AlertFinding, "kind" | "people" | "messages" | "oneEvent">, since: Date): string {
  return `[Chat alert] kind=${f.kind} people=${f.people} messages=${f.messages} oneEvent=${f.oneEvent} since=${since.toISOString()}`;
}

export function parseAlertDetails(details: string): AlertDetails | null {
  const m = /^\[Chat alert\] kind=(money|same) people=(\d+) messages=(\d+) oneEvent=(\d+) since=(\S+)$/.exec(details);
  if (!m) return null;
  const since = new Date(m[5]);
  if (Number.isNaN(since.getTime())) return null;
  return { kind: m[1] as AlertKind, people: Number(m[2]), messages: Number(m[3]), oneEvent: Number(m[4]), since };
}

export const isChatAlert = (r: { reporter: string }) => r.reporter === ALERT_REPORTER;
