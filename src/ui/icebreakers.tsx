/**
 * Curated icebreakers on the event page (content in src/content/icebreakers.ts):
 * three questions for this event's table, for confirmed attendees from a few
 * days before until it ends. Nothing to do or tick: just something to reach
 * for if the table goes quiet.
 */
import { icebreakersFor } from "../content/icebreakers";
import type { View } from "./kit";

export function IcebreakerCard(props: { v: View; eventId: string; chatKey?: string | null }) {
  const { t, lang } = props.v;
  const list = icebreakersFor(props.eventId);
  return (
    <section class="card icebreakers" aria-labelledby="ice-h">
      <h2 id="ice-h" class="h3">
        <span aria-hidden="true">💬</span> {t("คำถามชวนคุยสำหรับโต๊ะนี้", "Icebreakers for your table")}
      </h2>
      <p class="muted">{t("ไม่ต้องเตรียมอะไร ถ้าโต๊ะเงียบเมื่อไหร่ ลองหยิบสักข้อ", "Nothing to prepare. If the table goes quiet, try one.")}</p>
      <ul class="ice-list">
        {list.map((x) => (
          <li>
            <span aria-hidden="true">{x.emoji}</span> {lang === "en" ? x.en : x.th}
          </li>
        ))}
      </ul>
      {props.chatKey ? (
        <p class="ice-chat">
          <a href={`/chat/${props.chatKey}`}>{t("ส่งในแชตกลุ่มได้ด้วย", "You can send them in the group chat too")} →</a>
        </p>
      ) : null}
    </section>
  );
}
