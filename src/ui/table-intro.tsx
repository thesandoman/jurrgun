/**
 * "Help your table get to know you" (D42): the about-you questions moved out of
 * sign-up to after the first RSVP. This card asks for them on the RSVP
 * confirmation and on the pass, until the member has picked an interest.
 */
import type { View } from "./kit";
export { safeNext } from "./kit";

export const TABLE_INTRO_PATH = "/onboarding/you";

export function TableIntroPrompt(props: { v: View; next: string }) {
  const { t } = props.v;
  const p = props.v.user?.profile;
  if (!p || p.interests.length > 0) return null;
  return (
    <aside class="card table-intro" aria-labelledby="table-intro-h">
      <h2 id="table-intro-h" class="h3">
        <span aria-hidden="true">🪑</span> {t("ช่วยให้โต๊ะรู้จักคุณ", "Help your table get to know you")}
      </h2>
      <p class="muted">{t("5 คำถามสั้น ๆ เรื่องภาษาและสิ่งที่ชอบ ใช้เวลาราว 1 นาที โฮสต์จะได้จัดโต๊ะให้คุยกันง่ายขึ้น", "5 quick questions about your languages and what you're into, about a minute. It helps the host seat you where the talk flows.")}</p>
      <a class="btn primary" href={`${TABLE_INTRO_PATH}?next=${encodeURIComponent(props.next)}`}>
        {t("เริ่มเลย", "Start")}
      </a>
    </aside>
  );
}
