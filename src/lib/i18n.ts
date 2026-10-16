/**
 * Thai-first, English-ready (PRD §16). Strings live next to where they are
 * used as `t("ไทย", "English")` pairs rather than in a separate dictionary,
 * so a page can never show a missing key.
 */
export type Lang = "th" | "en";

export type T = (th: string, en: string) => string;

export function tr(lang: Lang): T {
  return (th, en) => (lang === "en" ? en : th);
}

export function pickLang(raw: string | undefined | null): Lang {
  return raw === "en" ? "en" : "th";
}

/**
 * First visit, no choice made yet: read the browser's Accept-Language (Task 10).
 * Thai anywhere in the list means Thai (many Thai phones run an English UI with
 * Thai second). No Thai at all means English. No header at all stays Thai, the
 * default. The visitor can always switch, and that choice is remembered.
 */
export function langFromHeader(header: string | undefined | null): Lang {
  if (!header) return "th";
  const tags = header.split(",").map((part) => part.trim().split(";")[0].toLowerCase()).filter(Boolean);
  if (!tags.length || tags[0] === "*") return "th";
  return tags.some((tag) => tag === "th" || tag.startsWith("th-")) ? "th" : "en";
}

/** For `{ th, en }` objects stored in data (pulse questions, constants). */
export function L(lang: Lang, text: { th: string; en: string }): string {
  return lang === "en" ? text.en : text.th;
}

export function fmtDate(iso: Date | string, lang: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** "October 2026" / "ตุลาคม 2569" in Bangkok time: a month heading. */
export function fmtMonth(iso: Date | string, lang: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(d);
}

/** Bangkok-time pieces for a date block: day of month, short weekday, HH:MM. */
export function fmtParts(iso: Date | string, lang: Lang): { day: string; weekday: string; time: string } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const locale = lang === "en" ? "en-GB" : "th-TH";
  const tz = "Asia/Bangkok";
  return {
    day: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: tz }).format(d),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d),
  };
}

export function fmtDay(iso: Date | string, lang: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(d);
}
