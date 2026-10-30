/**
 * Staff events, groups part (split from routes/admin/events.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { realPeopleFor } from "../../../services/demo";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { batch } from "../../../db";
import { suggestGroups } from "../../../domain/matching";
import { OPEN_TO_MORE_TAG } from "../../../domain/rules";
import { batchAll, chunks, KEYSET_CHUNK } from "../../../lib/bulk";
import { audit, notifyMany } from "../../../lib/records";
import { events, registrations } from "../../../schema";
import { loadAttendees } from "../../../services/events";
import { blockedAmong } from "../../../services/regular-tables";
import { str, view } from "../../../ui/kit";
import { adminEvents } from "./app";
import { intIn } from "./edit";
import { BASE, checkedInRegistrations, me, refuse, withEvent } from "./shared";

// -------------------------------------------------------------- groups --

/**
 * Hard rule (PRD §8.1): blocked pairs are never seated together. The shared
 * clearinghouse avoids it greedily but can still leave one when tables are
 * nearly full, so repair here: swap one of the pair with a solo attendee from
 * another table when that creates no new blocked pair. Table sizes and +1
 * pairs are untouched. Returns the number of conflicts left (0 normally).
 */
export function separateBlocked(groups: string[][], blocked: Map<string, Set<string>>, keepTogether: [string, string][]): number {
  const paired = new Set(keepTogether.flat());
  const clash = (a: string, b: string) => !!blocked.get(a)?.has(b) || !!blocked.get(b)?.has(a);
  const clean = (members: string[], who: string, without: string) => members.every((m) => m === without || m === who || !clash(who, m));
  const conflicts = () => {
    let n = 0;
    for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (clash(g[i], g[j])) n++;
    return n;
  };
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    outer: for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      for (const a of g) {
        const b = g.find((x) => x !== a && clash(a, x));
        if (!b) continue;
        for (const mover of [b, a]) {
          if (paired.has(mover)) continue;
          for (let hi = 0; hi < groups.length; hi++) {
            if (hi === gi) continue;
            for (const x of groups[hi]) {
              if (paired.has(x)) continue;
              if (!clean(groups[hi], mover, x) || !clean(g, x, mover)) continue;
              groups[hi][groups[hi].indexOf(x)] = mover;
              g[g.indexOf(mover)] = x;
              moved = true;
              break outer;
            }
          }
        }
      }
    }
    if (!moved) break;
  }
  return conflicts();
}


adminEvents.post(
  "/:id/groups/suggest",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const checked = await checkedInRegistrations(db, e.id);
    if (checked.length === 0) return refuse(c, e, t("ยังไม่มีใครเช็กอิน", "Nobody has checked in yet"), 409);

    const byAccount = new Map(checked.map((r) => [r.accountId, r]));
    const keepTogether: [string, string][] = [];
    for (const r of checked) {
      const other = r.plusOneWith ? byAccount.get(r.plusOneWith) : undefined;
      if (other && other.plusOneWith === r.accountId && r.accountId < other.accountId) keepTogether.push([r.accountId, other.accountId]);
    }
    // Profiles in slices, so no single query carries more ids than it can.
    const attendees = [];
    const now = new Date();
    // A demo account is never seated with real members (owner C2): at a real event they stay unplaced.
    const seatable = await realPeopleFor(db, e.hostAccountId ?? e.createdBy, checked.map((r) => r.accountId));
    for (const part of chunks(seatable, KEYSET_CHUNK)) attendees.push(...(await loadAttendees(db, part, now, e.id)));
    const result = suggestGroups(attendees, { seed: e.id, minSize: e.groupMin, maxSize: e.groupMax, keepTogether, romance: e.tags.includes(OPEN_TO_MORE_TAG) });
    const blockedMap = new Map(attendees.map((x) => [x.accountId, new Set(x.blocked)]));
    const blockedLeft = separateBlocked(result.groups, blockedMap, keepTogether);

    const queries: Parameters<typeof batchAll>[1] = [];
    // Clear old assignments (including anyone no longer checked in), then write 1..n.
    queries.push(db.update(registrations).set({ groupNo: null }).where(eq(registrations.eventId, e.id)));
    const placed = new Set<string>();
    const seats: [string, number][] = [];
    result.groups.forEach((members, i) => {
      for (const m of members) {
        const r = byAccount.get(m);
        if (!r) continue;
        placed.add(m);
        seats.push([r.id, i + 1]);
      }
    });
    // One update per WRITE_CHUNK people, each setting every seat in it.
    for (const part of chunks(seats)) {
      queries.push(
        db
          .update(registrations)
          .set({ groupNo: sql`case ${registrations.id} ${sql.join(part.map(([id, g]) => sql`when ${id} then ${g}::int`), sql` `)} end` })
          .where(inArray(registrations.id, part.map(([id]) => id))),
      );
    }
    // Suggested groups are a draft until the host publishes them again.
    queries.push(db.update(events).set({ groupsPublishedAt: null }).where(eq(events.id, e.id)));
    const m = result.metrics;
    queries.push(
      audit(db, me(c).id, "event.groups_suggest", { type: "event", id: e.id }, {
        groups: result.groups.length,
        attendees: checked.length,
        unplaced: checked.length - placed.size,
        blockingSwaps: m.blockingSwaps,
        isolated: m.isolated,
        blockedConflicts: blockedLeft,
      }),
    );
    await batchAll(c.env, queries);
    return c.redirect(
      `${BASE}/${e.id}?notice=groups_suggested&swaps=${m.blockingSwaps}&isolated=${m.isolated}&blocked=${blockedLeft}#groups`,
    );
  }, { roster: true }),
);

