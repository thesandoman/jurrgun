/**
 * Jurrgun-issued partner keys (D47). A verified partner's own system posts
 * go-together events with one (src/routes/partner-api.ts).
 *
 * A key is "jgk_" plus 32 random bytes. Only its SHA-256 is stored, with the
 * first characters to tell keys apart; the key itself is shown once, when it
 * is made. Revoking is immediate and final. A key only ever acts for its own
 * partner organisation, and never reads member data: counts only.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, type DatabaseEnv } from "../db";
import { newId, randomToken, sha256 } from "../lib/crypto";
import { partnerKeys, partnerOrgs, type PartnerOrg } from "../schema";

export const KEY_PREFIX = "jgk_";
export const KEYS_PER_ORG = 5;

export async function createPartnerKey(env: DatabaseEnv, orgId: string, label: string, by: string): Promise<{ id: string; key: string }> {
  const key = `${KEY_PREFIX}${randomToken(32)}`;
  const id = newId();
  await getDb(env)
    .insert(partnerKeys)
    .values({ id, partnerOrgId: orgId, keyHash: await sha256(key), prefix: key.slice(0, KEY_PREFIX.length + 6), label: label.slice(0, 60), createdBy: by });
  return { id, key };
}

export async function revokePartnerKey(env: DatabaseEnv, orgId: string, keyId: string): Promise<boolean> {
  const rows = await getDb(env)
    .update(partnerKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(partnerKeys.id, keyId), eq(partnerKeys.partnerOrgId, orgId), isNull(partnerKeys.revokedAt)))
    .returning({ id: partnerKeys.id });
  return rows.length > 0;
}

/** The organisation a bearer key belongs to, when the key is live. */
export async function orgForKey(env: DatabaseEnv, header: string | undefined): Promise<PartnerOrg | null> {
  const m = /^Bearer\s+(jgk_[A-Za-z0-9_-]{20,80})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const db = getDb(env);
  const [row] = await db
    .select({ keyId: partnerKeys.id, org: partnerOrgs })
    .from(partnerKeys)
    .innerJoin(partnerOrgs, eq(partnerOrgs.id, partnerKeys.partnerOrgId))
    .where(and(eq(partnerKeys.keyHash, await sha256(m[1])), isNull(partnerKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(partnerKeys).set({ lastUsedAt: new Date() }).where(eq(partnerKeys.id, row.keyId));
  return row.org;
}
