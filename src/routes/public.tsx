/**
 * Public pages: landing, language switch, policies, PWA manifest and icon.
 */
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env";
import { LEARN_CARDS } from "../content/learn";
import { L } from "../lib/i18n";
import { LinkButton, page, safeNext, view } from "../ui/kit";
import { FaqList } from "./learn";
import { BRAND, BrandMark, MARK_SVG } from "../ui/brand";

export const publicRoutes = new Hono<AppEnv>();

export const INTRO_COOKIE = "jg_intro";

publicRoutes.get("/", (c) => {
  const { t, user, lang } = view(c);
  if (user?.profile?.onboardedAt) return c.redirect("/events");
  // First visit: the intro first, once.
  if (!user && !getCookie(c, INTRO_COOKIE)) return c.redirect("/intro");
  return page(
    c,
    { title: t("เพื่อนใหม่ในเมืองเดียวกัน", "Make friends in Bangkok") },
    <>
      <section class="hero-lite">
        <span class="hero-mark"><BrandMark /></span>
        <h1>{t("เจอกัน! เพื่อนใหม่ในกรุงเทพฯ", "Jurrgun! Bangkok's own way to make friends")}</h1>
        <p>{t("กลุ่มเล็ก สถานที่จริง ไม่ต้องปัดหา", "Small groups. Real places. No swiping.")}</p>
        <div class="row">
          {user ? (
            <LinkButton href="/onboarding">{t("ทำโปรไฟล์ต่อ", "Continue setting up")}</LinkButton>
          ) : (
            <>
              <LinkButton href="/signup">{t("เริ่มเลย", "Get started")}</LinkButton>
              <a href="/login">{t("มีบัญชีแล้ว? เข้าสู่ระบบ", "Have an account? Sign in")}</a>
            </>
          )}
        </div>
      </section>
      <div class="tiles">
        <span class="tile"><b aria-hidden="true">🏙️</b>{t("เมืองเป็นเจ้าภาพ", "Hosted by the city")}</span>
        <span class="tile"><b aria-hidden="true">👥</b>{t("โต๊ะละ 4 ถึง 6 คน", "Tables of 4 to 6")}</span>
        <span class="tile"><b aria-hidden="true">🔒</b>{t("รู้เมื่อเลือกตรงกัน", "Mutual matches only")}</span>
      </div>
      <a href="/types" class="teaser">
        <b class="big" aria-hidden="true">🧭</b>
        <span>
          <strong>{t("ค้นหาไทป์กรุงเทพฯ ของคุณ", "Find your Bangkok Type")}</strong>
          <small class="muted">{t("13 ไทป์ คุณเป็นแบบไหน?", "13 types. Which one are you?")}</small>
        </span>
      </a>
      <h2>{t("คำถามที่พบบ่อย", "FAQ")}</h2>
      <FaqList lang={lang} limit={5} />
      <p>
        <a href="/faq">{t("ดูคำถามทั้งหมด →", "See all questions →")}</a>
      </p>
      <h2>
        {t("เรียนรู้ก่อนออกไปเจอคนใหม่", "Learn before you meet")}
        <span class="swipe-hint" aria-hidden="true">{t("ปัดดู →", "Swipe →")}</span>
      </h2>
      <div class="rail-wrap">
        <div class="rail" role="list">
          {LEARN_CARDS.map((topic) => (
            <a href={`/learn/${topic.slug}`} role="listitem">
              <b aria-hidden="true">{topic.icon}</b>
              <strong>{L(lang, topic.title)}</strong>
              <small class="muted">{L(lang, topic.summary)}</small>
            </a>
          ))}
        </div>
      </div>
    </>,
  );
});

