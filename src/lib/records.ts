/**
 * Builders for rows written from many places: audit entries and in-app
 * notifications. They return un-awaited queries so callers can put them in
 * the same `batch` as the change they describe.
 */
import type { getDb } from "../db";
import { auditLog, notifications } from "../schema";
import { newId } from "./crypto";

type Db = ReturnType<typeof getDb>;

/**
 * Keys no staff role may ever read (PRD v3 §3.4, §13.0): relationship status,
 * romance mode and its settings, gender identity, orientation, dating intents.
 * BMA staff can read the audit log, so these never go into it, and the audit
 * page redacts them from older rows too.
 */
const SENSITIVE_KEY = /romance|relationship|gender|orientation|dating|open_?to|women_?only|pronoun/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "[private]" : redactSensitive(v)]));
}

export function audit(
  db: Db,
  actor: string,
  action: string,
  target?: { type: string; id: string },
  detail: Record<string, unknown> = {},
) {
  return db.insert(auditLog).values({
    id: newId(),
    actor,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    detail: redactSensitive(detail) as Record<string, unknown>,
  });
}

export function notify(db: Db, accountId: string, kind: string, th: string, en: string, link?: string) {
  return db.insert(notifications).values({
    id: newId(),
    accountId,
    kind,
    titleTh: th,
    titleEn: en,
    link: link ?? null,
  });
}
