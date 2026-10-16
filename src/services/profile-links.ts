/**
 * Who may see a member's social links (owner, 2026-10-16), in one place:
 *
 *  - only another member with a mutual, non-removed connection to them
 *    (social_connections, removedAt null; a Bangkok Buddy counts only once
 *    you both chose to meet, which makes a connection row);
 *  - only while the owner's latest profile_links consent is on (off by default);
 *  - never across a block, in either direction;
 *  - never for an account that is not active;
 *  - never to themselves (the "as others see it" preview), staff pages,
 *    public pages, Discover, tables or search: those never call this.
 *
 * Removing a connection or blocking stops visibility at once, because every
 * read goes through this query.
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { getDb } from "../db";
import { accounts, blocks, connections, consents, profileLinks } from "../schema";
import { linkHref, linkText, NETWORK_KEYS, PROFILE_LINKS_CONSENT } from "../content/social-links";

type Db = ReturnType<typeof getDb>;

export type ShownLink = { network: string; href: string; text: string };

/** Stored links in the fixed network order, dropping any that no longer pass the rules. */
function shape(rows: { network: string; value: string }[]): ShownLink[] {
  const out: ShownLink[] = [];
  for (const key of NETWORK_KEYS) {
    const r = rows.find((x) => x.network === key);
    if (!r) continue;
    const href = linkHref(r.network, r.value);
    if (href) out.push({ network: r.network, href, text: linkText(r.network, r.value) });
  }
  return out;
}

/** Latest-wins read of the profile_links switch for these accounts (append-only history). */
export async function linksSwitch(db: Db, ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!ids.length) return out;
  const rows = await db
    .select({ accountId: consents.accountId, granted: consents.granted })
    .from(consents)
    .where(and(inArray(consents.accountId, ids), eq(consents.category, PROFILE_LINKS_CONSENT)))
    .orderBy(desc(consents.createdAt))
    .limit(ids.length * 50);
  for (const r of rows) if (!out.has(r.accountId)) out.set(r.accountId, r.granted);
  return out;
}

/** My own stored links (for the edit form and the data export). */
export async function ownLinks(db: Db, accountId: string) {
  return db
    .select({ network: profileLinks.network, value: profileLinks.value, createdAt: profileLinks.createdAt, updatedAt: profileLinks.updatedAt })
    .from(profileLinks)
    .where(eq(profileLinks.accountId, accountId))
    .limit(NETWORK_KEYS.length);
}

/** The links `viewerId` may see, per owner. Owners with nothing to show are absent from the map. */
export async function visibleLinks(db: Db, viewerId: string, ownerIds: string[]): Promise<Map<string, ShownLink[]>> {
  const out = new Map<string, ShownLink[]>();
  const owners = [...new Set(ownerIds)].filter((id) => id !== viewerId);
  if (!owners.length) return out;
  const [conns, blocked, switches, active, rows] = await Promise.all([
    db
      .select({ a: connections.aAccount, b: connections.bAccount })
      .from(connections)
      .where(
        and(
          isNull(connections.removedAt),
          or(and(eq(connections.aAccount, viewerId), inArray(connections.bAccount, owners)), and(eq(connections.bAccount, viewerId), inArray(connections.aAccount, owners))),
        ),
      )
      .limit(owners.length * 50),
    db
      .select({ blocker: blocks.blocker, blocked: blocks.blocked })
      .from(blocks)
      .where(or(and(eq(blocks.blocker, viewerId), inArray(blocks.blocked, owners)), and(eq(blocks.blocked, viewerId), inArray(blocks.blocker, owners))))
      .limit(owners.length * 2),
    linksSwitch(db, owners),
    db.select({ id: accounts.id, status: accounts.status, suspendedUntil: accounts.suspendedUntil }).from(accounts).where(inArray(accounts.id, owners)).limit(owners.length),
    db.select({ accountId: profileLinks.accountId, network: profileLinks.network, value: profileLinks.value }).from(profileLinks).where(inArray(profileLinks.accountId, owners)).limit(owners.length * NETWORK_KEYS.length),
  ]);
  const connected = new Set(conns.map((x) => (x.a === viewerId ? x.b : x.a)));
  const blockedIds = new Set(blocked.map((x) => (x.blocker === viewerId ? x.blocked : x.blocker)));
  const now = Date.now();
  const isActive = new Set(
    active.filter((a) => a.status === "active" || (a.status === "suspended" && !!a.suspendedUntil && a.suspendedUntil.getTime() <= now)).map((a) => a.id),
  );
  for (const id of owners) {
    if (!connected.has(id) || blockedIds.has(id) || !switches.get(id) || !isActive.has(id)) continue;
    const shown = shape(rows.filter((r) => r.accountId === id));
    if (shown.length) out.set(id, shown);
  }
  return out;
}
