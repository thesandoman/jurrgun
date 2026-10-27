/**
 * One-time clean of photos stored before uploads were stripped (owner
 * decision, 2026-10-26, "Strip all + clean old"; the owner said yes to
 * editing member files in place).
 *
 * Every profile photo (main and prompt photos), chat photo and event cover is
 * read, checked and stripped of its metadata with domain/photos.ts, then
 * written back under the same key. Files with no metadata are left alone.
 * Left exactly as they are:
 *
 * - reported-evidence copies (evidence/..., not in any of these tables);
 * - chat photos under an open report (open or in review).
 *
 * The clock runs a batch each hour until everything is done; a bma_admin can
 * also run a batch from the dashboard. Progress and the final counts are kept
 * in the audit log ("photos.clean_batch", then "photos.clean_done"), with
 * keys and counts only.
 */
import { and, asc, desc, gt, inArray, isNotNull, like } from "drizzle-orm";
import { getDb } from "../db";
import { cleanPhoto } from "../domain/photos";
import type { Bindings } from "../lib/env";
import { audit } from "../lib/records";
import { createLogger } from "../logger";
import { auditLog, chatMessages, events, profiles, reports } from "../schema";
import { getObject, putObject } from "../storage";

const SOURCES = ["profiles", "chat", "covers"] as const;
type Source = (typeof SOURCES)[number];
export const PHOTO_CLEAN_BATCH = 40;

export type PhotoCleanTotals = { checked: number; cleaned: number; unchanged: number; skippedHeld: number; missing: number; unreadable: number };
type State = { source: Source; after: string; totals: PhotoCleanTotals };
const zero = (): PhotoCleanTotals => ({ checked: 0, cleaned: 0, unchanged: 0, skippedHeld: 0, missing: 0, unreadable: 0 });

/** Where the clean got to, or "done". */
export async function photoCleanState(env: Bindings): Promise<State | "done"> {
  const db = getDb(env);
  const [row] = await db
    .select({ action: auditLog.action, detail: auditLog.detail })
    .from(auditLog)
    .where(like(auditLog.action, "photos.clean_%"))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (!row) return { source: "profiles", after: "", totals: zero() };
  if (row.action === "photos.clean_done") return "done";
  const d = row.detail as Partial<State>;
  return { source: (SOURCES as readonly string[]).includes(d.source ?? "") ? (d.source as Source) : "profiles", after: d.after ?? "", totals: { ...zero(), ...(d.totals ?? {}) } };
}

/** The next rows of one source: an id to resume after, and the keys under it. */
async function nextRows(env: Bindings, source: Source, after: string): Promise<{ id: string; keys: string[] }[]> {
  const db = getDb(env);
  if (source === "profiles") {
    const rows = await db
      .select({ id: profiles.accountId, photoKey: profiles.photoKey, bio: profiles.bio })
      .from(profiles)
      .where(gt(profiles.accountId, after))
      .orderBy(asc(profiles.accountId))
      .limit(PHOTO_CLEAN_BATCH);
    return rows.map((r) => ({
      id: r.id,
      keys: [r.photoKey, ...Object.values(r.bio?.answers ?? {}).map((a) => a?.photoKey)].filter((k): k is string => typeof k === "string" && k.length > 0),
    }));
  }
  if (source === "chat") {
    const rows = await db
      .select({ id: chatMessages.id, photoKey: chatMessages.photoKey })
      .from(chatMessages)
      .where(and(gt(chatMessages.id, after), isNotNull(chatMessages.photoKey)))
      .orderBy(asc(chatMessages.id))
      .limit(PHOTO_CLEAN_BATCH);
    return rows.map((r) => ({ id: r.id, keys: [r.photoKey!] }));
  }
  const rows = await db
    .select({ id: events.id, coverKey: events.coverKey })
    .from(events)
    .where(and(gt(events.id, after), isNotNull(events.coverKey)))
    .orderBy(asc(events.id))
    .limit(PHOTO_CLEAN_BATCH);
  return rows.map((r) => ({ id: r.id, keys: [r.coverKey!] }));
}

/** Chat messages under an open report: their photos stay exactly as they are. */
async function heldMessages(env: Bindings, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await getDb(env)
    .select({ id: reports.targetMessage })
    .from(reports)
    .where(and(inArray(reports.targetMessage, ids), inArray(reports.status, ["open", "in_review"])))
    .limit(ids.length);
  return new Set(rows.map((r) => r.id!).filter(Boolean));
}

async function cleanKey(env: Bindings, key: string, t: PhotoCleanTotals): Promise<void> {
  t.checked++;
  const obj = await getObject(env, key).catch(() => null);
  if (!obj) {
    t.missing++;
    return;
  }
  const buf = await new Response(obj.body).arrayBuffer();
  const res = cleanPhoto(buf, null);
  if (!res.ok) {
    t.unreadable++;
    return;
  }
  if (!res.stripped) {
    t.unchanged++;
    return;
  }
  await putObject(env, key, res.bytes, { contentType: res.type });
  t.cleaned++;
}

/**
 * One batch. Returns the state after it ("done" once every source is through).
 * `actor` is "system" from the clock, or the admin who pressed the button.
 */
export async function runPhotoCleanBatch(env: Bindings, actor = "system"): Promise<State | "done"> {
  const state = await photoCleanState(env);
  if (state === "done") return "done";
  const db = getDb(env);
  let { source, after } = state;
  const totals = state.totals;
  const rows = await nextRows(env, source, after);
  const held = source === "chat" ? await heldMessages(env, rows.map((r) => r.id)) : new Set<string>();
  for (const r of rows) {
    if (held.has(r.id)) {
      totals.skippedHeld += r.keys.length;
      continue;
    }
    for (const k of r.keys) {
      try {
        await cleanKey(env, k, totals);
      } catch (err) {
        totals.unreadable++;
        createLogger(env).warn("photo clean failed", { key: k, error: String(err) });
      }
    }
  }
  if (rows.length === PHOTO_CLEAN_BATCH) {
    after = rows[rows.length - 1].id;
  } else {
    const next = SOURCES.indexOf(source) + 1;
    if (next >= SOURCES.length) {
      await audit(db, actor, "photos.clean_done", { type: "storage", id: "photos" }, { totals });
      createLogger(env).info("stored photos cleaned", totals);
      return "done";
    }
    source = SOURCES[next];
    after = "";
  }
  const out: State = { source, after, totals };
  await audit(db, actor, "photos.clean_batch", { type: "storage", id: "photos" }, out);
  return out;
}

/** Latest totals for the dashboard, or null before the first batch. */
export async function photoCleanSummary(env: Bindings): Promise<{ done: boolean; totals: PhotoCleanTotals } | null> {
  const [row] = await getDb(env)
    .select({ action: auditLog.action, detail: auditLog.detail })
    .from(auditLog)
    .where(like(auditLog.action, "photos.clean_%"))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (!row) return null;
  const d = row.detail as { totals?: PhotoCleanTotals };
  return { done: row.action === "photos.clean_done", totals: { ...zero(), ...(d.totals ?? {}) } };
}

