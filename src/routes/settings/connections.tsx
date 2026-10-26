/**
 * Settings, connections part (split from routes/settings.tsx, Core Platform C3: a pure move).
 * See ./index.ts for the route list.
 */
import { endPinkies } from "../../services/pinky";
import { eq } from "drizzle-orm";
import { batch, getDb } from "../../db";
import { cleanBio, currentDatingDeck, withoutDating } from "../../content/profile";
import { profiles } from "../../schema";
import { Button, Notice, page, view, type View } from "../../ui/kit";
import { ConnectionsFields, connectionsPatch, dropPendingDating, pendingDatingIntent, withGenderSelf } from "../onboarding";
import { consentRow, deleteDatingIntents, privateFieldConsents, ROMANCE_CONSENT } from "../../services/consent";
import { settingsRoutes } from "./app";
import { me, withdrawRomanceChoices } from "./shared";

// ---------------------------------------------------------- connections --

function ConnectionsPage(props: { v: View; error?: [string, string] }) {
  const { t } = props.v;
  return (
    <>
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connection preferences")}</h1>
      <p class="muted">
        {t(
          "ข้อมูลในหน้านี้เป็นความลับ ไม่แสดงให้สมาชิกคนอื่นหรือเจ้าหน้าที่เห็น ถ้าเปลี่ยนจาก 'โสด' จะกลับเป็นโหมดเพื่อนทันที เปลี่ยนเป็น 'โสด' ได้ไม่เกิน 1 ครั้งใน 30 วัน",
          "Everything here is private: it's never shown to other members or staff. Leaving Single switches romance mode off at once. You can switch to Single at most once every 30 days.",
        )}
      </p>
      {props.error ? <Notice kind="error">{t(...props.error)}</Notice> : null}
      <form method="post">
        <ConnectionsFields v={props.v} />
        <Button>{t("บันทึก", "Save")}</Button>
      </form>
    </>
  );
}

settingsRoutes.get("/settings/connections", (c) => page(c, { title: view(c).t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connections"), tab: "me" }, <ConnectionsPage v={view(c)} />));

settingsRoutes.post("/settings/connections", async (c) => {
  const v = view(c);
  const user = me(c);
  const p = user.profile!;
  const body = await c.req.parseBody({ all: true });
  const result = await connectionsPatch(body, p);
  if ("error" in result) {
    return page(c, { title: v.t("ตั้งค่าการรู้จักกันหลังกิจกรรม", "Connections"), tab: "me", status: 400 }, <ConnectionsPage v={v} error={result.error} />);
  }
  const db = getDb(c.env);
  const intents = p.intents.filter((i) => i !== "romance");
  const queries: { toSQL(): { sql: string; params: unknown[] } }[] = [
    db
      .update(profiles)
      .set({
        ...result.patch,
        intents: result.patch.romanceOn ? [...intents, "romance"] : intents,
        // Dating prompts come with romance mode and go with it.
        bio: withGenderSelf(result.patch.romanceOn ? { ...cleanBio(p.bio), datingDeck: currentDatingDeck(user.account.id, cleanBio(p.bio)) } : withoutDating(cleanBio(p.bio)), result.genderSelf, result.datingGenderSelf),
      })
      .where(eq(profiles.accountId, user.account.id)),
  ];
  if (result.romanceConsent !== null) queries.push(consentRow(db, user.account.id, ROMANCE_CONSENT, result.romanceConsent));
  if (result.patch.romanceOn) {
    // Onboarding dating answers still waiting for this yes are saved with it (R1).
    const pending = pendingDatingIntent(c, db, user.account.id);
    if (pending) queries.push(pending);
  } else {
    // Romance off: dating intents go at once (R2).
    dropPendingDating(c);
    queries.push(deleteDatingIntents(db, user.account.id));
  }
  if (p.romanceOn && !result.patch.romanceOn) queries.push(withdrawRomanceChoices(db, user.account.id), ...endPinkies(db, user.account.id));
  // R3: relationship status and the private gender carry their own consent rows.
  queries.push(...(await privateFieldConsents(db, user.account.id, { relationship: result.patch.relationship, gender: result.patch.gender })));
  // No audit row for a relationship change: its time would sit next to the 💘 switch in a log staff read (owner, 2026-10-26).
  await batch(c.env, queries);
  return c.redirect("/settings/connections?notice=saved");
});



