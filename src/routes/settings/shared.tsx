/**
 * Settings, shared part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { type Context } from "hono";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { cleanBio, withoutDating } from "../../content/profile";
import type { AppEnv } from "../../lib/env";
import { connectionChoices, consents, events, profiles, type Profile } from "../../schema";
import { getObjectUrl } from "../../storage";


export type C = Context<AppEnv>;
export const me = (c: C) => c.var.user!;

// ------------------------------------------------------------- helpers --

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A URL a browser can load my photo from. Deployed: a short-lived signed URL. */
export async function photoSrc(c: C, key: string | null): Promise<string | null> {
  if (!key) return null;
  if (c.env.FILES) {
    try {
      return await getObjectUrl(c.env, key);
    } catch {
      return null;
    }
  }
  // Locally there is no signer: a member-only route serves the bytes (dev only).
  return c.env.BUCKET ? "/settings/photo" : null;
}

/** The latest row per consent category (history is append-only). */
export async function currentConsents(c: C, accountId: string): Promise<Map<string, boolean>> {
  const rows = await getDb(c.env)
    .select({ category: consents.category, granted: consents.granted })
    .from(consents)
    .where(eq(consents.accountId, accountId))
    .orderBy(desc(consents.createdAt))
    .limit(500);
  const map = new Map<string, boolean>();
  for (const r of rows) if (!map.has(r.category)) map.set(r.category, r.granted);
  return map;
}


/** Every romance-only field cleared, dating prompts and answers included. */
export function romanceOffPatch(p: Profile): Partial<typeof profiles.$inferInsert> {
  const intents = p.intents.filter((i) => i !== "romance");
  return {
    romanceOn: false,
    genderIdentity: null,
    romanceOpenTo: null,
    orientation: null,
    orientationOpenTo: null,
    showDatingPrefs: false,
    intents: intents.length ? intents : ["friends"],
    bio: withoutDating(cleanBio(p.bio)),
  };
}

/**
 * PRD §4.4: pending romantic choices are withdrawn. Owner, 2026-10-26: they
 * are deleted, not turned into a "friend" pick the member never made. Choices
 * whose People I Met window (72h) is still open are the only pending ones.
 */
export function withdrawRomanceChoices(db: ReturnType<typeof getDb>, accountId: string) {
  const openSince = new Date(Date.now() - 72 * 3_600_000);
  return db
    .delete(connectionChoices)
    .where(
      and(
        eq(connectionChoices.fromAccount, accountId),
        eq(connectionChoices.choice, "romance"),
        inArray(connectionChoices.eventId, db.select({ id: events.id }).from(events).where(gt(events.endsAt, openSince))),
      ),
    );
}
