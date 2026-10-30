/**
 * Collab events (D53, D54): a lead partner invites up to 2 verified
 * co-hosts; each accepts or declines in its partner area. The mixing rules
 * are checked when inviting and again when accepting, and a collab with a
 * dating partner gets the 💘 tag. Counts are the same for every partner.
 *
 * An unanswered invite lapses 72 hours after it was sent, or 24 hours before
 * the event starts if that's sooner (owner P4, 30 Oct 2026). From then on it
 * counts as "lapsed" everywhere at once (Discover, the partner area, answering
 * it); the hourly clock writes the status and tells the lead partner.
 */
import { and, eq, inArray, lte, ne, not, or, sql } from "drizzle-orm";
import { batch, getDb } from "../db";
import { collabIsDating, collabMixRefusal, INVITE_CLOSE_BEFORE_START_MS, INVITE_LAPSE_MS, inviteLapsesAt, LOVE_GROUP_REFUSAL, MAX_COHOSTS, type Lang2 } from "../domain/event-rules";
import { OPEN_TO_MORE_TAG } from "../domain/rules";
import { newId } from "../lib/crypto";
import type { AppEnv } from "../lib/env";
import { audit, notifyMany } from "../lib/records";
import { accounts, eventPartners, events, partnerOrgs } from "../schema";

type Env = AppEnv["Bindings"];
export type Cohost = { inviteId: string; orgId: string; name: string; kind: string; status: string };

/** An invite's status as of now: an unanswered one past its time is "lapsed", whether or not the clock has written it yet. */
export const inviteStatus = (status: string, sentAt: Date, startsAt: Date, now = new Date()): string =>
  status === "invited" && inviteLapsesAt(sentAt, startsAt).getTime() <= now.getTime() ? "lapsed" : status;

/** Co-hosts per event (invited, accepted, declined and lapsed), with the partner's name and type. */
export async function cohostsFor(env: Env, eventIds: string[]): Promise<Map<string, Cohost[]>> {
  const out = new Map<string, Cohost[]>();
  if (!eventIds.length) return out;
  const rows = await getDb(env)
    .select({
      inviteId: eventPartners.id,
      eventId: eventPartners.eventId,
      orgId: eventPartners.partnerOrgId,
      status: eventPartners.status,
      sentAt: eventPartners.createdAt,
      startsAt: events.startsAt,
      name: partnerOrgs.name,
      kind: partnerOrgs.kind,
    })
    .from(eventPartners)
    .innerJoin(partnerOrgs, eq(partnerOrgs.id, eventPartners.partnerOrgId))
    .innerJoin(events, eq(events.id, eventPartners.eventId))
    .where(inArray(eventPartners.eventId, eventIds))
    .limit(eventIds.length * (MAX_COHOSTS + 4));
  const now = new Date();
  for (const r of rows) {
    const list = out.get(r.eventId) ?? [];
    list.push({ inviteId: r.inviteId, orgId: r.orgId, name: r.name, kind: r.kind, status: inviteStatus(r.status, r.sentAt, r.startsAt, now) });
    out.set(r.eventId, list);
  }
  return out;
}

/** The names a member sees on an event: the lead partner, then accepted co-hosts. */
export async function partnerNames(env: Env, e: { id: string; partnerOrgId: string | null }): Promise<string[]> {
  const db = getDb(env);
  const [lead] = e.partnerOrgId ? await db.select({ name: partnerOrgs.name }).from(partnerOrgs).where(eq(partnerOrgs.id, e.partnerOrgId)).limit(1) : [];
  const co = ((await cohostsFor(env, [e.id])).get(e.id) ?? []).filter((x) => x.status === "accepted").map((x) => x.name);
  return [...(lead ? [lead.name] : []), ...co];
}

