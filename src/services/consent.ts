/**
 * Consents (social_consents): append-only, the newest row per category wins,
 * and no row at all means no. Every place that reads or changes a consent
 * goes through here, so a change always carries its side effects:
 *
 *   romance_data      withdrawn: dating intents are deleted at once (the
 *                     profile's romance fields are cleared by the caller, with
 *                     romanceOffPatch / connectionsPatch). Dating intents are
 *                     only ever saved while it is granted.
 *   research          granted: a research_id is issued if there is none.
 *                     withdrawn: every City Pulse and wellbeing answer under
 *                     the research_id is deleted and the id is cut, so a
 *                     later yes starts a fresh, unlinked id.
 *   relationship_data recorded when a relationship status is given (and
 *                     withdrawn when it goes back to "prefer not to say").
 *                     withdrawn: the status goes back to "prefer not to say".
 *   gender_data       recorded when the private gender is given, withdrawn
 *                     when it is cleared. withdrawn: the gender, the
 *                     self-described words and women-only are cleared.
 *   personalization   read by seating, buddy matching and the weekly plan.
 *   notifications     read by reminders and push; no row means no.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { newId } from "../lib/crypto";
import { accounts, consents, datingIntents, profiles, pulseResponses, wellbeing } from "../schema";
import { NOTICE_ISO, TERMS_CONSENT, TERMS_VERSION } from "../content/privacy";

type Db = ReturnType<typeof getDb>;
type Query = { toSQL(): { sql: string; params: unknown[] } };

/** Every new consent row records the notice it was given under (the notice date, src/content/privacy.ts). */
export const CONSENT_VERSION = `notice-${NOTICE_ISO}`;
export const ROMANCE_CONSENT = "romance_data";
export const RESEARCH_CONSENT = "research";
export const PERSONALIZATION_CONSENT = "personalization";
export const NOTIFICATIONS_CONSENT = "notifications";
/** Relationship status (single, in a relationship, married), private (R3). */
export const RELATIONSHIP_CONSENT = "relationship_data";
/** The private gender kept for women-only spaces (R3). */
export const GENDER_CONSENT = "gender_data";

/** The newest answer for one category, or null when there is none. */
export async function latestConsent(db: Db, accountId: string, category: string): Promise<boolean | null> {
  const [row] = await db
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, category)))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return row ? row.granted : null;
}

/** True only when the newest answer is yes. No row means no. */
export async function hasConsent(db: Db, accountId: string, category: string): Promise<boolean> {
  return (await latestConsent(db, accountId, category)) === true;
}

/** The newest answer per member for one category; members with no row are left out (so: no). */
export async function consentsFor(db: Db, ids: string[], category: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .selectDistinctOn([consents.accountId], { accountId: consents.accountId, granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.category, category), inArray(consents.accountId, ids)))
    .orderBy(consents.accountId, desc(consents.createdAt))
    .limit(ids.length);
  return new Set(rows.filter((r) => r.granted).map((r) => r.accountId));
}

/** One new consent row (the history is the audit trail). */
export function consentRow(db: Db, accountId: string, category: string, granted: boolean) {
  return db.insert(consents).values({ id: newId(), accountId, category, granted, version: CONSENT_VERSION });
}

/** True when the member's newest Terms row accepts the current Terms (TERMS_VERSION). */
export async function acceptedTerms(db: Db, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ granted: consents.granted, version: consents.version })
    .from(consents)
    .where(and(eq(consents.accountId, accountId), eq(consents.category, TERMS_CONSENT)))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return !!row && row.granted && row.version === TERMS_VERSION;
}

/** The row that records accepting the current Terms (and reading the privacy notice). */
export function termsRow(db: Db, accountId: string) {
  return db.insert(consents).values({ id: newId(), accountId, category: TERMS_CONSENT, granted: true, version: TERMS_VERSION });
}

/** Delete the member's dating intents (romance switched off or romance_data withdrawn). */
export function deleteDatingIntents(db: Db, accountId: string) {
  return db.delete(datingIntents).where(eq(datingIntents.accountId, accountId));
}

/**
 * What a consent change does besides its own row. `researchId` is the
 * member's current research_id (needed to delete research answers).
 */
export function consentEffects(db: Db, accountId: string, category: string, granted: boolean, researchId: string | null): Query[] {
  if (category === ROMANCE_CONSENT && !granted) return [deleteDatingIntents(db, accountId)];
  if (category === RESEARCH_CONSENT) return granted ? [issueResearchId(db, accountId)] : researchWithdrawn(db, accountId, researchId);
  if (category === RELATIONSHIP_CONSENT && !granted) {
    return [db.update(profiles).set({ relationship: "prefer_not", updatedAt: new Date() }).where(eq(profiles.accountId, accountId))];
  }
  if (category === GENDER_CONSENT && !granted) {
    return [
      db
        .update(profiles)
        .set({ gender: null, womenOnly: false, bio: sql`${profiles.bio} - 'genderSelf'`, updatedAt: new Date() })
        .where(eq(profiles.accountId, accountId)),
    ];
  }
  return [];
}

/** A research_id for a member who said yes to research and has none (never replaces one). */
export function issueResearchId(db: Db, accountId: string) {
  return db.update(accounts).set({ researchId: newId() }).where(and(eq(accounts.id, accountId), isNull(accounts.researchId)));
}

/** Research withdrawn: their City Pulse and wellbeing answers go, and the research_id is cut. */
export function researchWithdrawn(db: Db, accountId: string, researchId: string | null): Query[] {
  return [
    ...(researchId ? [db.delete(pulseResponses).where(eq(pulseResponses.researchId, researchId)), db.delete(wellbeing).where(eq(wellbeing.researchId, researchId))] : []),
    db.update(accounts).set({ researchId: null }).where(eq(accounts.id, accountId)),
  ];
}

/**
 * R3: the consent rows that go with saving relationship status and private
 * gender. Giving one (anything but "prefer not to say" or blank) records a
 * yes; clearing it records a no. Only changes are written.
 */
export async function privateFieldConsents(
  db: Db,
  accountId: string,
  next: { relationship?: string | null; gender?: string | null },
): Promise<Query[]> {
  const out: Query[] = [];
  const check = async (category: string, given: boolean) => {
    const now = await latestConsent(db, accountId, category);
    if (given ? now !== true : now === true) out.push(consentRow(db, accountId, category, given));
  };
  if (next.relationship !== undefined) await check(RELATIONSHIP_CONSENT, !!next.relationship && next.relationship !== "prefer_not");
  if (next.gender !== undefined) await check(GENDER_CONSENT, !!next.gender);
  return out;
}
