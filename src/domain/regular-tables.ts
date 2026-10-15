/**
 * Regular tables (โต๊ะประจำ): the recurring group a Table Host (เจ้าภาพโต๊ะ,
 * role `circle_head`) leads. Pure rules, no database: who may join, who sees
 * what. Routes in src/routes/tables.tsx apply them.
 *
 *  - A member joins through the host's invite link, or after a hangout they
 *    went to with the host. Anyone can leave at any time.
 *  - At most MAX_MEMBERS members, not counting the host.
 *  - A blocked pair never sits at the same table: someone with a block either
 *    way with the host or a current member can't join, and a table whose host
 *    they blocked (or who blocked them) is hidden from them.
 *  - A women-only table takes women and non-binary members only, and only a
 *    woman or non-binary host can make a table women-only.
 */
import { isWoman, womenOnlyEventVisible, WOMEN_ONLY_TAG } from "./rules";

export const MAX_MEMBERS = 30;
export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 200;

export type JoinRefusal = "full" | "blocked" | "women_only" | "no_invite" | "archived" | "host";

/**
 * May this member join? `invited` is a valid invite link or a hangout they
 * went to with the host. `blocked` is a block either way with the host or any
 * current member.
 */
export function canJoin(ctx: {
  archived: boolean;
  isHost: boolean;
  invited: boolean;
  blocked: boolean;
  womenOnly: boolean;
  viewer: { gender?: string | null };
  memberCount: number;
}): { ok: true } | { ok: false; reason: JoinRefusal } {
  if (ctx.archived) return { ok: false, reason: "archived" };
  if (ctx.isHost) return { ok: false, reason: "host" };
  if (ctx.blocked) return { ok: false, reason: "blocked" };
  if (ctx.womenOnly && !isWoman(ctx.viewer)) return { ok: false, reason: "women_only" };
  if (!ctx.invited) return { ok: false, reason: "no_invite" };
  if (ctx.memberCount >= MAX_MEMBERS) return { ok: false, reason: "full" };
  return { ok: true };
}

/**
 * Is the table shown to this viewer at all? Hidden when a block stands
 * between them and the host, and (like women-only events) from members who
 * said they are not a woman or non-binary.
 */
export const tableVisible = (t: { womenOnly: boolean }, viewer: { gender?: string | null }, blockedWithHost: boolean) =>
  !blockedWithHost && womenOnlyEventVisible(t.womenOnly ? [WOMEN_ONLY_TAG] : [], viewer);

/** Only a woman or non-binary host may make their table women-only. */
export const canSetWomenOnly = (host: { gender?: string | null }) => isWoman(host);

/** Did this member go to a hangout with the host? A confirmed seat at one of the host's events that has started. */
export const attendedWithHost = (regs: { status: string; startsAt: Date }[], now = new Date()) =>
  regs.some((r) => r.status === "confirmed" && r.startsAt.getTime() <= now.getTime());

export const JOIN_TEXT: Record<JoinRefusal, { th: string; en: string }> = {
  full: { th: `โต๊ะนี้เต็มแล้ว (${MAX_MEMBERS} คน)`, en: `This regular table is full (${MAX_MEMBERS} people).` },
  blocked: { th: "เข้าร่วมโต๊ะนี้ไม่ได้", en: "You can't join this regular table." },
  women_only: { th: "โต๊ะนี้สำหรับผู้หญิงและคนนอนไบนารีเท่านั้น", en: "This regular table is for women and non-binary people." },
  no_invite: { th: "เข้าร่วมได้ผ่านลิงก์ชวนจากเจ้าภาพโต๊ะ หรือหลังไปแฮงเอาต์ด้วยกันแล้ว", en: "Join with the Table Host's invite link, or after a hangout with them." },
  archived: { th: "โต๊ะประจำนี้ปิดแล้ว", en: "This regular table has closed." },
  host: { th: "คุณเป็นเจ้าภาพโต๊ะนี้อยู่แล้ว", en: "You're already this table's host." },
};
