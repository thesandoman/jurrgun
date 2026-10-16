/**
 * "See them again" (src/services/see-again.ts): one card, one next step, on a
 * past event, My events and My people. It names only people the member is
 * connected with, and says how many of them booked an event, never who.
 */
import type { SeeAgain } from "../services/see-again";
import { fmtDate } from "../lib/i18n";
import type { View } from "./kit";

const SAY = { th: "อยากเจอกันอีก ไปโต๊ะด้วยกันไหม 🙂", en: "Fancy meeting up again at a table? 🙂" };

export function SeeAgainCard(props: { v: View; data: SeeAgain; here?: boolean }) {
  const { t, lang } = props.v;
  const { event, people, next } = props.data;
  const evTitle = lang === "en" ? event.titleEn || event.title : event.title;
  const shown = people.slice(0, 3).map((p) => p.nickname);
  const more = people.length - shown.length;
  const names = more > 0 ? t(`${shown.join(" ")} และอีก ${more} คน`, `${shown.join(", ")} and ${more} more`) : lang === "en" ? shown.join(", ") : shown.join(" ");
  const id = `see-again-${event.id.replace(/[^\w-]/g, "")}`;
  let line: string;
  let href: string;
  let cta: string;
  if (next.kind === "event") {
    const where = lang === "en" ? next.event.titleEn || next.event.title : next.event.title;
    const when = fmtDate(next.event.startsAt, lang);
    line =
      people.length === 1
        ? t(`เขาจองไป ${where} แล้ว (${when}) ไปเจอกันอีกที่นั่นได้นะ`, `They're booked for ${where} (${when}). You could see them there.`)
        : t(`${next.going} คนในนี้จองไป ${where} แล้ว (${when}) ไปเจอกันอีกที่นั่นได้นะ`, `${next.going} of them ${next.going === 1 ? "is" : "are"} booked for ${where} (${when}). You could see them there.`);
    href = `/events/${next.event.id}`;
    cta = t("ดูกิจกรรมนี้", "See this event");
  } else {
    line = t("ทักไปชวนกันเจออีกได้เลย", "Say hi and plan the next meet-up.");
    href = next.with ? `${next.href}?say=${encodeURIComponent(t(SAY.th, SAY.en))}` : next.href;
    cta = next.with ? t(`แชตกับ ${next.with.nickname}`, `Chat with ${next.with.nickname}`) : t("ไปที่แชต", "Open your chats");
  }
  return (
    <aside class="card see-again" aria-labelledby={id}>
      <h2 id={id} class="h3">
        <span aria-hidden="true">🫂</span> {props.here ? t("คนที่คุณเจอที่นี่", "People you met here") : t(`คนที่คุณเจอที่ ${evTitle}`, `People you met at ${evTitle}`)}
      </h2>
      <p class="see-again-names">{names}</p>
      <p class="muted">{line}</p>
      <a class="btn primary" href={href}>
        {cta}
      </a>
    </aside>
  );
}
