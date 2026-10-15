/**
 * Kaipa partner events in the UI: the Discover cards and the detail page.
 * Tickets are bought on Kaipa's page (new tab); nothing here takes payment.
 */
import type { PartnerEvent } from "../services/kaipa";
import type { Lang } from "../lib/i18n";
import { Card, Tag } from "./kit";

type T = (th: string, en: string) => string;

/** Date and time on the event's own clock, plus its zone when that isn't Bangkok. */
export function partnerWhen(e: PartnerEvent, lang: Lang): string {
  const tz = e.timezone || "UTC";
  let text: string;
  try {
    // Kaipa lists events months or years ahead: show the year unless it's this one.
    const otherYear = e.startsAt.getUTCFullYear() !== new Date().getUTCFullYear();
    text = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { weekday: "short", day: "numeric", month: "short", ...(otherYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", timeZone: tz }).format(e.startsAt);
  } catch {
    text = e.startsAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    return text;
  }
  return tz === "Asia/Bangkok" ? text : `${text} (${tz.replace(/_/g, " ")})`;
}

export function priceText(e: PartnerEvent, t: T): string {
  if (e.tickets.length === 0) return t("บัตรหมดหรือยังไม่เปิดขาย", "Not on sale");
  if (e.cheapest && e.hasFree) return t(`ฟรี หรือเริ่ม ${e.cheapest}`, `Free or from ${e.cheapest}`);
  if (e.cheapest) return t(`เริ่ม ${e.cheapest}`, `From ${e.cheapest}`);
  return t("ฟรี", "Free");
}

export function PartnerCard(props: { e: PartnerEvent; t: T; lang: Lang }) {
  const { e, t, lang } = props;
  return (
    <Card href={`/partner-events/kaipa/${e.id}`} class="ev-card pe-card">
      <div class="event-cover pe-cover">
        {e.poster ? <img src={e.poster} alt="" loading="lazy" style={`object-position:${e.posterFocus[0]}% ${e.posterFocus[1]}%`} /> : <span aria-hidden="true">🎟️</span>}
      </div>
      <div class="ev-body">
        <p class="eyebrow">{t("บัตรผ่าน Kaipa", "Tickets on Kaipa")}</p>
        <h3>{e.name}</h3>
        <p class="ev-line">
          {partnerWhen(e, lang)} · {[e.venue, e.city].filter(Boolean).join(", ")}
        </p>
        <div class="tags">
          <Tag tone={e.tickets.length ? "accent" : "muted"}>{priceText(e, t)}</Tag>
          {e.country !== "Thailand" ? <Tag tone="muted">🌏 {e.country}</Tag> : null}
        </div>
      </div>
    </Card>
  );
}

/** The Discover section: shown only when there is something to show. */
export function PartnerSection(props: { events: PartnerEvent[]; t: T; lang: Lang }) {
  const { events, t, lang } = props;
  if (events.length === 0) return null;
  return (
    <section class="pe-section" aria-label={t("กิจกรรมขายบัตรจากพาร์ตเนอร์", "Ticketed events from partners")}>
      <style dangerouslySetInnerHTML={{ __html: PARTNER_CSS }} />
      <h2 class="pe-h">🎟️ {t("กิจกรรมขายบัตรจาก Kaipa", "Ticketed events from Kaipa")}</h2>
      <p class="muted pe-note">{t("ซื้อบัตรบนเว็บของ Kaipa ไม่ใช่กิจกรรมกลุ่มเล็กของ Jurrgun", "Tickets are bought on Kaipa. These aren't Jurrgun small-group meet-ups.")}</p>
      {events.map((e) => (
        <div class="ev-item" data-s={`${e.name} ${e.venue} ${e.city}`.toLowerCase()}>
          <PartnerCard e={e} t={t} lang={lang} />
        </div>
      ))}
    </section>
  );
}

export function PartnerDetail(props: { e: PartnerEvent; t: T; lang: Lang }) {
  const { e, t, lang } = props;
  const end = e.endsAt
    ? (() => {
        try {
          const end = e.endsAt!;
          // Same day: just the time. Otherwise the date too (and the year if it changes).
          const tz = e.timezone || "UTC";
          const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
          const sameDay = day(end) === day(e.startsAt);
          const otherYear = end.getUTCFullYear() !== e.startsAt.getUTCFullYear();
          return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "th-TH", { ...(sameDay ? {} : { day: "numeric", month: "short" }), ...(otherYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", timeZone: tz }).format(end);
        } catch {
          return null;
        }
      })()
    : null;
  return (
    <article class="pe-detail">
      <style dangerouslySetInnerHTML={{ __html: PARTNER_CSS }} />
      <p>
        <a href="/events?view=list">← {t("กลับไปค้นหา", "Back to Discover")}</a>
      </p>
      {e.poster ? (
        <div class="pe-hero">
          <img src={e.poster} alt={t(`โปสเตอร์ ${e.name}`, `Poster for ${e.name}`)} style={`object-position:${e.posterFocus[0]}% ${e.posterFocus[1]}%`} />
        </div>
      ) : null}
      <p class="eyebrow">{t("บัตรผ่าน Kaipa", "Tickets on Kaipa")}</p>
      <h1>{e.name}</h1>
      <dl class="facts">
        <dt>{t("เมื่อไหร่", "When")}</dt>
        <dd>
          {partnerWhen(e, lang)}
          {end ? ` – ${end}` : ""}
        </dd>
        <dt>{t("ที่ไหน", "Where")}</dt>
        <dd>{[e.venue, e.address, e.city, e.country].filter(Boolean).join(", ")}</dd>
        {e.hostName ? (
          <>
            <dt>{t("ผู้จัด", "Host")}</dt>
            <dd>{e.hostName}</dd>
          </>
        ) : null}
        {e.performers.length ? (
          <>
            <dt>{t("ศิลปิน", "Line-up")}</dt>
            <dd>{e.performers.join(", ")}</dd>
          </>
        ) : null}
      </dl>

      <section class="card pe-tickets">
        <h2>{t("บัตร", "Tickets")}</h2>
        {e.tickets.length ? (
          <ul class="pe-ticket-list">
            {e.tickets.map((tk) => (
              <li>
                <span>
                  <strong>{tk.name}</strong>
                  {tk.description ? <small class="muted">{tk.description}</small> : null}
                </span>
                <b>{tk.free ? t("ฟรี", "Free") : tk.price}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">{t("ตอนนี้ไม่มีบัตรขาย", "No tickets on sale right now.")}</p>
        )}
        {e.addOns.length ? (
          <p class="muted">
            {t("เพิ่มเติม: ", "Extras: ")}
            {e.addOns.map((a) => `${a.name} (${a.price})`).join(", ")}
          </p>
        ) : null}
        {e.tickets.length ? (
          <a class="btn primary block" href={e.buyUrl} target="_blank" rel="noopener noreferrer">
            {t("ซื้อบัตรบน Kaipa ↗", "Get tickets on Kaipa ↗")}
          </a>
        ) : null}
        <p class="muted pe-note">{t("ราคารวมค่าธรรมเนียมแล้ว ชำระเงินและรับบัตรบนเว็บของ Kaipa", "Prices include fees. Payment and tickets are handled on Kaipa's site.")}</p>
      </section>

      {e.description ? (
        <section>
          <h2>{t("รายละเอียด", "About")}</h2>
          {e.description.split(/\n{2,}/).map((para) => (
            <p class="pe-desc">{para}</p>
          ))}
        </section>
      ) : null}
    </article>
  );
}

export const PARTNER_CSS = `
.pe-section{margin-top:28px}
.pe-h{margin:8px 0 2px;font-size:1.1rem}
.pe-note{margin:0 0 10px;font-size:.84rem}
.pe-cover img{width:100%;height:100%;object-fit:cover}
.pe-hero{margin:8px 0 14px;border-radius:var(--radius);overflow:hidden;max-height:340px}
.pe-hero img{width:100%;height:100%;max-height:340px;object-fit:cover;display:block}
.pe-tickets{margin:18px 0}
.pe-tickets h2{margin-top:0}
.pe-ticket-list{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px}
.pe-ticket-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}
.pe-ticket-list li span{display:flex;flex-direction:column}
.pe-desc{white-space:pre-line}
`;
