/**
 * The consent centre (/settings/consents): every consent category in
 * src/content/privacy.ts on one page, each with a short explanation, its
 * latest state and the date of that row (consents are append-only, latest
 * wins). Toggles post to the same handler as the Privacy Center
 * (settings.tsx saveConsents), so there is one place that writes consents.
 */
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { fmtDay, L } from "../lib/i18n";
import { requireMember } from "../lib/session";
import { consents } from "../schema";
import { CONSENT_CATEGORIES, type ConsentCategory } from "../content/privacy";
import { Button, page, Tag, Toggle, view, type View } from "../ui/kit";

export const consentRoutes = new Hono<AppEnv>();

export type LatestConsent = { granted: boolean; at: Date };

/** The newest row per category for one member. */
export async function latestConsents(env: AppEnv["Bindings"], accountId: string): Promise<Map<string, LatestConsent>> {
  const rows = await getDb(env)
    .select({ category: consents.category, granted: consents.granted, at: consents.createdAt })
    .from(consents)
    .where(eq(consents.accountId, accountId))
    .orderBy(desc(consents.createdAt))
    .limit(500);
  const out = new Map<string, LatestConsent>();
  for (const r of rows) if (!out.has(r.category)) out.set(r.category, { granted: r.granted, at: r.at });
  return out;
}

function Row(props: { v: View; cat: ConsentCategory; now?: LatestConsent }) {
  const { t, lang } = props.v;
  const { cat, now } = props;
  const on = !!now?.granted;
  const title = L(lang, cat.title);
  const when = now ? `${on ? t("ให้ไว้เมื่อ", "Given") : t("ปิดเมื่อ", "Turned off")} ${fmtDay(now.at, lang)}` : t("ยังไม่ได้ให้", "Not given");
  const hint = `${L(lang, cat.hint)} · ${when}`;
  if (cat.control === "toggle" || (cat.control === "withdraw" && on)) {
    return <Toggle name={`consent_${cat.key}`} label={title} hint={hint} checked={on} />;
  }
  const status =
    cat.control === "required"
      ? t("จำเป็น", "Required")
      : cat.control === "record"
        ? now
          ? t("ยอมรับแล้ว", "Agreed")
          : t("ยังไม่ได้ทำ", "Not yet")
        : on
          ? t("เปิด", "On")
          : t("ปิด", "Off");
  return (
    <div class="toggle consent-row" role="group" aria-label={title}>
      <span>
        {title} <Tag tone="muted">{status}</Tag>
        <small>{hint}</small>
        {cat.href ? (
          <small>
            <a href={cat.href}>{t("เปลี่ยนได้ที่ ตั้งค่าการรู้จักกันหลังกิจกรรม", "Change it in Connection preferences")}</a>
          </small>
        ) : null}
      </span>
    </div>
  );
}

consentRoutes.get("/settings/consents", requireMember, async (c) => {
  const v = view(c);
  const { t } = v;
  const latest = await latestConsents(c.env, c.var.user!.account.id);
  return page(
    c,
    { title: t("ความยินยอมของฉัน", "My consents"), tab: "me" },
    <div class="consent-centre">
      <p>
        <a href="/settings">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ความยินยอมของฉัน", "My consents")}</h1>
      <p class="muted">{t("ทุกครั้งที่เปลี่ยน เราบันทึกไว้พร้อมวันที่", "Every change is kept with its date.")}</p>
      <form method="post" action="/settings/consents">
        <input type="hidden" name="present" value="1" />
        {CONSENT_CATEGORIES.map((cat) => (
          <Row v={v} cat={cat} now={latest.get(cat.key)} />
        ))}
        <Button>{t("บันทึก", "Save")}</Button>
      </form>
      <nav class="policy-links" aria-label={t("ข้อมูลของฉัน", "My data")}>
        <a href="/settings/privacy/export">{t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}</a>
        <a href="/settings/privacy#deactivate">{t("ปิดบัญชีและลบข้อมูล", "Close my account and delete my data")}</a>
        <a href="/privacy">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a>
      </nav>
    </div>,
  );
});
