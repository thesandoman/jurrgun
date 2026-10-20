/**
 * Going together to an outside event (D45, owner cards 2026-10-20), and the
 * online hello before an in-person event (D50).
 *
 *   ViaLine       on the Discover card: "Via Ticketmelon · meet at Café X"
 *                 (the card is one link, so the ticket link lives on the event page)
 *   ShowLine      under the event page's facts: the outside event's own time and place
 *   TicketButton  next to Directions: the source's own ticket page, payment stays there
 *   WarmupLine    event page and pass, confirmed seats only, until it starts
 */
import type { Event } from "../schema";
import { fmtParts, type Lang } from "../lib/i18n";
import { LinkButton } from "./kit";

type T = (th: string, en: string) => string;

export const isGoTogether = (e: Pick<Event, "sourceName">) => !!e.sourceName;

export function ViaLine(props: { e: Event; t: T }) {
  const { e, t } = props;
  if (!e.sourceName) return null;
  return (
    <p class="ev-via">
      <span aria-hidden="true">🎟</span> {t(`ผ่าน ${e.sourceName}`, `Via ${e.sourceName}`)} · {t(`นัดเจอที่ ${e.venueName}`, `meet at ${e.venueName}`)}
    </p>
  );
}

export function ShowLine(props: { e: Event; t: T; lang: Lang }) {
  const { e, t, lang } = props;
  if (!e.sourceName || (!e.sourceStartsAt && !e.sourceVenue)) return null;
  const time = e.sourceStartsAt ? fmtParts(e.sourceStartsAt, lang).time : null;
  const text = [time, e.sourceVenue].filter(Boolean).join(t(" ที่ ", " at "));
  return <p class="ev-line ev-show">{t(`ตัวงาน: ${text}`, `The show: ${text}`)}</p>;
}

export function TicketButton(props: { e: Event; t: T }) {
  const { e, t } = props;
  if (!e.sourceName || !e.sourceUrl) return null;
  return (
    <LinkButton kind="tonal" href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
      <span aria-hidden="true">🎟</span> {t(`บัตรที่ ${e.sourceName} ↗`, `Ticket on ${e.sourceName} ↗`)}
    </LinkButton>
  );
}

export function TicketNote(props: { e: Event; t: T }) {
  const { e, t } = props;
  if (!e.sourceName) return null;
  return (
    <p class="muted ev-ticket-note">
      {t("ทุกคนซื้อบัตรเองที่นั่น ที่นั่งที่โต๊ะจองที่นี่", "Everyone buys their own ticket there. Your seat at the table is booked here.")}
      {e.sourceCredit && e.sourceCredit !== e.sourceName ? ` ${t(`ข้อมูลจาก ${e.sourceCredit}`, `Details from ${e.sourceCredit}.`)}` : ""}
    </p>
  );
}

/** Only for a confirmed seat, before the event starts. */
export function WarmupLine(props: { e: Event; t: T; confirmed: boolean; now: Date }) {
  const { e, t } = props;
  if (!e.warmupUrl || !props.confirmed || props.now >= e.startsAt) return null;
  return (
    <p class="ev-warmup">
      <span aria-hidden="true">👋</span>
      <a href={e.warmupUrl} target="_blank" rel="noopener noreferrer nofollow">
        {t("ทักทายออนไลน์ก่อนวันงาน: ทักโต๊ะของคุณก่อน ↗", "Online hello before the day: say hi to your table first ↗")}
      </a>
    </p>
  );
}
