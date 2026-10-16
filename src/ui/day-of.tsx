/**
 * Day-of status and finding the table (owner-approved 10-16): the pieces the
 * event page, the pass, the offline card, the group chat and the host tools
 * share. Calm on purpose: one line, words first, a small drawn icon, never
 * colour alone.
 */
import type { Child } from "hono/jsx";
import { DAY_NOTE_MAX, DAY_STATUS_TEXT, DAY_STATUSES, ETA_TEXT, type EtaStatus, type ShownStatus } from "../domain/day-of";
import { stationLine, stationsByLine, WALK_MAX } from "../content/stations";
import { VENUE_NOTES_MAX } from "../domain/hosting";
import { fmtParts, type Lang } from "../lib/i18n";
import { FactIcon, Field, TextArea, type View } from "./kit";

type T = (th: string, en: string) => string;

/** "Host update 18:05: Starting a little late. Grab a drink at the bar". One line at the top. */
export function DayStatusLine(props: { t: T; lang: Lang; shown: ShownStatus | null; class?: string }) {
  const { t, lang, shown } = props;
  if (!shown) return null;
  const text = DAY_STATUS_TEXT[shown.status];
  const icon = text.icon as "check" | "time" | "place" | "pause";
  return (
    <p class={`day-status ds-${shown.status}${props.class ? ` ${props.class}` : ""}`} role="status">
      <FactIcon name={icon} />
      <span>
        <small class="ds-who">
          {t("โฮสต์อัปเดต", "Host update")} {fmtParts(shown.at, lang).time}
        </small>{" "}
        <b>{t(text.th, text.en)}</b>
        {shown.note ? <span class="ds-note"> {shown.note}</span> : null}
      </span>
    </p>
  );
}

/** "BTS อโศก เดิน 5 นาที" with a drawn train. */
export function StationFact(props: { lang: Lang; station: string | null; walk: number | null }) {
  const line = stationLine(props.station, props.walk, props.lang);
  if (!line) return null;
  return (
    <span class="station-fact">
      <FactIcon name="train" /> {line}
    </span>
  );
}

/** How to find the table, in the reader's language (Thai when there is no English). */
export function venueNotesFor(e: { venueNotes: string | null; venueNotesEn: string | null }, lang: Lang): string | null {
  return (lang === "en" ? e.venueNotesEn || e.venueNotes : e.venueNotes || e.venueNotesEn) || null;
}

/** "Finding the table": the station and the host's notes, when there are any. */
export function FindTheTable(props: {
  t: T;
  lang: Lang;
  e: { venueNotes: string | null; venueNotesEn: string | null; nearestStation: string | null; walkMinutes: number | null };
  /** Inside a list that already names it (the offline pass card): no heading of its own. */
  bare?: boolean;
}) {
  const { t, lang, e } = props;
  const notes = venueNotesFor(e, lang);
  const station = stationLine(e.nearestStation, e.walkMinutes, lang);
  if (!notes && !station) return null;
  return (
    <div class="find-table">
      {props.bare ? null : (
        <p class="ft-h">
          <b>{t("วิธีหาโต๊ะ", "Finding the table")}</b>
        </p>
      )}
      {station ? (
        <p class="ft-line">
          <FactIcon name="train" /> <span>{station}</span>
        </p>
      ) : null}
      {notes ? <p class="ft-notes">{notes}</p> : null}
    </div>
  );
}

