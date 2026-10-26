/**
 * Evidence hold (owner card B, 2026-10-26). When a member reports a chat
 * message, a copy of that one item is kept with the report, never the thread:
 *
 * - text: already copied into the report's details (up to 500 characters),
 *   so it follows the reports' 2-year schedule;
 * - a photo: copied to its own file under the report's id when the report is
 *   made, and deleted when the report is closed (actioned or dismissed).
 *
 * The chat's own copy still goes on the chat schedule (180 days), so evidence
 * no longer disappears halfway through a case.
 */
import { deleteObject, getObject, putObject } from "../storage";
import { createLogger } from "../logger";
import type { Bindings } from "../lib/env";

/** Where a report's photo copy lives. Built from the report id on the server, never from a request. */
export const evidenceKey = (reportId: string) => `evidence/report-${reportId}`;

/** Chat reports start their details with this for a photo (routes/chat.tsx). */
export const PHOTO_DETAILS_PREFIX = "Chat photo";

export function isPhotoReport(r: { targetMessage: string | null; details: string }): boolean {
  return !!r.targetMessage && r.details.startsWith(PHOTO_DETAILS_PREFIX);
}

/** Copies a reported chat photo. A failed copy is logged, never blocks the report. */
export async function keepPhoto(env: Bindings, reportId: string, photoKey: string): Promise<boolean> {
  try {
    const obj = await getObject(env, photoKey);
    if (!obj) return false;
    await putObject(env, evidenceKey(reportId), obj.body, { contentType: obj.metadata.contentType });
    return true;
  } catch (err) {
    createLogger(env).warn("evidence copy failed", { reportId, error: String(err) });
    return false;
  }
}

/** Deletes the photo copy once a report is closed. Missing files are fine. */
export async function dropEvidence(env: Bindings, reportId: string): Promise<void> {
  await deleteObject(env, evidenceKey(reportId)).catch((err) => createLogger(env).warn("evidence delete failed", { reportId, error: String(err) }));
}
