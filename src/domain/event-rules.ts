/**
 * Event entry rules and partner collabs (owner decisions D51 to D61). Pure:
 * no database, no Hono.
 *
 *  - D51, D55: health and public-sector partners are set up by an admin only;
 *    health events are information only (no price, no ticket or payment link).
 *  - D52: private talk mode, for health talks.
 *  - D53, D54: collab events and who may co-host with whom.
 *  - D56: open entry.
 *  - D57: organiser approval, verified groups by join code, bring or know before.
 *    A 💘 event is never limited to a group (owner P2, 2026-10-26), so nobody's
 *    dating is tied to their university, club or workplace.
 *  - D58, D59: alcohol served (the event becomes 20+) and smoking area.
 *  - D61: the disclaimer a member ticks before booking.
 */

import { OPEN_TO_MORE_TAG } from "./rules";

export type Lang2 = { th: string; en: string };

/** Thailand's legal drinking age (D58). */
export const DRINKING_AGE = 20;
/** At most this many co-hosts besides the lead partner (D53). */
export const MAX_COHOSTS = 2;
/** Partners see a private talk's numbers only from this many people up (D52). */
export const TALK_TOTALS_MIN = 10;
export const REQUIREMENTS_MAX = 5;
export const REQUIREMENT_MAX_CHARS = 120;
export const GROUP_LABEL_MAX = 80;
export const TALK_QUESTION_MAX = 500;
/** Anonymous questions one member may ask at one talk. */
export const TALK_QUESTIONS_PER_MEMBER = 3;

/** Partner types only an admin can set up, never through the apply form (D51, D55). */
export const ADMIN_ONLY_KINDS = ["health", "public_sector"] as const;
export const isAdminOnlyKind = (kind: string | null | undefined) => !!kind && (ADMIN_ONLY_KINDS as readonly string[]).includes(kind);

// --------------------------------------------------------------- input --

export type EventRulesInput = {
  alcoholServed?: boolean;
  smokingArea?: boolean;
  openEntry?: boolean;
  talkMode?: boolean;
  approvalRequired?: boolean;
  /** One requirement per line. */
  requirements?: string;
  groupLabel?: string;
  groupJoinCode?: string;
  /** The event's categories as typed; a dating partner's events count as 💘 whatever is typed. */
  tags?: string[];
};

/** The refusal when a join-code group meets 💘 (on the form, or a dating co-host joining). */
export const LOVE_GROUP_REFUSAL: Lang2 = {
  th: "กิจกรรม 💘 จำกัดเฉพาะกลุ่มด้วยรหัสเข้าร่วมไม่ได้ เพื่อไม่ให้เรื่องเดตผูกกับมหาวิทยาลัย ชมรม หรือที่ทำงานของใคร",
  en: "A 💘 event can't be limited to a group with a join code, so nobody's dating is tied to their university, club or workplace.",
};

export type EventRules = {
  alcoholServed: boolean;
  smokingArea: boolean;
  openEntry: boolean;
  talkMode: boolean;
  approvalRequired: boolean;
  requirements: string[];
  groupLabel: string | null;
  groupJoinCode: string | null;
};

const JOIN_CODE_RE = /^[A-Za-z0-9-]{4,24}$/;

/** Join codes are compared without case or spaces. */
export const normalizeJoinCode = (s: string) => s.trim().replace(/\s+/g, "").toUpperCase();

/**
 * Check the entry rules of an event. `ctx` says who is posting: only a health
 * partner or an admin may run a private talk, and a health event never
 * carries a price or a ticket link.
 */
