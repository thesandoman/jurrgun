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

export function fmtDay(iso: Date | string, lang: Lang): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(d);
}