adminEvents.post(
  "/:id/groups/move",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const body = await c.req.parseBody();
    const regId = str(body.registrationId);
    const rawGroup = str(body.groupNo);
    const groupNo = rawGroup === "" ? null : intIn(rawGroup, 1, 99);
    if (rawGroup !== "" && groupNo === null) return refuse(c, e, t("เลขโต๊ะต้องอยู่ระหว่าง 1 ถึง 99", "Table number must be 1 to 99"));
    const [reg] = await db
      .select({
        id: registrations.id,
        accountId: registrations.accountId,
        groupNo: registrations.groupNo,
        status: registrations.status,
        checkedInAt: registrations.checkedInAt,
      })
      .from(registrations)
      .where(and(eq(registrations.id, regId), eq(registrations.eventId, e.id)))
      .limit(1);
    if (!reg || reg.status !== "confirmed" || !reg.checkedInAt) return refuse(c, e, t("ย้ายได้เฉพาะคนที่เช็กอินแล้ว", "Only checked-in attendees can be moved"), 404);
    // Hard rule (PRD §8.1): blocked pairs are never seated together, by hand
    // either. The refusal doesn't say who, or which way the block goes.
    if (groupNo !== null && groupNo !== reg.groupNo) {
      const mates = await db
        .select({ accountId: registrations.accountId })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, e.id),
            eq(registrations.status, "confirmed"),
            isNotNull(registrations.checkedInAt),
            eq(registrations.groupNo, groupNo),
            ne(registrations.id, reg.id),
          ),
        )
        .limit(500);
      const clash = await blockedAmong(db, reg.accountId, mates.map((m) => m.accountId));
      if (clash.size) {
        return refuse(c, e, t("ย้ายไปโต๊ะนี้ไม่ได้ เลือกโต๊ะอื่น", "This person can't be seated at that table. Choose another one"), 409);
      }
    }
    await batch(c.env, [
      db.update(registrations).set({ groupNo }).where(eq(registrations.id, reg.id)),
      audit(db, me(c).id, "event.group_move", { type: "registration", id: reg.id }, { eventId: e.id, from: reg.groupNo, to: groupNo }),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=saved#groups`);
  }, { roster: true }),
);

adminEvents.post(
  "/:id/groups/publish",
  withEvent(async (c, e, db) => {
    const { t } = view(c);
    const grouped = (await checkedInRegistrations(db, e.id)).filter((r) => r.groupNo != null);
    if (grouped.length === 0) return refuse(c, e, t("ยังไม่มีโต๊ะ กด 'แนะนำโต๊ะ' ก่อน", "No groups yet. Suggest groups first"), 409);
    await batchAll(c.env, [
      db.update(events).set({ groupsPublishedAt: new Date() }).where(eq(events.id, e.id)),
      audit(db, me(c).id, "event.groups_publish", { type: "event", id: e.id }, { notified: grouped.length }),
      ...notifyMany(
        db,
        grouped.map((r) => ({ accountId: r.accountId, th: `โต๊ะของคุณ: โต๊ะ ${r.groupNo}`, en: `Your group: group ${r.groupNo}` })),
        "group",
        `/events/${e.id}`,
      ),
    ]);
    return c.redirect(`${BASE}/${e.id}?notice=groups_published#groups`);
  }, { roster: true }),
);