/** The intro for first-time visitors: five swipeable slides, then sign up. */
publicRoutes.get("/intro", (c) => {
  const { t, user } = view(c);
  setCookie(c, INTRO_COOKIE, "seen", { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  const done = user ? (user.profile?.onboardedAt ? "/events" : "/onboarding") : "/signup";
  const slides: { art: string; tone: string; title: string; body: string }[] = [
    {
      art: "mark",
      tone: "s1",
      title: t("เจอกัน 👋", "Jurrgun 👋"),
      body: t("“เจอกัน” แปลว่า แล้วเจอกันนะ ที่นี่คือที่ที่คนกรุงเทพฯ ได้เจอเพื่อนใหม่จริง ๆ", "“Jurrgun” (เจอกัน) means “see you later” in Thai. It's where people in Bangkok actually meet new friends."),
    },
    {
      art: "🗺️",
      tone: "s2",
      title: t("สถานที่จริง กลุ่มเล็ก", "Real places, small groups"),
      body: t("เดินเล่นย่านเก่า บอร์ดเกม แลกเปลี่ยนภาษา โต๊ะละ 4 ถึง 6 คน จัดให้อย่างยุติธรรม", "Old-town walks, board games, language tables. Tables of 4 to 6, seated fairly."),
    },
    {
      art: "💚",
      tone: "s3",
      title: t("ไม่มีใครถูกปฏิเสธ", "Nobody gets rejected"),
      body: t("หลังกิจกรรม คุณเลือกเงียบ ๆ ว่าอยากเจอใครอีก จะรู้ก็ต่อเมื่อเลือกตรงกันเท่านั้น", "After an event you choose quietly who you'd like to see again. You only hear when it's mutual."),
    },
    {
      art: "🧩",
      tone: "s4",
      title: t("คุณเป็นไทป์ไหน?", "What's your Bangkok Type?"),
      body: t("แบบทดสอบสั้น ๆ 2 นาที ตัวละคร 16 แบบ ไม่มีเรื่องการเมือง ช่วยจัดโต๊ะให้เข้ากับคุณ", "A 2-minute quiz, 16 characters, nothing political. It helps seat you at the right table."),
    },
    {
      art: "🌈",
      tone: "s5",
      title: t("สำหรับทุกคน", "For everyone"),
      body: t("ทุกเพศ ทุกความหลากหลาย คนไทยและชาวต่างชาติ โหมดเพื่อนเป็นค่าเริ่มต้น ฟรี", "Any gender or orientation, Thai or expat. Friends-first by default. Free."),
    },
  ];
  return page(
    c,
    { title: t("ยินดีต้อนรับ", "Welcome"), bare: true, fullscreen: true },
    <div class="intro">
      <a class="intro-skip" href={done}>
        {t("ข้าม", "Skip")}
      </a>
      <div class="intro-track" id="intro-track" tabindex={0} aria-label={t("แนะนำ Jurrgun", "About Jurrgun")}>
        {slides.map((sl, i) => (
          <section class={`intro-slide ${sl.tone}`} aria-label={`${i + 1} / ${slides.length}`}>
            <div class="intro-art" aria-hidden="true">
              {sl.art === "mark" ? <span class="intro-mark" dangerouslySetInnerHTML={{ __html: MARK_SVG }} /> : <b>{sl.art}</b>}
            </div>
            <h1>{sl.title}</h1>
            <p>{sl.body}</p>
            {i === slides.length - 1 ? (
              <div class="intro-cta">
                <LinkButton href={done}>{user ? t("ไปต่อ", "Continue") : t("เริ่มเลย", "Get started")}</LinkButton>
                {!user ? <a href="/login">{t("มีบัญชีแล้ว? เข้าสู่ระบบ", "Have an account? Sign in")}</a> : null}
              </div>
            ) : null}
          </section>
        ))}
      </div>
      <div class="intro-foot">
        <div class="intro-dots" id="intro-dots" aria-hidden="true">
          {slides.map((_, i) => <i class={i === 0 ? "on" : ""} />)}
        </div>
        <a href="#" class="btn primary intro-next" id="intro-next">
          {t("ถัดไป", "Next")} →
        </a>
      </div>
      <p class="intro-lang">
        <a href="/lang/th?back=/intro" lang="th">ไทย</a> · <a href="/lang/en?back=/intro" lang="en">English</a>
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var tr=document.getElementById("intro-track"),dots=document.querySelectorAll("#intro-dots i"),nx=document.getElementById("intro-next");
var n=dots.length;function idx(){return Math.round(tr.scrollLeft/tr.clientWidth)}
function upd(){var i=idx();for(var j=0;j<n;j++)dots[j].className=j===i?"on":"";nx.style.visibility=i===n-1?"hidden":"visible"}
tr.addEventListener("scroll",function(){window.requestAnimationFrame(upd)});
nx.addEventListener("click",function(e){e.preventDefault();var r=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;tr.scrollTo({left:(idx()+1)*tr.clientWidth,behavior:r?"auto":"smooth"})});
tr.addEventListener("keydown",function(e){if(e.key==="ArrowRight"){e.preventDefault();nx.click()}if(e.key==="ArrowLeft"){e.preventDefault();tr.scrollTo({left:(idx()-1)*tr.clientWidth,behavior:"smooth"})}});upd()})();`,
        }}
      />
    </div>,
  );
});

publicRoutes.get("/lang/:code", (c) => {
  const code = c.req.param("code") === "en" ? "en" : "th";
  setCookie(c, "lang", code, { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  return c.redirect(safeNext(c.req.query("back"), "/"));
});

publicRoutes.get("/privacy", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: t("ความเป็นส่วนตัว", "Privacy") },
    <>
      <h1>{t("นโยบายความเป็นส่วนตัว (ฉบับร่างต้นแบบ)", "Privacy notice (prototype draft)")}</h1>
      <p>{t("Jurrgun เป็นโครงการต้นแบบของกรุงเทพมหานคร เราเก็บข้อมูลเท่าที่จำเป็นและแยกเก็บเป็น 3 ส่วน", "Jurrgun is a Bangkok Metropolitan Administration prototype. We collect only what's needed and keep it in three separate stores:")}</p>
      <ul>
        <li>{t("ข้อมูลบัญชี: ชื่อผู้ใช้ รหัสผ่าน (เข้ารหัส) สถานะบัญชี", "Account: username, password (hashed), account status.")}</li>
        <li>{t("ข้อมูลกิจกรรม: ชื่อเล่น ความสนใจ กิจกรรมที่เข้าร่วม การเชื่อมต่อ", "Social: nickname, interests, events attended, connections.")}</li>
        <li>{t("ข้อมูลวิจัยเมือง (City Pulse): ใช้รหัสแฝง แสดงผลเฉพาะภาพรวมที่มีอย่างน้อย 10 คน", "City research (City Pulse): pseudonymous id only, shown to BMA only as totals of 10 or more people.")}</li>
      </ul>
      <p>{t("สถานะความสัมพันธ์ อัตลักษณ์ทางเพศ และ 'เปิดใจให้ใคร' เป็นข้อมูลส่วนตัว ไม่แสดงต่อสาธารณะ และเจ้าหน้าที่ไม่สามารถดูได้", "Relationship status, gender identity and 'open to meeting' are private, never public, and not visible to any staff member.")}</p>
      <p>{t("คุณดู ดาวน์โหลด เปลี่ยนความยินยอม หรือปิดบัญชีได้ที่ ตั้งค่า → ศูนย์ความเป็นส่วนตัว", "You can view, download, change consents or deactivate in Settings → Privacy Center.")}</p>
      <p class="muted">{t("เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO): จะประกาศก่อนเปิดใช้งานจริง", "Data Protection Officer: to be named before public launch.")}</p>
    </>,
  );
});

publicRoutes.get("/code-of-conduct", (c) => {
  const { t } = view(c);
  const rules: [string, string][] = [
    ["เคารพทุกคน ไม่ว่าเพศ อัตลักษณ์ เชื้อชาติ ศาสนา อายุ หรือความพิการ", "Respect everyone, whatever their gender, identity, nationality, religion, age or disability."],
    ["ไม่คุกคาม ไม่กดดัน ไม่ตามตื๊อ — 'ไม่' คือ 'ไม่'", "No harassment, pressure or persistence — no means no."],
    ["บอกสถานะความสัมพันธ์ตามจริงหากใช้ฟีเจอร์เชิงโรแมนติก", "Be truthful about your relationship status if you use romance features."],
    ["ห้ามเปิดเผยตัวตนหรือข้อมูลของผู้อื่น (รวมถึงอัตลักษณ์ทางเพศ) โดยไม่ได้รับอนุญาต", "Never out anyone or share someone's details (including gender identity) without consent."],
    ["ห้ามขายของ หลอกลวง หรือชักชวนเข้าธุรกิจ", "No selling, scams or recruiting."],
    ["ทำตามคำแนะนำของโฮสต์และแจ้งเหตุไม่ปลอดภัยทันที", "Follow your host and report anything unsafe right away."],
  ];
  return page(
    c,
    { title: t("หลักปฏิบัติ", "Code of conduct") },
    <>
      <h1>{t("หลักปฏิบัติของชุมชน", "Community code of conduct")}</h1>
      <ol>{rules.map(([th, en]) => <li>{t(th, en)}</li>)}</ol>
      <p class="muted">{t("การละเมิดอาจนำไปสู่การเตือน ระงับ หรือแบนถาวร", "Breaking these can lead to a warning, suspension or permanent ban.")}</p>
    </>,
  );
});

publicRoutes.get("/terms", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: t("ข้อกำหนด", "Terms") },
    <>
      <h1>{t("ข้อกำหนดการใช้งาน (ฉบับร่างต้นแบบ)", "Terms of use (prototype draft)")}</h1>
      <p>{t("บริการนี้เป็นต้นแบบเพื่อทดสอบ สำหรับผู้มีอายุ 18 ปีขึ้นไปที่อยู่ในหรือรอบ ๆ กรุงเทพฯ รวมถึงคนที่มาอยู่ช่วงหนึ่ง ห้ามใช้ข้อมูลส่วนตัวจริงในระยะทดสอบ", "This is a test prototype for adults (18+) in and around Bangkok, including people staying for a while. Please don't use real personal data during testing.")}</p>
      <p>{t("กิจกรรมแบบมีค่าใช้จ่ายชำระนอกแอป ณ สถานที่จัดงาน", "Paid events are paid off-platform, at the venue.")}</p>
    </>,
  );
});

publicRoutes.get("/manifest.webmanifest", (c) =>
  c.json(
    {
      name: "Jurrgun (เจอกัน)",
      short_name: "Jurrgun",
      description: BRAND.meaning.en,
      start_url: "/events",
      display: "standalone",
      background_color: "#f3fbf5",
      theme_color: "#0c8a45",
      lang: "th",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    },
    200,
    { "content-type": "application/manifest+json", "cache-control": "public, max-age=86400" },
  ),
);

publicRoutes.get("/icon.svg", (c) =>
  c.body(
    MARK_SVG,
    200,
    { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  ),
);
