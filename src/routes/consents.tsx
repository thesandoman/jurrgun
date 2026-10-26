/**
 * The consent centre (/settings/consents): every consent category in
 * src/content/privacy.ts on one page, each with a short explanation, its
 * latest state and the date of that row (consents are append-only, latest
 * wins). Three parts, so the real choices stand apart:
 *
 *   needed to run the app   service and safety: explained, never a switch
 *   consents you choose     switches, each with what switching off does;
 *                           sensitive ones (relationship, gender, Open to
 *                           something more) can be withdrawn here
 *   agreements on record    the Terms and the guide's promise, with dates
 *
 * Switches post to the same handler as the Privacy Center (settings/privacy.tsx
 * saveConsents), so there is one place that writes consents.
 */
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { fmtDay, L } from "../lib/i18n";
import { requireMember } from "../lib/session";
import { consents } from "../schema";
import { CONSENT_CATEGORIES, isoDateText, NOT_A_CONSENT, TERMS_CONSENT, type ConsentCategory } from "../content/privacy";
import { Button, page, Tag, view, type View } from "../ui/kit";

export const consentRoutes = new Hono<AppEnv>();

export type LatestConsent = { granted: boolean; at: Date; version: string };

/** The newest row per category for one member. */
export async function latestConsents(env: AppEnv["Bindings"], accountId: string): Promise<Map<string, LatestConsent>> {
  const rows = await getDb(env)
    .select({ category: consents.category, granted: consents.granted, at: consents.createdAt, version: consents.version })
    .from(consents)
    .where(eq(consents.accountId, accountId))
    .orderBy(desc(consents.createdAt))
    .limit(500);
  const out = new Map<string, LatestConsent>();
  for (const r of rows) if (!out.has(r.category)) out.set(r.category, { granted: r.granted, at: r.at, version: r.version });
  return out;
}

/** A service or safety row: needed to run the app, so explained with the date it was acknowledged, never a switch. */
function NeededRow(props: { v: View; cat: ConsentCategory; now?: LatestConsent }) {
  const { t, lang } = props.v;
  const { cat, now } = props;
  return (
    <li>
      <strong>{L(lang, cat.title)}</strong>
      <span>{L(lang, cat.hint)}</span>
      {now ? <small>{`${t("รับทราบเมื่อ", "Acknowledged")} ${fmtDay(now.at, lang)}`}</small> : null}
    </li>
  );
}

/** A consent you choose: a switch with what switching it off does, and the date of the last change. */
function ChoiceRow(props: { v: View; cat: ConsentCategory; now?: LatestConsent }) {
  const { t, lang } = props.v;
  const { cat, now } = props;
  const on = !!now?.granted;
  const title = L(lang, cat.title);
  const when = now ? `${on ? t("ให้ไว้เมื่อ", "Given") : t("ปิดเมื่อ", "Turned off")} ${fmtDay(now.at, lang)}` : t("ยังไม่ได้ให้", "Not given");
  // Sensitive data is given where it is entered; here it can only be withdrawn.
  if (cat.control === "withdraw" && !on) {
    return (
      <div class="toggle consent-row" role="group" aria-label={title}>
        <span>
          {title} <Tag tone="muted">{t("ปิด", "Off")}</Tag>
          <small>{`${L(lang, cat.hint)} · ${when}`}</small>
          {cat.href ? (
            <small>
              <a href={cat.href}>{t("ให้ได้ที่ ตั้งค่าการรู้จักกันหลังกิจกรรม", "Give it in Connection preferences")}</a>
            </small>
          ) : null}
        </span>
      </div>
    );
  }
  return (
    <label class="toggle consent-choice">
      <input type="checkbox" name={`consent_${cat.key}`} value="1" checked={on} />
      <span>
        {title}
        <small>{L(lang, cat.hint)}</small>
        {cat.withdraw ? <small class="consent-then">{L(lang, cat.withdraw)}</small> : null}
        <small>{when}</small>
      </span>
    </label>
  );
}

/** A one-off agreement (the Terms, the guide's promise): its date, and the version for the Terms. */
function RecordRow(props: { v: View; cat: ConsentCategory; now?: LatestConsent }) {
  const { t, lang } = props.v;
  const { cat, now } = props;
  const version = cat.key === TERMS_CONSENT && now && /^terms-\d{4}-\d{2}-\d{2}$/.test(now.version) ? L(lang, isoDateText(now.version.slice(6))) : null;
  return (
    <li>
      <strong>
        {L(lang, cat.title)} <Tag tone="muted">{now?.granted ? t("ยอมรับแล้ว", "Agreed") : t("ยังไม่ได้ทำ", "Not yet")}</Tag>
      </strong>
      <span>{L(lang, cat.hint)}</span>
      {now?.granted ? (
        <small>
          {`${t("ยอมรับเมื่อ", "Agreed")} ${fmtDay(now.at, lang)}`}
          {version ? ` · ${t("ฉบับวันที่", "Version of")} ${version}` : ""}
        </small>
      ) : null}
    </li>
  );
}

consentRoutes.get("/settings/consents", requireMember, async (c) => {
  const v = view(c);
  const { t, lang } = v;
  const latest = await latestConsents(c.env, c.var.user!.account.id);
  const of = (control: ConsentCategory["control"][]) => CONSENT_CATEGORIES.filter((cat) => control.includes(cat.control));
  return page(
    c,
    { title: t("ความยินยอมของฉัน", "My consents"), tab: "me" },
    <div class="consent-centre">
      <p>
        <a href="/settings" class="back-link">← {t("ฉัน", "Me")}</a>
      </p>
      <h1>{t("ความยินยอมของฉัน", "My consents")}</h1>
      <p class="muted">{t("ทุกครั้งที่เปลี่ยน เราบันทึกไว้พร้อมวันที่", "Every change is kept with its date.")}</p>

      <h2>{L(lang, NOT_A_CONSENT)}</h2>
      <ul class="consent-list">
        {of(["required"]).map((cat) => (
          <NeededRow v={v} cat={cat} now={latest.get(cat.key)} />
        ))}
      </ul>

      <h2>{t("ความยินยอมที่คุณเลือกเอง", "Consents you choose")}</h2>
      <p class="muted">{t("ไม่ให้ก็ใช้แอปได้ ปิดหรือถอนได้ทุกเมื่อ", "You can use the app without them, and turn them off or withdraw them at any time.")}</p>
      <form method="post" action="/settings/consents">
        <input type="hidden" name="present" value="1" />
        {of(["toggle", "withdraw"]).map((cat) => (
          <ChoiceRow v={v} cat={cat} now={latest.get(cat.key)} />
        ))}
        <Button>{t("บันทึก", "Save")}</Button>
      </form>

      <h2>{t("ข้อตกลงที่บันทึกไว้", "Agreements on record")}</h2>
      <ul class="consent-list">
        {of(["record"]).map((cat) => (
          <RecordRow v={v} cat={cat} now={latest.get(cat.key)} />
        ))}
      </ul>

      <nav class="policy-links" aria-label={t("ข้อมูลของฉัน", "My data")}>
        <a href="/settings/privacy/export">{t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}</a>
        <a href="/settings/privacy#deactivate">{t("ปิดบัญชีและลบข้อมูล", "Close my account and delete my data")}</a>
        <a href="/terms">{t("ข้อกำหนดการใช้งาน", "Terms of service")}</a>
        <a href="/privacy">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a>
      </nav>
    </div>,
  );
});
