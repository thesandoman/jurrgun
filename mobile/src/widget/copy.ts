/**
 * The next-table widget's words and times, shared by the Android widget and the app (owner card S4).
 * Never a title, never the host, never the QR: "Jurrgun table", the time, and the place only when the
 * member turned it on for a table that may show one.
 */
export type WidgetData = {
  /** Epoch ms. */
  startsAt: number;
  endsAt: number;
  cancelled: number;
  /** Empty when hidden. */
  place: string;
  /** A site path, e.g. /me/events/abc/pass. */
  pass: string;
  lang: string;
};

const T = {
  th: { header: 'โต๊ะถัดไป', table: 'โต๊ะ Jurrgun', none: 'ยังไม่มีโต๊ะที่จองไว้', cancelled: 'โต๊ะนี้ยกเลิกแล้ว', today: 'วันนี้', tomorrow: 'พรุ่งนี้', started: 'เริ่มแล้ว' },
  en: { header: 'Your next table', table: 'Jurrgun table', none: 'No table booked yet', cancelled: 'This table is cancelled', today: 'Today', tomorrow: 'Tomorrow', started: 'Started' },
};
export const words = (lang: string) => (lang === 'en' ? T.en : T.th);

/** "เริ่มอีก 2 ชม. 15 นาที" / "Starts in 2 h 15 min"; days once it is a day or more away. */
export function countdown(startsAt: number, now: number, lang: string): string {
  const en = lang === 'en';
  const mins = Math.max(0, Math.round((startsAt - now) / 60_000));
  if (mins === 0) return words(lang).started;
  const d = Math.floor(mins / 1440);
  if (d >= 1) return en ? `Starts in ${d} ${d === 1 ? 'day' : 'days'}` : `เริ่มอีก ${d} วัน`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (en) return `Starts in ${h ? `${h} h ` : ''}${m} min`;
  return `เริ่มอีก ${h ? `${h} ชม. ` : ''}${m} นาที`;
}

/** "วันนี้ · 19:00", "พรุ่งนี้ · 19:00" or "ศ. 7 พ.ย. · 19:00", in Bangkok time. */
export function when(startsAt: number, now: number, lang: string): string {
  const tz = { timeZone: 'Asia/Bangkok' } as const;
  const loc = lang === 'en' ? 'en-GB' : 'th-TH';
  const time = new Intl.DateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(startsAt);
  const day = (t: number) => new Intl.DateTimeFormat('en-CA', tz).format(t);
  const w = words(lang);
  const label =
    day(startsAt) === day(now)
      ? w.today
      : day(startsAt) === day(now + 86_400_000)
        ? w.tomorrow
        : new Intl.DateTimeFormat(loc, { ...tz, weekday: 'short', day: 'numeric', month: 'short' }).format(startsAt);
  return `${label} · ${time}`;
}
