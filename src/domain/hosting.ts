/**
 * Community hosting (Phase 1): who may see, edit and publish an event, and the
 * checks on a member's event proposal. Pure: no database, no Hono.
 *
 * Shaped after studying Kaipa's partner API, with a few deliberate changes:
 *  - Kaipa publishes every new event at once. Here a member's event is a
 *    proposal (status "pending") until the team approves it; trusted hosts,
 *    partner admins and the Jurrgun team publish straight away.
 *  - Private events work like Kaipa's private links (an unguessable token in
 *    ?t=…, resettable by the host), but the host, staff and anyone already
 *    signed up keep access after a reset.
 *  - Times are typed in Bangkok time and stored as instants (no "UTC that is
 *    really local" fields).
 *  - Money never passes through Jurrgun: an event is free, or paid at the
 *    venue, or the host links their own payment page.
 */

export type Lang2 = { th: string; en: string };
export type Viewer = { id: string; role: string; partnerOrgId: string | null };
export type HostedEvent = {
  status: string;
  visibility: string;
  hostAccountId: string | null;
  createdBy: string;
  partnerOrgId: string | null;
  privateToken: string | null;
};

/** People who review member proposals. */
export const isReviewer = (role: string) => role === "bma_admin" || role === "moderator";

/** Staff who may host without member onboarding (they may not have a member profile). */
export const isStaffHost = (role: string) => role === "bma_admin" || role === "moderator" || role === "partner_admin";

/**
 * Who can host: members (once onboarded), moderators and admins.
 * Whose events publish without review: the Jurrgun team (admins and
 * moderators, who would otherwise review their own), partner admins, and
 * members marked trusted.
 */
export const canHost = (a: { role: string }, onboarded: boolean) => onboarded || isStaffHost(a.role);
export const publishesDirectly = (a: { role: string; trustedHost: boolean }) => a.trustedHost || isStaffHost(a.role);

/** The host, the member who proposed it, or a partner admin of its organisation. */
export function ownsEvent(e: HostedEvent, v: Viewer): boolean {
  if (e.hostAccountId === v.id || e.createdBy === v.id) return true;
  return v.role === "partner_admin" && !!v.partnerOrgId && e.partnerOrgId === v.partnerOrgId;
}

/** Constant-time compare, so the private link can't be guessed by timing. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * May this viewer open the event page?
 *  - public + published: everyone signed in
 *  - private + published: the private link, the host side, staff, or anyone already signed up
 *  - draft / pending / rejected: the host side and reviewers only
 *  - cancelled: the host side, reviewers, and people who had signed up
 */
export function canView(e: HostedEvent, v: Viewer, opts: { token?: string | null; registered?: boolean } = {}): boolean {
  const staff = isReviewer(v.role) || ownsEvent(e, v);
  if (e.status === "published") {
    if (e.visibility !== "private") return true;
    if (staff || opts.registered) return true;
    return !!e.privateToken && !!opts.token && sameSecret(opts.token, e.privateToken);
  }
  if (e.status === "cancelled") return staff || !!opts.registered;
  return staff;
}

/** A member may change their proposal while it is a draft, waiting, or sent back. */
export const memberCanEdit = (e: HostedEvent) => e.status === "draft" || e.status === "pending" || e.status === "rejected";

// ------------------------------------------------------------ proposal --

export type ProposalInput = {
  title: string;
  titleEn: string;
  description: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  district: string;
  capacity: string;
  ageMin: string;
  ageMax: string;
  languages: string[];
  costThb: string;
  paymentNote: string;
  paymentUrl: string;
  intensity: string;
  groupMin: string;
  groupMax: string;
  plusOneAllowed: boolean;
  tags: string[];
  visibility: string;
  accessibility: string;
  safetyInfo: string;
};

export type ProposalValues = {
  title: string;
  titleEn: string | null;
  description: string;
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  venueAddress: string;
  mapUrl: string | null;
  district: string;
  capacity: number;
  ageMin: number;
  ageMax: number;
  languages: string[];
  costThb: number;
  paymentNote: string | null;
  paymentUrl: string | null;
  intensity: string;
  groupMin: number;
  groupMax: number;
  plusOneAllowed: boolean;
  tags: string[];
  visibility: "public" | "private";
  accessibility: string;
  safetyInfo: string;
};

/** Members host smaller events than the team: up to 60 people. */
export const MEMBER_MAX_CAPACITY = 60;