/** Partner names for collab events in a list (lead first, then accepted co-hosts): only events with a co-host. */
export async function collabNamesFor(env: Env, list: { id: string; partnerOrgId: string | null }[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const co = await cohostsFor(env, list.map((e) => e.id));
  const withCo = list.filter((e) => (co.get(e.id) ?? []).some((x) => x.status === "accepted"));
  if (!withCo.length) return out;
  const leadIds = [...new Set(withCo.map((e) => e.partnerOrgId).filter((x): x is string => !!x))];
  const leads = leadIds.length ? await getDb(env).select({ id: partnerOrgs.id, name: partnerOrgs.name }).from(partnerOrgs).where(inArray(partnerOrgs.id, leadIds)).limit(leadIds.length) : [];
  const leadName = new Map(leads.map((l) => [l.id, l.name]));
  for (const e of withCo) {
    const lead = e.partnerOrgId ? leadName.get(e.partnerOrgId) : undefined;
    out.set(e.id, [...(lead ? [lead] : []), ...(co.get(e.id) ?? []).filter((x) => x.status === "accepted").map((x) => x.name)]);
  }
  return out;
}

/** SQL: the event has no open co-host invite (D53), so it may show on Discover. */
export const noOpenInvite = () =>
  sql`not exists (select 1 from ${eventPartners} where ${eventPartners.eventId} = ${events.id} and ${eventPartners.status} = 'invited' and ${openInvite()})`;

/** SQL: the same, for a query on social_event_partners alone. */
const openInviteFor = () =>
  sql`${eventPartners.createdAt} > now() - ${sql.raw(`interval '${INVITE_LAPSE_MS / 1000} seconds'`)} and (select starts_at from social_events where id = ${eventPartners.eventId}) > now() + ${sql.raw(`interval '${INVITE_CLOSE_BEFORE_START_MS / 1000} seconds'`)}`;

/** SQL: an invited row that hasn't lapsed yet (owner P4). Needs `events` in scope for the start time. */
const openInvite = () =>
  sql`${eventPartners.createdAt} > now() - ${sql.raw(`interval '${INVITE_LAPSE_MS / 1000} seconds'`)} and ${events.startsAt} > now() + ${sql.raw(`interval '${INVITE_CLOSE_BEFORE_START_MS / 1000} seconds'`)}`;

async function kindOf(env: Env, orgId: string | null): Promise<string | null> {
  if (!orgId) return null;
  const [o] = await getDb(env).select({ kind: partnerOrgs.kind }).from(partnerOrgs).where(eq(partnerOrgs.id, orgId)).limit(1);
  return o?.kind ?? null;
}

const refuse = (th: string, en: string): Lang2 => ({ th, en });

/** The lead partner invites a verified co-host to one of its upcoming events. */
export async function inviteCohost(env: Env, by: { accountId: string; orgId: string }, eventId: string, targetOrgId: string): Promise<Lang2 | null> {
  const db = getDb(env);
  const [ev] = await db
    .select({ id: events.id, partnerOrgId: events.partnerOrgId, startsAt: events.startsAt, title: events.title, titleEn: events.titleEn, groupJoinCode: events.groupJoinCode })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!ev || ev.partnerOrgId !== by.orgId) return refuse("ไม่พบกิจกรรมนี้", "We can't find that event.");
  if (ev.startsAt.getTime() <= Date.now()) return refuse("กิจกรรมนี้เริ่มไปแล้ว", "That event has already started.");
  // An invite closes 24 hours before the start, so there'd be no time to answer.
  if (ev.startsAt.getTime() - Date.now() <= INVITE_CLOSE_BEFORE_START_MS) {
    return refuse("เหลือไม่ถึง 24 ชั่วโมงก่อนเริ่ม เชิญผู้ร่วมจัดไม่ทันแล้ว", "It's less than 24 hours to the start, too late to invite a co-host.");
  }
  if (targetOrgId === by.orgId) return refuse("เลือกพาร์ตเนอร์อื่น", "Choose another partner.");
  const [target] = await db.select({ id: partnerOrgs.id, kind: partnerOrgs.kind, status: partnerOrgs.status, name: partnerOrgs.name }).from(partnerOrgs).where(eq(partnerOrgs.id, targetOrgId)).limit(1);
  if (!target || target.status !== "verified") return refuse("เชิญได้เฉพาะพาร์ตเนอร์ที่ยืนยันแล้ว", "Only verified partners can be invited.");
  const current = ((await cohostsFor(env, [eventId])).get(eventId) ?? []).filter((c) => c.status === "invited" || c.status === "accepted");
  if (current.some((c) => c.orgId === targetOrgId)) return refuse("เชิญพาร์ตเนอร์นี้ไปแล้ว", "That partner is already invited.");
  if (current.length >= MAX_COHOSTS) return refuse(`มีผู้ร่วมจัดได้ไม่เกิน ${MAX_COHOSTS} ราย`, `At most ${MAX_COHOSTS} co-hosts.`);
  const kinds = [(await kindOf(env, by.orgId)) ?? "events", ...current.map((c) => c.kind), target.kind];
  const mix = collabMixRefusal(kinds);
  if (mix) return mix;
  // A dating co-host would put a join-code group behind 💘 (owner P2).
  if (collabIsDating(kinds) && ev.groupJoinCode) return LOVE_GROUP_REFUSAL;
  const admins = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.partnerOrgId, targetOrgId), eq(accounts.role, "partner_admin"))).limit(20);
  const id = newId();
  // A declined or lapsed invite from before is replaced by the new one.
  await db
    .delete(eventPartners)
    .where(and(eq(eventPartners.eventId, eventId), eq(eventPartners.partnerOrgId, targetOrgId), or(inArray(eventPartners.status, ["declined", "lapsed"]), and(eq(eventPartners.status, "invited"), not(openInviteFor())))));
  await batch(env, [
    db.insert(eventPartners).values({ id, eventId, partnerOrgId: targetOrgId, invitedBy: by.accountId }),
    audit(db, by.accountId, "partner.cohost_invite", { type: "event", id: eventId }, { org: targetOrgId }),
    ...notifyMany(
      db,
      admins.map((a) => ({ accountId: a.id, th: `มีคำเชิญร่วมจัด: ${ev.title}`, en: `Invited to co-host: ${ev.titleEn ?? ev.title}` })),
      "partner",
      "/partner",
    ),
  ]);
  return null;
}

