/**
 * /new: the front door for "the Rebuilder" (design/reference/customer-profile.md),
 * people who moved to Bangkok in the last two years and are rebuilding a social
 * life. Public: what a first table looks like, this week's newcomer-friendly
 * tables (titles, times and districts only, never who's going), the quiz, and
 * sign-up. A cookie remembers they came in as a newcomer, so onboarding can
 * pre-tick "New to Bangkok".
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { and, asc, count, desc, eq, gt, lt, ne, or, sql, type AnyColumn } from "drizzle-orm";
import { getDb } from "../db";
import type { AppEnv } from "../lib/env";
import { DISTRICTS, label } from "../lib/constants";
import { fmtDate, L } from "../lib/i18n";
import { OPEN_TO_MORE_TAG, romanceEventOk, womenOnlyEventOk } from "../domain/rules";
import { events, registrations, type Profile } from "../schema";
import { BRAND } from "../ui/brand";
import { Empty, LinkButton, page, view, type View } from "../ui/kit";
import { Bento, Big, Pill, Tile } from "../ui/visual";

export const newcomerRoutes = new Hono<AppEnv>();

export const NEWCOMER_COOKIE = "jg_new";
/** Tags that make a table newcomer-friendly. */
export const NEWCOMER_TAGS = ["newcomers", "language_exchange", "english_friendly", "city_quest"];

const has = (col: AnyColumn, value: string) =>
  sql`(case when jsonb_typeof(${col}) = 'string' then (${col} #>> '{}')::jsonb else ${col} end) @> jsonb_build_array(${value}::text)`;

const NEW_CSS = `
.new-list{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:10px}
.new-list a{display:grid;gap:4px;padding:14px 16px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);text-decoration:none;color:var(--ink)}
.new-list a:hover{border-color:var(--brand)}
.new-steps{display:grid;gap:10px;padding-left:1.3em;margin:0 0 18px}
.new-steps li::marker{color:var(--brand);font-weight:700}
`;

