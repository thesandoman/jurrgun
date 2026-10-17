/**
 * Host announcements on screen: the list at the top of the event page and on
 * the pass (newest first, Thai first), and the host's composer beside the
 * day-of controls. Calm: an open section with hairlines, a drawn icon and a
 * word for the kind, never colour alone.
 */
import { ANNOUNCE_MAX, ANNOUNCEMENT_KINDS, KIND_TEXT, isAnnouncementKind } from "../domain/announcements";
import { toBangkokInput } from "../domain/hosting";
import { fmtDate, fmtParts, type Lang } from "../lib/i18n";
import type { Announcement } from "../schema";
import { FactIcon } from "./kit";

type T = (th: string, en: string) => string;

/** Shown open; older ones fold away. */
const SHOWN = 2;

function Item(props: { t: T; lang: Lang; a: Announcement }) {
  const { t, lang, a } = props;
  if (!isAnnouncementKind(a.kind)) return null;
  const k = KIND_TEXT[a.kind];
  const d = a.detail ?? {};
  return (
    <li class={`ann-item ann-is-${a.kind}`}>
      <p class="ann-meta">
        <FactIcon name={k.icon} />
        <b>{t(k.th, k.en)}</b>
        <time datetime={a.createdAt.toISOString()}>{fmtDate(a.createdAt, lang)}</time>
      </p>
      {a.kind === "time" && d.startsAt && d.endsAt ? (
        <p class="ann-fact">
          {t("เวลาใหม่", "New time")} {fmtDate(d.startsAt, lang)} {t("ถึง", "to")} {fmtParts(d.endsAt, lang).time}
        </p>
      ) : null}
      {a.kind === "venue" && d.venueName ? (
        <p class="ann-fact">
          {t("ที่ใหม่", "New place")} {d.venueName}
          {d.venueAddress ? <span class="ann-addr"> {d.venueAddress}</span> : null}
          {d.mapUrl ? (
            <>
              {" "}
              <a href={d.mapUrl} target="_blank" rel="noopener noreferrer">
                {t("เปิดแผนที่", "Open map")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {a.body ? <p class="ann-body">{a.body}</p> : null}
    </li>
  );
}

/** "ประกาศ / Announcements": nothing at all when there are none. */
/** `shown`: how many stay open (the pass keeps one, so the QR stays near the top). */
export function AnnouncementList(props: { t: T; lang: Lang; items: Announcement[]; class?: string; shown?: number }) {
  const { t, lang, items } = props;
  if (!items.length) return null;
  const n = props.shown ?? SHOWN;
  const open = items.slice(0, n);
  const older = items.slice(n);
  return (
    <section class={["ann", props.class].filter(Boolean).join(" ")} aria-labelledby="ann-h">
      <h2 id="ann-h" class="ann-h">
        {t("ประกาศ", "Announcements")}
      </h2>
      <ol class="ann-list">
        {open.map((a) => (
          <Item t={t} lang={lang} a={a} />
        ))}
      </ol>
      {older.length ? (
        <details class="ann-older">
          <summary>{t(`ประกาศก่อนหน้า ${older.length} รายการ`, `${older.length} earlier`)}</summary>
          <ol class="ann-list">
            {older.map((a) => (
              <Item t={t} lang={lang} a={a} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

export type ComposerEvent = { id: string; startsAt: Date; endsAt: Date; venueName: string; venueAddress: string; mapUrl: string | null };

/**
 * The host's composer. The time and venue fields show only for their kind
 * (CSS :has, no script); the server checks everything again. Cancelling
 * asks for a tick first, because it can't be undone.
 */
export function AnnounceForm(props: { t: T; e: ComposerEvent; action: string; back: string; kind?: string; body?: string }) {
  const { t, e } = props;
  const p = `an-${e.id}`;
  const picked = props.kind && isAnnouncementKind(props.kind) ? props.kind : "update";
  const hint: Record<string, string> = {
    update: t("ส่งถึงคนที่ได้ที่แล้ว", "Goes to people with a seat"),
    time: t("ส่งถึงคนที่ได้ที่และคิวสำรองทันที", "Goes to seats and the waitlist at once"),
    venue: t("ส่งถึงคนที่ได้ที่และคิวสำรองทันที", "Goes to seats and the waitlist at once"),
    cancelled: t("ยกเลิกกิจกรรม คืนที่นั่งทุกที่ และบอกคิวสำรอง", "Cancels the event, gives back every seat and tells the waitlist"),
  };
  return (
    <form method="post" action={props.action} class="ann-form">
      <input type="hidden" name="back" value={props.back} />
      <fieldset class="ann-kinds">
        <legend>{t("ประกาศเรื่อง", "What's it about?")}</legend>
        {ANNOUNCEMENT_KINDS.map((k) => (
          <label class={`ann-kind ann-k-${k}`}>
            <input type="radio" name="kind" value={k} checked={picked === k} required />
            <span>
              <FactIcon name={KIND_TEXT[k].icon} /> {t(KIND_TEXT[k].th, KIND_TEXT[k].en)}
              <small>{hint[k]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div class="ann-time">
        <div class="grid2">
          <div class="field">
            <label for={`${p}-s`}>{t("เริ่มใหม่ (เวลากรุงเทพฯ)", "New start (Bangkok time)")}</label>
            <input id={`${p}-s`} type="datetime-local" name="startsAt" value={toBangkokInput(e.startsAt)} />
          </div>
          <div class="field">
            <label for={`${p}-e`}>{t("จบใหม่", "New end")}</label>
            <input id={`${p}-e`} type="datetime-local" name="endsAt" value={toBangkokInput(e.endsAt)} />
          </div>
        </div>
      </div>
      <div class="ann-venue">
        <div class="field">
          <label for={`${p}-v`}>{t("สถานที่ใหม่", "New venue")}</label>
          <input id={`${p}-v`} type="text" name="venueName" maxlength={200} value={e.venueName} />
        </div>
        <div class="field">
          <label for={`${p}-a`}>{t("ที่อยู่", "Address")}</label>
          <input id={`${p}-a`} type="text" name="venueAddress" maxlength={400} value={e.venueAddress} />
        </div>
        <div class="field">
          <label for={`${p}-m`}>{t("ลิงก์แผนที่ (ไม่บังคับ)", "Map link (optional)")}</label>
          <input id={`${p}-m`} type="url" name="mapUrl" maxlength={500} value={e.mapUrl ?? ""} placeholder="https://maps.google.com/…" />
        </div>
      </div>
      <div class="field">
        <label for={`${p}-b`}>{t("ข้อความ", "Message")}</label>
        <textarea id={`${p}-b`} name="body" rows={3} maxlength={ANNOUNCE_MAX} aria-describedby={`${p}-bh`}>
          {props.body ?? ""}
        </textarea>
        <small id={`${p}-bh`} class="hint">
          {t(`ไม่เกิน ${ANNOUNCE_MAX} ตัวอักษร ต้องใส่ถ้าเป็นอัปเดต`, `Up to ${ANNOUNCE_MAX} characters. Needed for an update`)}
        </small>
      </div>
      <label class="ann-confirm">
        <input type="checkbox" name="confirm" value="1" />
        <span>{t("ยืนยันว่ายกเลิกกิจกรรมนี้ ย้อนกลับไม่ได้", "Yes, cancel this event. This can't be undone")}</span>
      </label>
      <div class="row">
        <button type="submit" class="btn primary">
          {t("ส่งประกาศ", "Send announcement")}
        </button>
      </div>
    </form>
  );
}
