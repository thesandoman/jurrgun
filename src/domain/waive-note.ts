/**
 * Waiving a no-show strike (owner decision D1, 2026-10-30, "fixed reason +
 * note"): the member's data export shows both the reason and the note, so the
 * note must never name anyone else. Trust & Operations owns this check;
 * Privacy & Security owns the export.
 *
 * - WAIVE_REASONS is the fixed list the host or staff picks from.
 * - noteNamesSomeone refuses a note that names another person at the event
 *   (their nickname or @username), any @handle, or a phone number. Hosts are
 *   members, not trained staff, and a note written in the moment easily
 *   names the friend who vouched or the person someone came with.
 */

export const WAIVE_REASONS = [
  { value: "unwell", th: "ไม่สบายหรือมีเหตุฉุกเฉิน", en: "Unwell or an emergency" },
  { value: "travel", th: "ปัญหาการเดินทาง", en: "A travel or transport problem" },
  { value: "our_mistake", th: "ความผิดพลาดของโฮสต์หรือทีมงาน", en: "The host's or our mistake" },
  { value: "event_changed", th: "กิจกรรมมีการเปลี่ยนแปลง", en: "The event changed" },
  { value: "checked_in_late", th: "มาถึงแล้วแต่ไม่ได้เช็กอิน", en: "They came but weren't checked in" },
  { value: "other", th: "อื่น ๆ", en: "Other" },
] as const;

export type WaiveReason = (typeof WAIVE_REASONS)[number]["value"];
export const isWaiveReason = (v: string): v is WaiveReason => WAIVE_REASONS.some((r) => r.value === v);

export const WAIVE_NOTE_MAX = 200;

/** What the form says, and the refusal when a note names someone. */
export const WAIVE_NOTE_HINT: [string, string] = [
  "สมาชิกเห็นข้อความนี้ในข้อมูลของตัวเอง ห้ามเอ่ยชื่อ ช่องทางติดต่อ หรือเบอร์โทรของคนอื่น",
  "The member can see this in their own data. Don't name anyone else or give their contact or phone number.",
];
export const WAIVE_NOTE_REFUSED: [string, string] = [
  "บันทึกนี้เอ่ยถึงคนอื่น (ชื่อ ชื่อผู้ใช้ หรือเบอร์โทร) สมาชิกจะเห็นข้อความนี้ ลองเขียนใหม่โดยไม่ระบุตัวใคร",
  "This note names someone else (a name, username or phone number), and the member will see it. Rewrite it without naming anyone.",
];

const LATIN = /[a-z0-9]/i;
const PHONE = /(?:\+?66|0)[\s-]?\d(?:[\s-]?\d){7,8}/;
const HANDLE = /@[a-z0-9_.]{2,}/i;

/**
 * True when the note names one of `names` (other people at the event:
 * nicknames and usernames), or carries any @handle or phone number.
 * Latin names match as whole words, case-insensitive; Thai names (no spaces
 * between words) match anywhere. Names under 2 characters are ignored.
 */
export function noteNamesSomeone(note: string, names: readonly string[]): boolean {
  const text = note.normalize("NFC");
  if (HANDLE.test(text) || PHONE.test(text)) return true;
  const lower = text.toLowerCase();
  for (const raw of names) {
    const name = raw.normalize("NFC").trim().toLowerCase();
    if (name.length < 2) continue;
    if (LATIN.test(name)) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}($|[^\\p{L}\\p{N}_])`, "u").test(lower)) return true;
    } else if (lower.includes(name)) {
      return true;
    }
  }
  return false;
}