newcomerRoutes.get("/new", async (c) => {
  const { t, lang, user } = view(c);
  setCookie(c, NEWCOMER_COOKIE, "1", { path: "/", maxAge: 30 * 86_400, sameSite: "Lax" });
  const now = new Date();
  const list = await getDb(c.env)
    .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, district: events.district, costThb: events.costThb })
    .from(events)
    .where(
      and(
        eq(events.status, "published"),
        ne(events.visibility, "private"),
        gt(events.startsAt, now),
        or(...NEWCOMER_TAGS.map((tag) => has(events.tags, tag)))!,
        sql`not ${has(events.tags, OPEN_TO_MORE_TAG)}`,
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(6);
  const member = !!user?.profile?.onboardedAt;
  const join = member ? "/events" : "/signup";
  return page(
    c,
    { title: t("ย้ายมากรุงเทพฯ? เจอเพื่อนใหม่ที่นี่", "New in Bangkok? Make friends here") },
    <>
      <Bento>
        <Tile size="hero" tone="brand" art={{ tone: "morning", icons: [], seed: 11 }} lang={lang}>
          <Pill dot>{t("มาใหม่ในกรุงเทพฯ", "New to Bangkok")}</Pill>
          {/* Phrases stay whole, so Thai never breaks mid-word-group. */}
          <h1>
            {t("ย้ายมากรุงเทพฯ?|เจอเพื่อนใหม่|ที่โต๊ะเล็ก ๆ|ใกล้บ้านคุณ", "New in Bangkok? Make friends at a small table near you.")
              .split("|")
              .map((w, i) => <>{i ? " " : ""}<span style="white-space:nowrap">{w}</span></>)}
          </h1>
          <small>{t("มาคนเดียวได้ ทุกคนก็มาคนเดียว แล้วกลับไปพร้อมคนที่อยากเจออีก", "Come alone, everyone does. Leave with people you'll see again.")}</small>
          <small class="endorse">🏛️ {L(lang, BRAND.endorsement)}</small>
        </Tile>
        <Tile>
          <Big n="4-6" label={t("คนต่อโต๊ะ", "per table")} />
        </Tile>
        <Tile tone="gold" href="/buddy/passport">
          <Big n="50" label={t("เขตให้ตะลุยด้วยกัน", "districts to explore together")} />
        </Tile>
        <Tile href="/learn/new-to-bangkok">
          <span class="ico" aria-hidden="true">🧭</span>
          <h3>{t("คู่มือคนมาใหม่", "New to Bangkok guide")}</h3>
          <small>{t("การเดินทาง มารยาท และคำไทยง่าย ๆ", "Getting around, manners and easy Thai")}</small>
        </Tile>
        <Tile href="/quiz" tone="deep">
          <span class="ico" aria-hidden="true">🧩</span>
          <h3>{t("คุณเป็นไทป์กรุงเทพฯ แบบไหน?", "What's your Bangkok Type?")}</h3>
          <small>{t("18 ข้อ ราว 3 นาที ช่วยจัดโต๊ะให้เข้ากับคุณ", "18 taps, about 3 minutes. It seats you at the right table.")}</small>
        </Tile>
      </Bento>

      <style dangerouslySetInnerHTML={{ __html: NEW_CSS }} />
      <h2>{t("โต๊ะสำหรับคนมาใหม่ สัปดาห์นี้", "Newcomer tables this week")}</h2>
      {list.length ? (
        <ul class="new-list" role="list">
          {list.map((e) => (
            <li>
              <a href={member ? `/events/${e.id}` : join}>
                <strong>{lang === "en" && e.titleEn ? e.titleEn : e.title}</strong>
                <small class="muted">
                  🗓️ {fmtDate(e.startsAt, lang)} · 📍 {label(DISTRICTS, e.district, lang)} · {e.costThb ? t(`${e.costThb} บาท`, `${e.costThb} THB`) : t("ฟรี", "Free")}
                </small>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t("โต๊ะใหม่กำลังมา สมัครไว้แล้วเราจะแจ้งเมื่อเปิด", "New tables are on the way. Sign up and we'll tell you when they open.")}</Empty>
      )}

      <h2>{t("โต๊ะแรกของคุณเป็นแบบนี้", "What your first table is like")}</h2>
      <ol class="new-steps">
        <li>{t("เลือกกิจกรรมใกล้บ้าน เช่น เดินตลาดเช้า แลกเปลี่ยนภาษา หรือบอร์ดเกมหลังเลิกงาน", "Pick something near you: a morning market walk, a language table or after-work board games.")}</li>
        <li>{t("เราจัดโต๊ะละ 4 ถึง 6 คนอย่างยุติธรรม ดูจากภาษาและสิ่งที่ชอบ ไม่ใช่หน้าตา", "We seat 4 to 6 people fairly, by languages and interests, never by looks.")}</li>
        <li>{t("หลังกิจกรรม เลือกเงียบ ๆ ว่าอยากเจอใครอีก จะรู้ก็ต่อเมื่อเลือกตรงกันเท่านั้น", "Afterwards, choose quietly who you'd like to see again. You only hear when it's mutual.")}</li>
        <li>{t("อยากไปต่อ? มีบัดดี้กรุงเทพฯ ไว้ตะลุยครบ 50 เขตด้วยกัน", "Want more? Get a Bangkok Buddy to explore all 50 districts with.")}</li>
      </ol>

      <div class="row">
        <LinkButton href={join}>{member ? t("ดูกิจกรรมทั้งหมด", "See all events") : t("เริ่มเลย ฟรี", "Get started, it's free")}</LinkButton>
        {member ? null : <a href="/login">{t("เข้าสู่ระบบ", "Sign in")}</a>}
      </div>
      <p class="muted">
        {t("ใช้ภาษาไทยหรืออังกฤษก็ได้ สมัครได้ไม่ต้องมีเบอร์ไทย", "Thai or English. No Thai SIM needed to sign up.")} ·{" "}
        <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
      </p>
    </>,
  );
});

type Pick = { id: string; title: string; titleEn: string | null; startsAt: Date; district: string; costThb: number };

/**
 * "Your first table": for a member with no RSVPs yet, one upcoming public
 * table in the next two weeks, in their district first, then newcomer-friendly
 * ones, then the soonest. Never dating-only or private, and only one they may
 * join (women-only and open_to_more rules).
 */
export async function firstTable(env: AppEnv["Bindings"], p: Profile, now = new Date()): Promise<Pick | null> {
  const db = getDb(env);
  const [mine] = await db.select({ n: count() }).from(registrations).where(eq(registrations.accountId, p.accountId));
  if (Number(mine?.n ?? 0) > 0) return null;
  const rows = await db
    .select({ id: events.id, title: events.title, titleEn: events.titleEn, startsAt: events.startsAt, district: events.district, costThb: events.costThb, tags: events.tags })
    .from(events)
    .where(and(eq(events.status, "published"), ne(events.visibility, "private"), gt(events.startsAt, now), lt(events.startsAt, new Date(now.getTime() + 14 * 86_400_000))))
    .orderBy(desc(sql`${events.district} = ${p.district}`), desc(or(...NEWCOMER_TAGS.map((tag) => has(events.tags, tag)))!), asc(events.startsAt))
    .limit(10);
  const ok = rows.find((e) => romanceEventOk(e.tags, p) && womenOnlyEventOk(e.tags, p));
  return ok ? { id: ok.id, title: ok.title, titleEn: ok.titleEn, startsAt: ok.startsAt, district: ok.district, costThb: ok.costThb } : null;
}

export function FirstTable(props: { v: View; pick: Pick }) {
  const { t, lang } = props.v;
  const e = props.pick;
  return (
    <a class="card first-table" href={`/events/${e.id}`} style="display:grid;gap:4px;text-decoration:none;color:inherit;margin-bottom:16px;border:2px solid var(--brand)">
      <small class="eyebrow">🍽️ {t("โต๊ะแรกของคุณ", "Your first table")}</small>
      <strong>{lang === "en" && e.titleEn ? e.titleEn : e.title}</strong>
      <small class="muted">
        🗓️ {fmtDate(e.startsAt, lang)} · 📍 {label(DISTRICTS, e.district, lang)} · {e.costThb ? t(`${e.costThb} บาท`, `${e.costThb} THB`) : t("ฟรี", "Free")}
      </small>
      <small>{t("มาคนเดียวได้ ทุกคนก็มาคนเดียว", "Come alone, everyone does.")} →</small>
    </a>
  );
}
