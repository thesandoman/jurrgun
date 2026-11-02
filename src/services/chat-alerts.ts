/**
 * Chat alerts with the database (rules in src/domain/chat-alerts.ts). An hourly
 * pass over the last 7 days of one-to-one messages. A match opens a standard
 * report for a moderator, at most one open per person. After a moderator closes
 * one, only messages sent later can raise another.
 *
 * Never read here: group chats, and any pair with a Pinky or a romance
 * connection (staff never see Pinky). The row keeps counts, not message text;
 * a moderator opens the text through a recorded step (alertMessages).
 */
import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { batch, getDb } from "../db";
import { PROMPT_BANK } from "../content/profile";
import { ALERT_REASON, ALERT_REPORTER, ALERT_WINDOW_DAYS, alertDetails, findAlert, normalizeBody, parseAlertDetails, type AlertFinding, type AlertMessage } from "../domain/chat-alerts";
import { newId } from "../lib/crypto";
import type { Bindings } from "../lib/env";
import { audit } from "../lib/records";
import { accounts, buddyMatches, chatMessages, connections, pinkies, reports } from "../schema";

type Db = ReturnType<typeof getDb>;

const DAY = 86_400_000;
const MAX_ROWS = 5000;
/** Alerts opened in one pass; the rest wait for the next hour. */
const MAX_NEW = 20;

/** The app's own conversation starters: everyone is offered them, so copies mean nothing. */
const STARTERS: ReadonlySet<string> = new Set(PROMPT_BANK.filter((p) => p.kind === "text").flatMap((p) => [normalizeBody(p.th), normalizeBody(p.en)]));

/** The pair (a < b on every table here) has no Pinky and no romance connection, now or still on record. */
const notRomance = (a: AnyPgColumn, b: AnyPgColumn): SQL => sql`not exists (select 1 from ${pinkies} where ${pinkies.aAccount} = ${a} and ${pinkies.bAccount} = ${b})
  and not exists (select 1 from social_connections rc where rc.a_account = ${a} and rc.b_account = ${b} and rc.level = 'romance')`;

/** One-to-one text messages in the window, with who received each. */
async function oneToOne(db: Db, since: Date, until: Date, sender?: string): Promise<AlertMessage[]> {
  const base = and(
    gte(chatMessages.createdAt, since),
    lte(chatMessages.createdAt, until),
    eq(chatMessages.kind, "text"),
    isNull(chatMessages.hiddenAt),
    sender ? eq(chatMessages.sender, sender) : undefined,
  );
  const fields = { id: chatMessages.id, sender: chatMessages.sender, body: chatMessages.body, moneyFlag: chatMessages.moneyFlag, createdAt: chatMessages.createdAt };
  const [viaConn, viaBuddy] = await Promise.all([
    db
      .select({ ...fields, a: connections.aAccount, b: connections.bAccount, eventId: connections.eventId })
      .from(chatMessages)
      .innerJoin(connections, sql`${chatMessages.thread} = 'conn:' || ${connections.id}`)
      .where(and(base, notRomance(connections.aAccount, connections.bAccount)))
      .limit(MAX_ROWS),
    db
      .select({ ...fields, a: buddyMatches.aAccount, b: buddyMatches.bAccount })
      .from(chatMessages)
      .innerJoin(buddyMatches, sql`${chatMessages.thread} = 'buddy:' || ${buddyMatches.id}`)
      .where(and(base, notRomance(buddyMatches.aAccount, buddyMatches.bAccount)))
      .limit(MAX_ROWS),
  ]);
  const rows: AlertMessage[] = [];
  for (const m of viaConn) rows.push({ id: m.id, sender: m.sender, body: m.body, moneyFlag: m.moneyFlag, createdAt: m.createdAt, recipient: m.sender === m.a ? m.b : m.a, eventId: m.eventId.startsWith("buddy:") ? null : m.eventId });
  for (const m of viaBuddy) rows.push({ id: m.id, sender: m.sender, body: m.body, moneyFlag: m.moneyFlag, createdAt: m.createdAt, recipient: m.sender === m.a ? m.b : m.a, eventId: null });
  return rows;
}

/** Look for new patterns and open an alert for each. Returns how many opened. */
export async function runChatAlerts(env: Bindings, now: Date = new Date()): Promise<number> {
  const db = getDb(env);
  const since = new Date(now.getTime() - ALERT_WINDOW_DAYS * DAY);
  const earlier = await db
    .select({ target: reports.targetAccount, status: reports.status, resolvedAt: reports.resolvedAt })
    .from(reports)
    .where(and(eq(reports.reporter, ALERT_REPORTER), or(inArray(reports.status, ["open", "in_review"]), gte(reports.resolvedAt, since))))
    .limit(2000);
  const open = new Set<string>();
  const closedAt = new Map<string, number>();
  for (const r of earlier) {
    if (!r.target) continue;
    if (r.status === "open" || r.status === "in_review") open.add(r.target);
    else if (r.resolvedAt) closedAt.set(r.target, Math.max(closedAt.get(r.target) ?? 0, r.resolvedAt.getTime()));
  }

  const bySender = new Map<string, AlertMessage[]>();
  for (const m of await oneToOne(db, since, now)) {
    if (open.has(m.sender) || m.createdAt.getTime() <= (closedAt.get(m.sender) ?? 0)) continue;
    bySender.set(m.sender, [...(bySender.get(m.sender) ?? []), m]);
  }
  const found: [string, AlertFinding][] = [];
  for (const [sender, rows] of bySender) {
    const f = findAlert(rows, STARTERS);
    if (f) found.push([sender, f]);
  }
  if (!found.length) return 0;

  // Only active, real accounts: anyone suspended, banned or gone is already out of the chat.
  const active = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(inArray(accounts.id, found.map(([s]) => s)), eq(accounts.status, "active"), eq(accounts.isDemo, false)))
    .limit(found.length);
  const live = new Set(active.map((a) => a.id));
  const fresh = found.filter(([s]) => live.has(s)).slice(0, MAX_NEW);
  if (!fresh.length) return 0;

  const writes = fresh.flatMap(([sender, f]) => {
    const id = newId();
    return [
      db.insert(reports).values({ id, reporter: ALERT_REPORTER, targetAccount: sender, reason: ALERT_REASON, details: alertDetails(f, since), severity: "standard" }),
      audit(db, "system", "chat_alert.opened", { type: "report", id }, { kind: f.kind, people: f.people, messages: f.messages }),
    ];
  });
  await batch(env, writes as never);
  return fresh.length;
}

export type RevealedMessage = { body: string; createdAt: Date; person: string };

/**
 * The messages behind an alert, for its reveal step. People are A, B, C: the
 * moderator decides from the pattern, and doesn't need to know who received it.
 */
export async function alertMessages(db: Db, r: { details: string; targetAccount: string | null; createdAt: Date }): Promise<RevealedMessage[]> {
  const d = parseAlertDetails(r.details);
  if (!d || !r.targetAccount) return [];
  const rows = await oneToOne(db, d.since, r.createdAt, r.targetAccount);
  const f = findAlert(rows, STARTERS, d.kind);
  if (!f) return [];
  const letters = new Map<string, string>();
  return [...f.matched]
    .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
    .slice(0, 30)
    .map((m) => {
      if (!letters.has(m.recipient)) letters.set(m.recipient, String.fromCharCode(65 + letters.size));
      return { body: m.body, createdAt: m.createdAt, person: letters.get(m.recipient)! };
    });
}
