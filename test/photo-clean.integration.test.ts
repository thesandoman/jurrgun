/** The one-time clean of stored photos (owner decision 2026-10-26, "Strip all + clean old"). */
import { describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import app from "../src/index";
import { createMember, db, ENV, HAS_DB } from "./helpers";
import { newId, randomToken } from "../src/lib/crypto";
import { auditLog, chatMessages, events, profiles, reports } from "../src/schema";
import { runPhotoCleanBatch } from "../src/services/photo-clean";
import { CAMERA_MARK, GPS_MARK, phoneJpeg, phonePng, phoneWebp, text } from "./photo-fixtures";

function memBucket() {
  const store = new Map<string, { data: ArrayBuffer; type?: string }>();
  const obj = (key: string, v: { data: ArrayBuffer; type?: string }) => ({
    key, size: v.data.byteLength, uploaded: new Date(), httpEtag: "x", httpMetadata: { contentType: v.type },
    body: new Response(v.data).body,
  });
  return {
    store,
    async put(key: string, data: ArrayBuffer, o?: { httpMetadata?: { contentType?: string } }) { const v = { data, type: o?.httpMetadata?.contentType }; store.set(key, v); return obj(key, v); },
    async get(key: string) { const v = store.get(key); return v ? obj(key, v) : null; },
    async head(key: string) { const v = store.get(key); return v ? obj(key, v) : null; },
    async delete(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k); },
  };
}

const ab = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;

describe.skipIf(!HAS_DB)("cleaning photos stored before uploads were stripped", () => {
  it("strips every profile, prompt, chat and cover photo in place, leaves held ones alone, and records the counts", async () => {
    const BUCKET = memBucket();
    const env = { ...ENV, BUCKET } as unknown as typeof ENV;
    await db().delete(auditLog).where(like(auditLog.action, "photos.clean_%"));

    const [m, other, mod] = await Promise.all([createMember(), createMember(), createMember({ role: "moderator" })]);
    const main = `uploads/${m.id}/${randomToken(6)}`;
    const prompt = `uploads/${m.id}/prompts/${randomToken(6)}`;
    await db().update(profiles).set({ photoKey: main, bio: { answers: { p1: { kind: "photo", value: "", photoKey: prompt } } } }).where(eq(profiles.accountId, m.id));
    BUCKET.store.set(main, { data: ab(phoneJpeg()), type: "image/jpeg" });
    BUCKET.store.set(prompt, { data: ab(phonePng()), type: "image/png" });

    const thread = `circle:${newId()}`;
    const [free, held] = [newId(), newId()];
    const [freeKey, heldKey] = [`chat/${randomToken(6)}`, `chat/${randomToken(6)}`];
    await db().insert(chatMessages).values([
      { id: free, thread, sender: other.id, body: "", kind: "photo", photoKey: freeKey },
      { id: held, thread, sender: other.id, body: "", kind: "photo", photoKey: heldKey },
    ]);
    BUCKET.store.set(freeKey, { data: ab(phoneWebp()), type: "image/webp" });
    BUCKET.store.set(heldKey, { data: ab(phoneJpeg()), type: "image/jpeg" });
    // An open report on one photo: it stays exactly as it is, and so does its evidence copy.
    await db().insert(reports).values({ id: newId(), reporter: m.id, targetAccount: other.id, targetMessage: held, reason: "harassment", details: "Chat photo" });
    const evidence = `evidence/report-${randomToken(6)}`;
    BUCKET.store.set(evidence, { data: ab(phoneJpeg()), type: "image/jpeg" });

    const cover = `uploads/events/${randomToken(6)}`;
    const startsAt = new Date(Date.now() + 86_400_000);
    await db().insert(events).values({ id: newId(), title: "Cover test", startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), venueName: "Café", district: "bang_rak", capacity: 6, status: "published", createdBy: other.id, coverKey: cover });
    BUCKET.store.set(cover, { data: ab(phoneJpeg()), type: "image/jpeg" });

    let state = await runPhotoCleanBatch(env);
    for (let i = 0; i < 2000 && state !== "done"; i++) state = await runPhotoCleanBatch(env);
    expect(state).toBe("done");
    expect(await runPhotoCleanBatch(env)).toBe("done");

    for (const k of [main, prompt, freeKey, cover]) {
      const s = text(BUCKET.store.get(k)!.data);
      expect(s, k).not.toContain(GPS_MARK);
      expect(s, k).not.toContain(CAMERA_MARK);
    }
    expect(BUCKET.store.get(prompt)!.type).toBe("image/png");
    expect(text(BUCKET.store.get(heldKey)!.data)).toContain(GPS_MARK);
    expect(text(BUCKET.store.get(evidence)!.data)).toContain(GPS_MARK);

    const [done] = await db().select().from(auditLog).where(eq(auditLog.action, "photos.clean_done"));
    const totals = (done.detail as { totals: Record<string, number> }).totals;
    expect(totals.cleaned).toBeGreaterThanOrEqual(4);
    expect(totals.skippedHeld).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(done.detail)).not.toContain(GPS_MARK);

    // The dashboard shows the counts to admins; moderators can't run a batch.
    expect((await app.request("/admin/photos-clean", { method: "POST", headers: { cookie: mod.cookie } }, env)).status).toBe(403);
  });
});
