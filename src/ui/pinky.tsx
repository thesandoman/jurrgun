/**
 * เกี่ยวก้อย · Pinky: the quiet row on the card of someone you met, shown
 * only to members with 💘 on (rules in src/domain/pinky.ts). Love red on
 * cream only, never coral or orange. It only ever describes the viewer's own
 * tap, or a Pinky that is already mutual.
 */
import type { PinkyState } from "../services/pinky";

type T = (th: string, en: string) => string;

/** Two little fingers hooked together, drawn in the nav's stroke style. */
function PinkyIcon() {
  return (
    <svg class="pinky-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 15V8.5a2 2 0 0 1 4 0V12a3 3 0 0 0 3 3h1.5" />
      <path d="M20 9v6.5a2 2 0 0 1-4 0V12a3 3 0 0 0-3-3h-1.5" />
    </svg>
  );
}

export function PinkyRow(props: { t: T; otherId: string; name: string; state: PinkyState }) {
  const { t, state } = props;
  const action = `/people/${encodeURIComponent(props.otherId)}/pinky`;
  return (
    <section class="pinky" id="pinky" aria-labelledby="pinky-h">
      <div class="pinky-head">
        <PinkyIcon />
        <div>
          <h2 id="pinky-h" class="pinky-name">
            เกี่ยวก้อย · Pinky
          </h2>
          <p class="pinky-sub">{t("เกี่ยวก้อยไว้ ถ้าเขาเกี่ยวกลับ ค่อยลองไปเดตกัน", "Hook pinkies to try a date")}</p>
        </div>
      </div>
      {state.mutual ? (
        <>
          <p class="pinky-state" role="status">
            <b>{t(`คุณกับ ${props.name} เกี่ยวก้อยกันแล้ว`, `You and ${props.name} both hooked pinkies`)}</b>{" "}
            {t("ลองชวนกันไปเดตดูนะ", "Maybe plan a date?")}
          </p>
          <div class="pinky-actions">
            {state.connectionId ? (
              <a class="btn pinky-btn" href={`/chat/conn:${state.connectionId}`}>
                {t("ทักไปชวนเลย", "Send a message")}
              </a>
            ) : null}
            <form method="post" action={action}>
              <button type="submit" name="action" value="back" class="btn ghost">
                {t("กลับไปเป็นเพื่อน", "Back to friends")}
              </button>
            </form>
          </div>
          <p class="pinky-note">{t("ถ้ากลับไปเป็นเพื่อน จะไม่มีใครได้รับแจ้ง", "Going back to friends doesn't notify anyone.")}</p>
        </>
      ) : state.mine ? (
        <>
          <p class="pinky-state" role="status">
            <b>{t("คุณเกี่ยวก้อยไว้แล้ว", "Your pinky is out")}</b>{" "}
            {t("ถ้าเขาเกี่ยวกลับ จะแจ้งทั้งสองคน ถ้าไม่ เขาจะไม่รู้เลย", "If they hook theirs too, you'll both know. If not, they never find out.")}
          </p>
          <form method="post" action={action} class="pinky-actions">
            <button type="submit" name="action" value="back" class="btn ghost">
              {t("ถอยออกมา", "Step back")}
            </button>
          </form>
          <p class="pinky-note">{t("ถอยออกมาได้ทุกเมื่อ ไม่มีใครได้รับแจ้ง", "You can step back anytime. Nobody is told.")}</p>
        </>
      ) : (
        <>
          <p class="pinky-note">{t("เป็นความลับ เขาจะรู้ก็ต่อเมื่อเกี่ยวก้อยกันทั้งสองคน", "Private. They only find out if you both do.")}</p>
          <form method="post" action={action} class="pinky-actions">
            <button type="submit" name="action" value="tap" class="btn pinky-btn">
              {t("เกี่ยวก้อย", "Hook pinkies")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