/** A co-host accepts or declines. Accepting re-checks the mix and tags a dating collab with 💘. */
export async function respondToInvite(env: Env, by: { accountId: string; orgId: string }, inviteId: string, accept: boolean): Promise<Lang2 | null> {
  const db = getDb(env);
  const [inv] = await db.select().from(eventPartners).where(eq(eventPartners.id, inviteId)).limit(1);
  if (!inv || inv.partnerOrgId !== by.orgId || inv.status !== "invited") return refuse("ไม่พบคำเชิญนี้", "We can't find that invitation.");
  const [ev] = await db
    .select({ id: events.id, partnerOrgId: events.partnerOrgId, tags: events.tags, groupJoinCode: events.groupJoinCode, startsAt: events.startsAt })
    .from(events)
    .where(eq(events.id, inv.eventId))
    .limit(1);
  if (!ev) return refuse("ไม่พบกิจกรรมนี้", "We can't find that event.");
  if (inviteStatus(inv.status, inv.createdAt, ev.startsAt) === "lapsed") {
    return refuse("คำเชิญนี้หมดเวลาแล้ว กิจกรรมขึ้นโดยไม่มีคุณร่วมจัด ให้ผู้จัดหลักเชิญใหม่ได้", "This invitation has lapsed and the event went ahead without you. The lead partner can invite you again.");
  }
  if (!accept) {
    await batch(env, [
      db.update(eventPartners).set({ status: "declined", respondedAt: new Date() }).where(eq(eventPartners.id, inviteId)),
      audit(db, by.accountId, "partner.cohost_decline", { type: "event", id: ev.id }),
    ]);
    return null;
  }
  const others = ((await cohostsFor(env, [ev.id])).get(ev.id) ?? []).filter((c) => c.status === "accepted" && c.inviteId !== inviteId);
  const kinds = [(await kindOf(env, ev.partnerOrgId)) ?? "events", ...others.map((c) => c.kind), (await kindOf(env, by.orgId)) ?? "events"];
  const mix = collabMixRefusal(kinds);
  if (mix) return mix;
  // The group may have been added after the invite went out.
  if (collabIsDating(kinds) && ev.groupJoinCode) return LOVE_GROUP_REFUSAL;
  const tags = collabIsDating(kinds) && !ev.tags.includes(OPEN_TO_MORE_TAG) ? [...ev.tags, OPEN_TO_MORE_TAG] : ev.tags;
  await batch(env, [
    db.update(eventPartners).set({ status: "accepted", respondedAt: new Date() }).where(eq(eventPartners.id, inviteId)),
    ...(tags !== ev.tags ? [db.update(events).set({ tags }).where(eq(events.id, ev.id))] : []),
    audit(db, by.accountId, "partner.cohost_accept", { type: "event", id: ev.id }),
  ]);
  return null;
}

