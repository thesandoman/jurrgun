/**
 * Builders for rows written from many places: audit entries and in-app
 * notifications. They return un-awaited queries so callers can put them in
 * the same `batch` as the change they describe.
 */
import type { getDb } from "../db";
import { auditLog, notifications } from "../schema";
import { newId } from "./crypto";

type Db = ReturnType<typeof getDb>;

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
    detail,
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