const BKK = 7 * 3_600_000;
const toBkk = (d: Date) => new Date(d.getTime() + BKK).toISOString().slice(0, 16);
/** A datetime-local value typed in Bangkok time → the instant, or null. */
export function fromBangkok(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+07:00`);
  return Number.isNaN(d.getTime()) || toBkk(d) !== s ? null : d;
}
export const toBangkokInput = toBkk;

const intIn = (s: string, min: number, max: number): number | null => (/^\d+$/.test(s) && Number(s) >= min && Number(s) <= max ? Number(s) : null);

function httpsUrl(s: string, max = 500): string | null {
  if (!s || s.length > max) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Check a member's proposal. `allowed` carries the option lists from
 * src/lib/constants.ts so this stays free of app imports.
 */
export function checkProposal(
  d: ProposalInput,
  allowed: { districts: string[]; languages: string[]; intensity: string[]; tags: string[] },
  now = new Date(),
): { values: ProposalValues | null; errors: Lang2[] } {
  const errors: Lang2[] = [];
  const need = (ok: boolean, th: string, en: string) => {
    if (!ok) errors.push({ th, en });
  };
  need(d.title.length >= 3 && d.title.length <= 120, "ชื่อกิจกรรม 3–120 ตัวอักษร", "The title must be 3 to 120 characters.");
  need(d.titleEn.length <= 120, "ชื่อภาษาอังกฤษไม่เกิน 120 ตัวอักษร", "The English title is at most 120 characters.");
  need(d.description.length >= 20 && d.description.length <= 4000, "เล่ารายละเอียดอย่างน้อย 20 ตัวอักษร (ไม่เกิน 4,000)", "Describe the event in at least 20 characters (at most 4,000).");

  const startsAt = fromBangkok(d.startsAt);
  const endsAt = fromBangkok(d.endsAt);
  need(!!startsAt && startsAt.getTime() > now.getTime() + 3_600_000, "เวลาเริ่มต้องอยู่ในอนาคต (อย่างน้อย 1 ชั่วโมงจากนี้)", "The start must be at least an hour from now.");
  need(!!startsAt && startsAt.getTime() < now.getTime() + 180 * 86_400_000, "จัดล่วงหน้าได้ไม่เกิน 6 เดือน", "Events can be at most six months ahead.");
  need(!!startsAt && !!endsAt && endsAt > startsAt && endsAt.getTime() - startsAt.getTime() <= 12 * 3_600_000, "เวลาจบต้องหลังเวลาเริ่ม และยาวไม่เกิน 12 ชั่วโมง", "The end must be after the start, and at most 12 hours later.");

  need(d.venueName.length >= 2 && d.venueName.length <= 200, "ระบุสถานที่", "Add the venue.");
  need(d.venueAddress.length <= 400, "ที่อยู่ไม่เกิน 400 ตัวอักษร", "The address is at most 400 characters.");
  const mapUrl = d.mapUrl ? httpsUrl(d.mapUrl) : null;
  need(!d.mapUrl || !!mapUrl, "ลิงก์แผนที่ต้องขึ้นต้นด้วย https://", "The map link must start with https://");
  need(allowed.districts.includes(d.district), "เลือกเขต", "Choose a district.");

  const capacity = intIn(d.capacity, 2, MEMBER_MAX_CAPACITY);
  need(capacity !== null, `จำนวนที่นั่ง 2–${MEMBER_MAX_CAPACITY}`, `Capacity must be 2 to ${MEMBER_MAX_CAPACITY}.`);
  const ageMin = intIn(d.ageMin, 18, 99);
  const ageMax = intIn(d.ageMax, 18, 99);
  need(ageMin !== null && ageMax !== null && ageMin <= ageMax, "ช่วงอายุ 18–99", "The age range must be 18 to 99.");
  need(d.languages.length > 0 && d.languages.every((l) => allowed.languages.includes(l)), "เลือกภาษาอย่างน้อย 1 ภาษา", "Choose at least one language.");

  const costThb = intIn(d.costThb || "0", 0, 20_000);
  need(costThb !== null, "ค่าใช้จ่าย 0–20,000 บาท", "The cost must be 0 to 20,000 baht.");
  need(d.paymentNote.length <= 500, "รายละเอียดการชำระเงินไม่เกิน 500 ตัวอักษร", "Payment details are at most 500 characters.");
  const paymentUrl = d.paymentUrl ? httpsUrl(d.paymentUrl) : null;
  need(!d.paymentUrl || !!paymentUrl, "ลิงก์ชำระเงินต้องขึ้นต้นด้วย https://", "The payment link must start with https://");
  need(!(costThb === 0 && (paymentUrl || d.paymentNote)), "กิจกรรมฟรีไม่ต้องใส่ข้อมูลการชำระเงิน", "A free event doesn't need payment details.");

  need(allowed.intensity.includes(d.intensity), "เลือกระดับความคึกคัก", "Choose a social intensity.");
  const groupMin = intIn(d.groupMin, 2, 12);
  const groupMax = intIn(d.groupMax, 2, 12);
  need(groupMin !== null && groupMax !== null && groupMin <= groupMax, "ขนาดกลุ่ม 2–12", "Group size must be 2 to 12.");
  need(d.tags.length <= 6 && d.tags.every((x) => allowed.tags.includes(x)), "เลือกหมวดได้ไม่เกิน 6", "Pick up to 6 categories.");
  need(d.visibility === "public" || d.visibility === "private", "เลือกว่าใครเห็นกิจกรรมนี้", "Choose who can see this event.");
  need(d.accessibility.length <= 1000 && d.safetyInfo.length <= 1000, "ข้อมูลการเข้าถึง/ความปลอดภัยไม่เกิน 1,000 ตัวอักษร", "Accessibility and safety notes are at most 1,000 characters.");

  if (errors.length) return { values: null, errors };
  return {
    errors,
    values: {
      title: d.title,
      titleEn: d.titleEn || null,
      description: d.description,
      startsAt: startsAt!,
      endsAt: endsAt!,
      venueName: d.venueName,
      venueAddress: d.venueAddress,
      mapUrl,
      district: d.district,
      capacity: capacity!,
      ageMin: ageMin!,
      ageMax: ageMax!,
      languages: d.languages,
      costThb: costThb!,
      paymentNote: d.paymentNote || null,
      paymentUrl,
      intensity: d.intensity,
      groupMin: groupMin!,
      groupMax: groupMax!,
      plusOneAllowed: d.plusOneAllowed,
      tags: d.tags,
      visibility: d.visibility as "public" | "private",
      accessibility: d.accessibility,
      safetyInfo: d.safetyInfo,
    },
  };
}