/** The lead partner withdraws an invite or removes a co-host. */
export async function removeCohost(env: Env, by: { accountId: string; orgId: string }, eventId: string, inviteId: string): Promise<boolean> {
  const db = getDb(env);
  const [ev] = await db.select({ partnerOrgId: events.partnerOrgId }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev || ev.partnerOrgId !== by.orgId) return false;
  const gone = await db.delete(eventPartners).where(and(eq(eventPartners.id, inviteId), eq(eventPartners.eventId, eventId))).returning({ id: eventPartners.id });
  if (gone.length) await audit(db, by.accountId, "partner.cohost_remove", { type: "event", id: eventId });
  return gone.length > 0;
}

/** Verified partners a lead may invite (not itself), by name. */
export async function invitablePartners(env: Env, orgId: string) {
  return getDb(env)
    .select({ id: partnerOrgs.id, name: partnerOrgs.name, kind: partnerOrgs.kind })
    .from(partnerOrgs)
    .where(and(eq(partnerOrgs.status, "verified"), ne(partnerOrgs.id, orgId)))
    .orderBy(partnerOrgs.name)
    .limit(200);
}

/** Open invitations to this partner, with the event and the lead partner's name. */
export async function invitationsFor(env: Env, orgId: string) {
  const db = getDb(env);
  const rows = await db
    .select({ inviteId: eventPartners.id, eventId: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, leadOrgId: events.partnerOrgId, sentAt: eventPartners.createdAt })
    .from(eventPartners)
    .innerJoin(events, eq(events.id, eventPartners.eventId))
    .where(and(eq(eventPartners.partnerOrgId, orgId), eq(eventPartners.status, "invited"), openInvite()))
    .limit(50);
  const leadIds = [...new Set(rows.map((r) => r.leadOrgId).filter((x): x is string => !!x))];
  const leads = leadIds.length ? await db.select({ id: partnerOrgs.id, name: partnerOrgs.name }).from(partnerOrgs).where(inArray(partnerOrgs.id, leadIds)).limit(leadIds.length) : [];
  const name = new Map(leads.map((l) => [l.id, l.name]));
  return rows.map((r) => ({ ...r, leadName: (r.leadOrgId && name.get(r.leadOrgId)) || "" }));
}

/**
 * Hourly (src/services/clock.ts): mark unanswered invites past their time as
 * lapsed and tell the lead partner's admins in plain words. The event already
 * shows without that co-host (noOpenInvite reads the time, not this status).
 */
export async function lapseInvites(env: Env, now = new Date()): Promise<number> {
  const db = getDb(env);
  const due = await db
    .select({ id: eventPartners.id, eventId: events.id, title: events.title, titleEn: events.titleEn, leadOrgId: events.partnerOrgId, name: partnerOrgs.name })
    .from(eventPartners)
    .innerJoin(events, eq(events.id, eventPartners.eventId))
    .innerJoin(partnerOrgs, eq(partnerOrgs.id, eventPartners.partnerOrgId))
    .where(
      and(
        eq(eventPartners.status, "invited"),
        or(
          lte(eventPartners.createdAt, new Date(now.getTime() - INVITE_LAPSE_MS)),
          lte(events.startsAt, new Date(now.getTime() + INVITE_CLOSE_BEFORE_START_MS)),
        ),
      ),
    )
    .limit(500);
  if (!due.length) return 0;
  const leadIds = [...new Set(due.map((d) => d.leadOrgId).filter((x): x is string => !!x))];
  const admins = leadIds.length
    ? await db.select({ id: accounts.id, orgId: accounts.partnerOrgId }).from(accounts).where(and(inArray(accounts.partnerOrgId, leadIds), eq(accounts.role, "partner_admin"))).limit(leadIds.length * 20)
    : [];
  const ops = [];
  for (const d of due) {
    ops.push(
      // Only if still unanswered: an answer in the same moment wins.
      db.update(eventPartners).set({ status: "lapsed", respondedAt: now }).where(and(eq(eventPartners.id, d.id), eq(eventPartners.status, "invited"))),
      ...notifyMany(
        db,
        admins
          .filter((a) => a.orgId === d.leadOrgId)
          .map((a) => ({
            accountId: a.id,
            th: `${d.name} ไม่ได้ตอบคำเชิญร่วมจัดทันเวลา กิจกรรมจึงขึ้นโดยไม่มีพวกเขา: ${d.title}`,
            en: `${d.name} didn't answer your co-host invitation in time, so your event shows without them: ${d.titleEn ?? d.title}`,
          })),
        "partner",
        "/partner",
      ),
    );
  }
  await batch(env, ops);
  return due.length;
}