export function checkEventRules(
  d: EventRulesInput,
  ctx: { partnerKind?: string | null; isAdmin?: boolean; costThb?: number; hasPaymentOrTicketLink?: boolean },
): { values: EventRules; errors: Lang2[] } {
  const errors: Lang2[] = [];
  const need = (ok: boolean, th: string, en: string) => {
    if (!ok) errors.push({ th, en });
  };
  const requirements = (d.requirements ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  need(requirements.length <= REQUIREMENTS_MAX, `สิ่งที่ต้องรู้ก่อนจองได้ไม่เกิน ${REQUIREMENTS_MAX} ข้อ`, `Up to ${REQUIREMENTS_MAX} things to bring or know.`);
  need(
    requirements.every((r) => r.length <= REQUIREMENT_MAX_CHARS),
    `แต่ละข้อยาวไม่เกิน ${REQUIREMENT_MAX_CHARS} ตัวอักษร`,
    `Each thing to bring or know is at most ${REQUIREMENT_MAX_CHARS} characters.`,
  );

  const groupLabel = (d.groupLabel ?? "").trim();
  const code = normalizeJoinCode(d.groupJoinCode ?? "");
  need(groupLabel.length <= GROUP_LABEL_MAX, `ชื่อกลุ่มยาวไม่เกิน ${GROUP_LABEL_MAX} ตัวอักษร`, `The group name is at most ${GROUP_LABEL_MAX} characters.`);
  need(!code || JOIN_CODE_RE.test(code), "รหัสเข้าร่วมใช้ตัวอักษรอังกฤษ ตัวเลข หรือขีด 4 ถึง 24 ตัว", "The join code is 4 to 24 letters, numbers or dashes.");
  need(!code || !!groupLabel, "ใส่ด้วยว่ากิจกรรมนี้สำหรับกลุ่มไหน", "Say who the event is for, alongside the join code.");
  need(!groupLabel || !!code, "ใส่รหัสเข้าร่วมให้กลุ่มนี้ด้วย", "Add a join code for this group.");
  // Women-only and LGBTQ+ community tags stay allowed on 💘: they're safety opt-ins, not closed groups.
  const love = (d.tags ?? []).includes(OPEN_TO_MORE_TAG) || ctx.partnerKind === "dating";
  need(!(love && (code || groupLabel)), LOVE_GROUP_REFUSAL.th, LOVE_GROUP_REFUSAL.en);

  const talkMode = !!d.talkMode;
  const health = ctx.partnerKind === "health";
  need(!talkMode || health || !!ctx.isAdmin, "โหมดพูดคุยส่วนตัวใช้ได้เฉพาะพาร์ทเนอร์ด้านสุขภาพ", "Private talk mode is for health partners only.");
  if (health) {
    need((ctx.costThb ?? 0) === 0 && !ctx.hasPaymentOrTicketLink, "กิจกรรมด้านสุขภาพต้องฟรี และไม่มีลิงก์ขายหรือจ่ายเงิน", "Health events are free, with no ticket or payment link.");
  }

  return {
    errors,
    values: {
      alcoholServed: !!d.alcoholServed,
      smokingArea: !!d.smokingArea,
      openEntry: !!d.openEntry,
      talkMode,
      approvalRequired: !!d.approvalRequired,
      requirements,
      groupLabel: code ? groupLabel : null,
      groupJoinCode: code || null,
    },
  };
}

/** An event serving alcohol is at least 20+ (D58). */
export const effectiveAgeMin = (ageMin: number, alcoholServed: boolean) => (alcoholServed ? Math.max(ageMin, DRINKING_AGE) : ageMin);

/** Tags that mean physical activity, for the disclaimer (D61). */
const ACTIVE_TAGS = ["run", "walk"];

/** Does booking need the ticked disclaimer (D61)? Alcohol, an age limit above 18, physical activity, or requirements. */
export function needsDisclaimer(e: { alcoholServed: boolean; ageMin: number; tags: string[]; requirements: string[] }): boolean {
  return e.alcoholServed || e.ageMin > 18 || e.tags.some((t) => ACTIVE_TAGS.includes(t)) || e.requirements.length > 0;
}

/** Constant-time compare of two join codes, after normalising. */
export function joinCodeMatches(typed: string, expected: string | null): boolean {
  if (!expected) return true;
  const a = normalizeJoinCode(typed);
  const b = normalizeJoinCode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------- collabs --

/**
 * May these partner types share one event (D54)? `kinds` lists the lead and
 * every co-host. Dating may mix with anything except health and public
 * sector (and the event then sits behind the opt-in); health only with
 * community, venue or public sector; public sector never with dating.
 */
export function collabMixRefusal(kinds: string[]): Lang2 | null {
  const has = (k: string) => kinds.includes(k);
  if (has("health") && kinds.some((k) => k !== "health" && !["community", "venue", "public_sector"].includes(k))) {
    return {
      th: "พาร์ทเนอร์ด้านสุขภาพจัดร่วมได้เฉพาะกับชุมชน สถานที่ หรือหน่วยงานรัฐ",
      en: "Health partners can only co-host with community, venue or public-sector partners.",
    };
  }
  if (has("public_sector") && has("dating")) {
    return { th: "หน่วยงานรัฐจัดร่วมกับแอปเดตไม่ได้", en: "Public-sector partners can't co-host with dating partners." };
  }
  return null;
}

/** A collab with any dating partner is a 💘 event (D54). */
export const collabIsDating = (kinds: string[]) => kinds.includes("dating");

/** Only accepted co-hosts are named; an event with a pending invite stays off Discover (D53). */
export const collabReady = (cohosts: { status: string }[]) => cohosts.every((c) => c.status !== "invited");

// ------------------------------------------------------------ privacy --

/** What a partner may see of a count at a private talk (D52): the number from 10 up, otherwise nothing. */
export const talkSafeCount = (talkMode: boolean, n: number): number | null => (talkMode && n < TALK_TOTALS_MIN ? null : n);