/** Host form fields: Thai notes, optional English notes, the station picker and the walk. */
export function VenueFields(props: { v: View; d: { venueNotes?: string; venueNotesEn?: string; nearestStation?: string; walkMinutes?: string } }) {
  const { t, lang } = props.v;
  const d = props.d;
  let picked = false;
  return (
    <fieldset class="choices venue-extras">
      <legend>{t("วิธีหาโต๊ะ (ไม่บังคับ)", "Finding the table (optional)")}</legend>
      <TextArea
        label={t("บอกทางถึงโต๊ะ (ไทย)", "How to find the table (Thai)")}
        name="venueNotes"
        value={d.venueNotes ?? ""}
        maxlength={VENUE_NOTES_MAX}
        rows={2}
        hint={t("เช่น ชั้น 2 โต๊ะยาวข้างหน้าต่าง มองหาป้าย Jurrgun", "For example: 2nd floor, the long table by the window, look for the Jurrgun sign")}
      />
      <TextArea label={t("บอกทางถึงโต๊ะ (อังกฤษ ไม่บังคับ)", "How to find the table (English, optional)")} name="venueNotesEn" value={d.venueNotesEn ?? ""} maxlength={VENUE_NOTES_MAX} rows={2} />
      <div class="grid2">
        <div class="field">
          <label for="f-nearestStation">{t("สถานีที่ใกล้ที่สุด", "Nearest station")}</label>
          <select id="f-nearestStation" name="nearestStation">
            <option value="">{t("ไม่มี หรือไม่ระบุ", "None, or not sure")}</option>
            {stationsByLine().map((g) => (
              <optgroup label={lang === "en" ? g.en : g.th}>
                {g.stations.map((s) => {
                  // An interchange is listed under each of its lines: mark it chosen once.
                  const sel = !picked && s.key === d.nearestStation;
                  if (sel) picked = true;
                  return (
                    <option value={s.key} selected={sel}>
                      {lang === "en" ? s.en : s.th}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <Field
          label={t("เดินจากสถานี (นาที)", "Walk from the station (minutes)")}
          name="walkMinutes"
          type="number"
          min={0}
          max={WALK_MAX}
          value={d.walkMinutes ?? ""}
        />
      </div>
    </fieldset>
  );
}

/** An attendee's "running late" / "on my way", only on the day. */
export function EtaBox(props: { t: T; eventId: string; current: EtaStatus | null; next: string }) {
  const { t, eventId, current } = props;
  return (
    <form method="post" action={`/events/${eventId}/eta`} class="eta-box">
      <input type="hidden" name="next" value={props.next} />
      <p class="eta-q">
        {current
          ? current === "running_late"
            ? t("บอกโฮสต์แล้วว่าคุณจะไปสายนิดหน่อย", "Your host knows you're running a little late.")
            : t("บอกโฮสต์แล้วว่าคุณกำลังไป", "Your host knows you're on your way.")
          : t("บอกโฮสต์สั้น ๆ ได้ ไม่ต้องพิมพ์", "Let your host know, no typing needed.")}
      </p>
      <div class="eta-btns">
        {(["on_my_way", "running_late"] as const).map((k) => (
          <button type="submit" name="eta" value={k} class={`btn ${current === k ? "primary" : "ghost"}`} aria-pressed={current === k ? "true" : "false"}>
            {current === k ? "✓ " : ""}
            {t(ETA_TEXT[k].th, ETA_TEXT[k].en)}
          </button>
        ))}
        {current ? (
          <button type="submit" name="eta" value="clear" class="btn ghost">
            {t("ยกเลิก", "Undo")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** What the host sees: who's late and who's on the way, by first name. */
export function EtaSummary(props: { t: T; late: string[]; onWay: string[] }) {
  const { t, late, onWay } = props;
  if (!late.length && !onWay.length) return <p class="muted eta-sum">{t("ยังไม่มีใครบอกว่าจะสาย", "Nobody has said they're running late.")}</p>;
  return (
    <ul class="eta-sum">
      {late.length ? (
        <li>
          <b>{t(`ไปสาย ${late.length} คน`, `Running late (${late.length})`)}</b>: {late.join(", ")}
        </li>
      ) : null}
      {onWay.length ? (
        <li>
          <b>{t(`กำลังไป ${onWay.length} คน`, `On the way (${onWay.length})`)}</b>: {onWay.join(", ")}
        </li>
      ) : null}
    </ul>
  );
}

/** The host's day-of form: one status and a short note. */
export function DayStatusForm(props: { v: View; action: string; shown: ShownStatus | null; open: boolean; opensAt: string; children?: Child }) {
  const { t } = props.v;
  if (!props.open) {
    return <p class="muted">{t(`ตั้งสถานะวันงานได้ตั้งแต่ ${props.opensAt} จนจบงาน`, `You can set a day-of status from ${props.opensAt} until the end.`)}</p>;
  }
  return (
    <form method="post" action={props.action} class="day-status-form">
      <fieldset class="choices">
        <legend>{t("บอกทุกคนในโต๊ะว่า…", "Tell everyone at the table…")}</legend>
        {DAY_STATUSES.map((s) => (
          <label class="toggle">
            <input type="radio" name="status" value={s} checked={props.shown?.status === s} required />
            <span>{t(DAY_STATUS_TEXT[s].th, DAY_STATUS_TEXT[s].en)}</span>
          </label>
        ))}
      </fieldset>
      <Field
        label={t("ข้อความสั้น ๆ (ไม่บังคับ ถ้าย้ายจุดนัดพบต้องใส่)", "A short note (optional; needed if the place moved)")}
        name="note"
        value={props.shown?.note ?? ""}
        maxlength={DAY_NOTE_MAX}
        hint={t("เช่น ย้ายไปชั้น 3 หรือ รอที่ล็อบบี้ได้เลย", "For example: moved to the 3rd floor, or wait in the lobby")}
      />
      <div class="row">
        <button type="submit" class="btn primary">{t("บอกทุกคน", "Tell everyone")}</button>
        {props.shown ? (
          <button type="submit" name="clear" value="1" formnovalidate class="btn ghost">
            {t("ลบสถานะ", "Clear status")}
          </button>
        ) : null}
      </div>
      {props.children}
    </form>
  );
}
