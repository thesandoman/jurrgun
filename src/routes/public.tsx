/**
 * Public pages: landing, language switch, policies, PWA manifest and icon.
 */
import { FAIR_PROCESS } from "../content/accountability";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env";
import { ABOUT, LEARN_CARDS } from "../content/learn";
import { L } from "../lib/i18n";
import { AvatarStack, Bento, Big, Pill, Tile } from "../ui/visual";
import { LinkButton, page, safeNext, view } from "../ui/kit";
import { BRAND, MARK_SVG } from "../ui/brand";
import { A11yMenu } from "../ui/a11y";
import { discoverPage } from "./events/discover";
import { GOOGLE_SITE_VERIFICATION, llmsTxt, robotsTxt, siteJsonLd, sitemapXml } from "../lib/seo";
import { Script } from "../ui/kit";

export const publicRoutes = new Hono<AppEnv>();

export const INTRO_COOKIE = "jg_intro";

publicRoutes.get("/", (c) => {
  const { t, user, lang } = view(c);
  // Members get Discover right here (owner, 2026-10-27); /events redirects to /.
  if (user?.profile?.onboardedAt) return discoverPage(c);
  // First visit: the intro first, once.
  if (!user && !getCookie(c, INTRO_COOKIE)) return c.redirect("/intro");
  return page(
    c,
    { title: t("เจอเพื่อนใหม่ในกรุงเทพฯ", "Make friends in Bangkok") },
    <>
      <Bento>
        <Tile size="hero" tone="brand" art={{ tone: "evening", icons: [], seed: 7 }} lang={lang}>
          <Pill dot>{t("กรุงเทพฯ · กลุ่มเล็ก", "Bangkok · small groups")}</Pill>
          {/* Each phrase stays whole: Thai line breaking would otherwise split "แล้ว|เจอกันนะ". */}
          <h1 class="hero-title">{L(lang, BRAND.tagline).split(" ").map((w, i) => <>{i ? " " : ""}<span style="white-space:nowrap">{w}</span></>)}</h1>
          <small>{t("เจอเพื่อนใหม่ในกรุงเทพฯ ไม่ต้องปัดไม่รู้จบ", "Make friends in Bangkok. No endless swiping.")}</small>
          <small class="endorse">🏛️ {L(lang, BRAND.bmaShort)}</small>
          <div class="hero-cta">
            {user ? (
              <a href="/onboarding" class="btn primary">
                {t("ทำโปรไฟล์ต่อ", "Continue setting up")}
              </a>
            ) : (
              <>
                <a href="/signup" class="btn primary">
                  {t("เริ่มเลย", "Get started")}
                </a>
                <a href="/login" class="hero-link">
                  {t("เข้าสู่ระบบ", "Sign in")}
                </a>
              </>
            )}
          </div>
        </Tile>
        {/* Visitors only get public links: Buddy and the passport need an account, so those tiles explain without linking. */}
        <Tile tone="deep" size="tall">
          <AvatarStack items={[{ label: "You", emoji: "🍜", seed: "a" }, { label: "Buddy", emoji: "📜", seed: "b" }]} size={46} />
          <h3>{t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</h3>
          <small>{t("1 คน · เควสต์ทุกสัปดาห์", "1 person · weekly quests")}</small>
        </Tile>
        <Tile href="/learn/making-friends">
          <Big n="4-6" label={t("คนต่อโต๊ะ", "per table")} />
        </Tile>
        <Tile tone="gold">
          <Big n="50" label={t("เขตให้สะสม", "districts to collect")} />
        </Tile>
        <Tile href="/types">
          <Big n="16" label={t("ไทป์กรุงเทพฯ", "Bangkok types")} />
        </Tile>
        <Tile href="/safety" tone="gold">
          <span class="ico" aria-hidden="true">🛡️</span>
          <h3>{t("ปลอดภัยไว้ก่อน", "Safety first")}</h3>
          <small>{t("นัดในที่สาธารณะเสมอ รายงานหรือบล็อกได้ในแอป", "Always in public places. Report or block in the app.")}</small>
        </Tile>
      </Bento>
      <div class="row">
        {user ? (
          <LinkButton href="/onboarding">{t("ทำโปรไฟล์ต่อ", "Continue setting up")}</LinkButton>
        ) : (
          <>
            <LinkButton href="/signup">{t("เริ่มเลย", "Get started")}</LinkButton>
            <a href="/login">{t("เข้าสู่ระบบ", "Sign in")}</a>
          </>
        )}
      </div>
      <div class="rail-wrap">
        <div class="rail" role="list">
          {LEARN_CARDS.map((topic) => (
            <a href={`/learn/${topic.slug}`} role="listitem">
              <b aria-hidden="true">{topic.icon}</b>
              <strong>{L(lang, topic.title)}</strong>
            </a>
          ))}
        </div>
      </div>
      <div class="row doors">
        <LinkButton href="/new" kind="ghost">👋 {t("เพิ่งย้ายมากรุงเทพฯ", "New to Bangkok")}</LinkButton>
        <LinkButton href="/international" kind="ghost">🌏 {t("ชาวต่างชาติในกรุงเทพฯ", "From abroad, living here")}</LinkButton>
      </div>
      <p class="muted">
        <a href="/faq">{t("คำถามที่พบบ่อย", "FAQ")}</a> · <a href="/learn">{t("เรียนรู้", "Learn")}</a> · <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
      </p>
      <p class="muted">
        <a href="/partner/apply">{t("ผู้จัดงานและสถานที่: สมัครเป็นพาร์ตเนอร์", "For organisers and venues: become a partner")}</a>
      </p>
    </>,
  );
});

/** The intro for first-time visitors: five swipeable slides, then sign up. */
publicRoutes.get("/intro", (c) => {
  const { t, user, lang } = view(c);
  setCookie(c, INTRO_COOKIE, "seen", { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  const done = user ? (user.profile?.onboardedAt ? "/" : "/onboarding") : "/signup";
  const slides: { art: string; tone: string; title: string; body: string; note?: string; foot?: string }[] = [
    {
      art: "mark",
      tone: "s1",
      title: t("เจอกัน 👋", "Jurrgun 👋"),
      body: t(BRAND.tagline.th, BRAND.tagline.en),
      note: t("“เจอกัน” คือที่ที่คนกรุงเทพฯ ได้เจอเพื่อนใหม่กันจริง ๆ", "“Jurrgun” (เจอกัน, say “jer-gun”) means “see you later” in Thai. It's where people in Bangkok actually meet new friends."),
      foot: t(BRAND.bma.th, BRAND.bma.en),
    },
    {
      art: "🗺️",
      tone: "s2",
      title: t("สถานที่จริง กลุ่มเล็ก", "Real places, small groups"),
      body: t("เดินเล่นย่านเก่า บอร์ดเกม แลกเปลี่ยนภาษา โต๊ะละ 4 ถึง 6 คน จัดที่นั่งอย่างยุติธรรม", "Old-town walks, board games, language tables. Tables of 4 to 6, seated fairly."),
    },
    {
      art: "💚",
      tone: "s3",
      title: t("ไม่มีใครต้องโดนปฏิเสธ", "Nobody gets rejected"),
      body: t("หลังกิจกรรม คุณเลือกเงียบ ๆ ว่าอยากเจอใครอีก จะรู้ก็ต่อเมื่อเลือกตรงกันเท่านั้น", "After an event you choose quietly who you'd like to see again. You only hear when it's mutual."),
    },
    {
      art: "🧩",
      tone: "s4",
      title: t("คุณเป็นไทป์ไหน?", "What's your Bangkok Type?"),
      body: t("16 ข้อ ราว 3 นาที มีตัวละคร 16 แบบ ไม่มีเรื่องการเมือง ช่วยจัดโต๊ะให้มีคนหลากหลาย และมีเรื่องคุยตั้งแต่แรก", "16 quick questions, about 3 minutes. 16 characters, nothing political. It helps us seat a good mix, with something in common to start."),
    },
    {
      art: "🌈",
      tone: "s5",
      title: t("สำหรับทุกคน", "For everyone"),
      body: t("ทุกเพศ ทุกความหลากหลาย ทั้งคนไทยและชาวต่างชาติ เริ่มต้นที่โหมดเพื่อนเสมอ และใช้ฟรี", "Any gender or orientation, Thai or expat. Friends-first by default. Free."),
    },
  ];
  return page(
    c,
    { title: t("ยินดีต้อนรับ", "Welcome"), bare: true, fullscreen: true, description: L(lang, ABOUT), jsonLd: siteJsonLd(lang) },
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
            {i === 0 ? <h1>{sl.title}</h1> : <h2>{sl.title}</h2>}
            <p>{sl.body}</p>
            {sl.note ? <p class="muted">{sl.note}</p> : null}
            {sl.foot ? <p class="intro-foot">🏛️ {sl.foot}</p> : null}
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
        <button type="button" class="btn primary intro-next" id="intro-next">
          {t("ถัดไป", "Next")} <span aria-hidden="true">→</span>
        </button>
      </div>
      <p class="sr-only" id="intro-status" role="status" data-of={t("จาก", "of")} data-word={t("หน้า", "Slide")}>
        {t(`หน้า 1 จาก ${slides.length}`, `Slide 1 of ${slides.length}`)}
      </p>
      <div class="intro-tools">
        <p class="intro-lang">
          <a href="/lang/th?back=/intro" lang="th" aria-current={lang === "th" ? "true" : undefined}>ไทย</a>
          <a href="/lang/en?back=/intro" lang="en" aria-current={lang === "en" ? "true" : undefined}>English</a>
        </p>
        <A11yMenu t={t} class="intro-a11y" />
      </div>
      <Script
        dangerouslySetInnerHTML={{
          __html: `(function(){var tr=document.getElementById("intro-track"),dots=document.querySelectorAll("#intro-dots i"),nx=document.getElementById("intro-next");
var n=dots.length;function idx(){return Math.round(tr.scrollLeft/tr.clientWidth)}
var st=document.getElementById("intro-status"),last=-1;
function upd(){var i=idx();for(var j=0;j<n;j++)dots[j].className=j===i?"on":"";nx.style.visibility=i===n-1?"hidden":"visible";if(i!==last&&st){last=i;st.textContent=st.dataset.word+" "+(i+1)+" "+st.dataset.of+" "+n}}
function still(){return (window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)||document.documentElement.classList.contains("a11y-motion")}
tr.addEventListener("scroll",function(){window.requestAnimationFrame(upd)});
nx.addEventListener("click",function(e){e.preventDefault();tr.scrollTo({left:(idx()+1)*tr.clientWidth,behavior:still()?"auto":"smooth"})});
tr.addEventListener("keydown",function(e){if(e.key==="ArrowRight"){e.preventDefault();nx.click()}if(e.key==="ArrowLeft"){e.preventDefault();tr.scrollTo({left:(idx()-1)*tr.clientWidth,behavior:still()?"auto":"smooth"})}});upd()})();`,
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

publicRoutes.get("/code-of-conduct", (c) => {
  const { t } = view(c);
  const rules: [string, string][] = [
    ["เคารพทุกคน ไม่ว่าเพศ อัตลักษณ์ สัญชาติ ศาสนา อายุ หรือความพิการ", "Respect everyone, whatever their gender, identity, nationality, religion, age or disability."],
    ["ไม่คุกคาม ไม่กดดัน ไม่ตามตื๊อ 'ไม่' คือ 'ไม่'", "No harassment, pressure or persistence. No means no."],
    ["ถ้าเปิดใจมากกว่าเพื่อน ต้องบอกสถานะความสัมพันธ์ตามจริง", "Be truthful about your relationship status if you use romance features."],
    ["ห้ามเปิดเผยตัวตนหรือข้อมูลของผู้อื่น (รวมถึงอัตลักษณ์ทางเพศ) โดยไม่ได้รับอนุญาต", "Never out anyone or share someone's details (including gender identity) without consent."],
    ["ห้ามขายของ หลอกลวง หรือชักชวนเข้าธุรกิจ", "No selling, scams or recruiting."],
    ["ดื่มอย่างรับผิดชอบ งานที่มีแอลกอฮอล์สำหรับอายุ 20 ปีขึ้นไป ห้ามบุหรี่ไฟฟ้า และห้ามกัญชาหรือยาเสพติดทุกชนิดในกิจกรรม", "Drink responsibly: events with alcohol are 20+. No vaping, and no cannabis or other drugs at any event."],
    ["ทำตามคำแนะนำของโฮสต์และแจ้งเหตุไม่ปลอดภัยทันที", "Follow your host and report anything unsafe right away."],
    ["ไม่หายเงียบ (ghosting) ดูรายละเอียดด้านล่าง", "No ghosting: see the details below."],
  ];
  const ghosting: [string, string][] = [
    ["เมื่อจับคู่กันแล้ว (บัดดี้กรุงเทพฯ หรือเลือกกันและกันหลังกิจกรรม) อย่าหายไปเฉย ๆ", "Once you're matched (a Bangkok Buddy, or a mutual connection after an event), don't just disappear."],
    ["บัดดี้จะปิดเมื่อ (1) ทั้งสองคนตกลงกันในแอป หรือ (2) ทั้งสองคนแชร์ช่องทางติดต่อกันแล้วและย้ายไปคุยนอกแอป เช่น LINE หรือ Instagram หรือ (3) คุณส่งข้อความปิดท้ายอย่างสุภาพในแอป ซึ่งบัดดี้จะได้รับ และจะปิดเองใน 7 วันถ้าบัดดี้ไม่ตอบ", "A buddy pairing ends when (1) you both agree in the app, or (2) you've both shared a contact and moved off the app, for example to LINE or Instagram, or (3) you send a kind wrap-up note in the app, which your buddy receives and which closes on its own after 7 days if they don't reply."],
    ["ถ้าไปไม่ได้ ให้บอกล่วงหน้าเสมอ ยกเลิกกิจกรรมในแอปก่อน 24 ชั่วโมง และบอกบัดดี้ก่อนนัด", "If you can't make it, say so in advance: cancel events in the app 24 hours before, and tell your buddy before a meetup."],
    ["ความปลอดภัยมาก่อนเสมอ ถ้ารู้สึกไม่ปลอดภัย บล็อกหรือรายงานแล้วออกได้ทันที ไม่นับว่าหายเงียบ", "Safety always comes first. If you feel unsafe, block or report and leave at once. That is never ghosting."],
  ];
  return page(
    c,
    { title: t("หลักปฏิบัติ", "Code of conduct") },
    <>
      <h1>{t("หลักปฏิบัติของชุมชน", "Community code of conduct")}</h1>
      <ol>{rules.map(([th, en]) => <li>{t(th, en)}</li>)}</ol>
      <h2 id="no-ghosting">{t("ไม่หายเงียบ", "No ghosting")}</h2>
      <ul>{ghosting.map(([th, en]) => <li>{t(th, en)}</li>)}</ul>
      <h2 id="fair-process">{t("ยุติธรรมและตรวจสอบได้", "Fair and accountable")}</h2>
      <ul>{FAIR_PROCESS.map(([th, en]) => <li>{t(th, en)}</li>)}</ul>
    </>,
  );
});

/* Search and answer engines (src/lib/seo.ts). Text only, cached for a day. */
const TEXT_DAY = { "cache-control": "public, max-age=86400" };
publicRoutes.get("/robots.txt", (c) => c.text(robotsTxt(new URL(c.req.url).host), 200, TEXT_DAY));
publicRoutes.get("/sitemap.xml", (c) => c.body(sitemapXml(), 200, { ...TEXT_DAY, "content-type": "application/xml; charset=utf-8" }));
publicRoutes.get("/llms.txt", (c) => c.text(llmsTxt(), 200, TEXT_DAY));
/* Google Search Console ownership check (owner, 2026-10-27): the exact file Google issued, byte for byte. Keep it while the property is verified. */
publicRoutes.get(`/${GOOGLE_SITE_VERIFICATION}`, (c) =>
  c.body(`google-site-verification: ${GOOGLE_SITE_VERIFICATION}`, 200, { ...TEXT_DAY, "content-type": "text/html; charset=utf-8" }),
);

publicRoutes.get("/manifest.webmanifest", (c) =>
  c.json(
    {
      name: "Jurrgun (เจอกัน)",
      short_name: "Jurrgun",
      description: `${BRAND.tagline.en} ${BRAND.meaning.en}.`,
      start_url: "/",
      display: "standalone",
      background_color: "#fff9f0",
      theme_color: "#137f45",
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
