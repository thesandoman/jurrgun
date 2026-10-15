/**
 * Public pages: landing, language switch, policies, PWA manifest and icon.
 */
import { FAIR_PROCESS } from "../content/accountability";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env";
import { LEARN_CARDS } from "../content/learn";
import { L } from "../lib/i18n";
import { AvatarStack, Bento, Big, Pill, Tile } from "../ui/visual";
import { LinkButton, page, safeNext, view } from "../ui/kit";
import { BRAND, MARK_SVG } from "../ui/brand";

export const publicRoutes = new Hono<AppEnv>();

export const INTRO_COOKIE = "jg_intro";

publicRoutes.get("/", (c) => {
  const { t, user, lang } = view(c);
  if (user?.profile?.onboardedAt) return c.redirect("/events");
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
          <h2>{L(lang, BRAND.tagline).split(" ").map((w, i) => <>{i ? " " : ""}<span style="white-space:nowrap">{w}</span></>)}</h2>
          <small>{t("เจอเพื่อนใหม่ในกรุงเทพฯ ไม่ต้องปัดไม่รู้จบ", "Make friends in Bangkok. No endless swiping.")}</small>
          <small class="endorse">🏛️ {L(lang, BRAND.bmaShort)}</small>
        </Tile>
        <Tile href="/buddy" tone="deep" size="tall">
          <span class="go" aria-hidden="true">↗</span>
          <AvatarStack items={[{ label: "You", emoji: "🍜", seed: "a" }, { label: "Buddy", emoji: "📜", seed: "b" }]} size={46} />
          <h3>{t("บัดดี้กรุงเทพฯ", "Bangkok Buddy")}</h3>
          <small>{t("1 คน · เควสต์ทุกสัปดาห์", "1 person · weekly quests")}</small>
        </Tile>
        <Tile href="/events">
          <Big n="4-6" label={t("คนต่อโต๊ะ", "per table")} />
        </Tile>
        <Tile tone="gold" href="/buddy/passport">
          <Big n="50" label={t("เขตให้สะสม", "districts to collect")} />
        </Tile>
        <Tile href="/types">
          <Big n="16" label={t("ไทป์กรุงเทพฯ", "Bangkok types")} />
        </Tile>
        <Tile href="/safety" tone="gold">
          <span class="ico" aria-hidden="true">🛡️</span>
          <h3>{t("ปลอดภัยไว้ก่อน", "Safety first")}</h3>
          <small>{t("รู้ผลก็ต่อเมื่อเลือกตรงกัน", "You only hear when it's mutual")}</small>
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
    </>,
  );
});

/** The intro for first-time visitors: five swipeable slides, then sign up. */
publicRoutes.get("/intro", (c) => {
  const { t, user } = view(c);
  setCookie(c, INTRO_COOKIE, "seen", { path: "/", maxAge: 365 * 86_400, sameSite: "Lax" });
  const done = user ? (user.profile?.onboardedAt ? "/events" : "/onboarding") : "/signup";
  const slides: { art: string; tone: string; title: string; body: string; foot?: string }[] = [
    {
      art: "mark",
      tone: "s1",
      title: t("เจอกัน 👋", "Jurrgun 👋"),
      body: t("ที่ที่คนกรุงเทพฯ ได้เจอเพื่อนใหม่กันจริง ๆ แล้วเจอกันนะ!", "“Jurrgun” (เจอกัน, say “jer-gun”) means “see you later” in Thai. It's where people in Bangkok actually meet new friends."),
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
      body: t("แบบทดสอบสั้น ๆ 3 นาที ตัวละคร 16 แบบ ไม่มีเรื่องการเมือง ช่วยหาโต๊ะที่เข้ากับคุณ", "A 3-minute quiz, 16 characters, nothing political. It helps seat you at the right table."),
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
            {i === 0 ? <h1>{sl.title}</h1> : <h2>{sl.title}</h2>}
            <p>{sl.body}</p>
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
  const H = (th: string, en: string) => <h2>{t(th, en)}</h2>;
  const P = (th: string, en: string) => <p>{t(th, en)}</p>;
  const Li = (th: string, en: string) => <li>{t(th, en)}</li>;
  return page(
    c,
    { title: t("ความเป็นส่วนตัว", "Privacy") },
    <>
      <h1>{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</h1>
      <p class="muted">{t("ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) · ฉบับวันที่ 15 ตุลาคม 2569", "Under Thailand's Personal Data Protection Act 2019 (PDPA) · Version of 15 October 2026")}</p>

      {H("ใครดูแลข้อมูลของคุณ", "Who looks after your data")}
      {P(
        "Jurrgun เป็นแอปอิสระสำหรับนัดเจอเพื่อนใหม่ในกรุงเทพฯ และปริมณฑล ดำเนินการโดยทีม Jurrgun ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคล กรุงเทพมหานคร (กทม.) เป็นเจ้าภาพหลักและผู้กำกับดูแล เจ้าหน้าที่ กทม. ช่วยดูแลความปลอดภัยของชุมชนในฐานะทีมงาน",
        "Jurrgun is an independent app for meeting new friends in Bangkok and the surrounding areas. It is run by the Jurrgun team, the data controller. The Bangkok Metropolitan Administration (BMA) is its main host and oversight body, and BMA staff help keep the community safe as part of the team.",
      )}

      {H("เราเก็บอะไร และเก็บไว้แยกกัน", "What we collect, kept in separate stores")}
      <ul>
        {Li("ข้อมูลบัญชี: ชื่อผู้ใช้ รหัสผ่าน (เก็บแบบแฮช ไม่เก็บรหัสจริง) และสถานะบัญชี", "Account: username, password (hashed, never stored as written) and account status.")}
        {Li("ข้อมูลกิจกรรม: ชื่อเล่น เขต ภาษา ความสนใจ คำตอบในโปรไฟล์ กิจกรรมที่เข้าร่วม คนรู้จัก และแชต", "Social: nickname, district, languages, interests, profile answers, events you join, connections and chats.")}
        {Li("ข้อมูลวิจัยเมือง (City Pulse): เก็บด้วยรหัสวิจัยแทนตัวตน ใช้เฉพาะเมื่อคุณยินยอม", "City research (City Pulse): stored under a research code instead of your identity, only if you agree.")}
        {Li("ข้อมูลอ่อนไหว: สถานะความสัมพันธ์ เพศ อัตลักษณ์ทางเพศ รสนิยม และการตั้งค่าเปิดใจมากกว่าเพื่อน เก็บเมื่อคุณให้ความยินยอมโดยชัดแจ้งเท่านั้น", "Sensitive data: relationship status, gender, gender identity, orientation and Open to something more settings, kept only with your explicit consent.")}
      </ul>

      {H("เราใช้ข้อมูลเพื่ออะไร", "Why we use it")}
      <ul>
        {Li("ให้บริการ: จัดโต๊ะ บัดดี้ โต๊ะประจำ แชต และการเช็กอิน (ตามสัญญาการใช้บริการ)", "To run the service: seating tables, buddies, regular tables, chat and check-in (to provide the service you signed up for).")}
        {Li("ความปลอดภัย: ตรวจรายงาน ป้องกันการคุกคามและการหลอกลวง (ประโยชน์โดยชอบด้วยกฎหมาย)", "Safety: reviewing reports, preventing harassment and scams (legitimate interest).")}
        {Li("การแนะนำและการวิจัยเมือง: ใช้เมื่อคุณยินยอมเท่านั้น และถอนได้ทุกเมื่อ", "Suggestions and city research: only with your consent, which you can withdraw at any time.")}
      </ul>

      {H("ใครเห็นอะไร", "Who sees what")}
      <ul>
        {Li("สมาชิกคนอื่นเห็นโปรไฟล์ของคุณเมื่อได้เจอกันแล้วเท่านั้น และไม่มีใครค้นหาหรือเลื่อนดูคุณได้", "Other members see your profile only after you've met. Nobody can search or browse you.")}
        {Li("ทีมงานและเจ้าหน้าที่ กทม. เห็นเฉพาะที่จำเป็นต่อความปลอดภัย เช่น สถานะบัญชีและรายงาน ไม่เห็นข้อมูลอ่อนไหว ตัวเลือกส่วนตัว หรือแชตของคุณ เว้นแต่ข้อความนั้นถูกรายงาน", "Our team and BMA staff see only what safety needs, such as account status and reports. They never see your sensitive data, private choices or chats, unless a message is reported.")}
        {Li("กทม. ได้รับผล City Pulse เป็นภาพรวมจากอย่างน้อย 10 คนเท่านั้น ไม่ได้รับข้อมูลส่วนบุคคลของคุณ", "The BMA receives City Pulse only as totals from 10 or more people, never your personal data.")}
        {Li("เราไม่ขายข้อมูล ไม่ใช้ตัวติดตามโฆษณา และไม่ส่งข้อมูลของคุณให้พาร์ตเนอร์", "We never sell data, use ad trackers or pass your data to partners.")}
      </ul>

      {H("เก็บไว้นานแค่ไหน", "How long we keep it")}
      <ul>
        {Li("ข้อมูลเปิดใจมากกว่าเพื่อน: ลบทันทีเมื่อกลับเป็นโหมดเพื่อน", "Open to something more details: deleted as soon as you switch back to friends only.")}
        {Li("ตัวเลือกหลังกิจกรรมที่ไม่ตรงกัน: ลบเมื่อครบ 72 ชั่วโมง", "Post-event choices that weren't mutual: deleted after 72 hours.")}
        {Li("บันทึกการเช็กอินและโต๊ะ: 12 เดือน แล้วเหลือเป็นภาพรวม", "Check-in and table records: 12 months, then kept only as totals.")}
        {Li("คำตอบ City Pulse: 24 เดือน ภายใต้รหัสวิจัย", "City Pulse answers: 24 months under the research code.")}
        {Li("บัญชีที่ปิดแล้ว: ซ่อนโปรไฟล์ทันที ลบถาวรหลัง 30 วัน", "Deactivated accounts: hidden at once, deleted after 30 days.")}
      </ul>

      {H("สิทธิของคุณ", "Your rights")}
      {P(
        "คุณขอดู ขอสำเนา แก้ไข ลบ ระงับการใช้ คัดค้าน หรือโอนย้ายข้อมูล และถอนความยินยอมได้ทุกเมื่อ ส่วนใหญ่ทำได้เองที่ ตั้งค่า → ศูนย์ความเป็นส่วนตัว (ดาวน์โหลดข้อมูล เปลี่ยนความยินยอม ปิดบัญชี) และคุณมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)",
        "You can ask to see, copy, correct, delete, restrict, object to or move your data, and withdraw consent at any time. Most of this you can do yourself in Settings → Privacy Center (download your data, change consents, deactivate). You can also complain to Thailand's Personal Data Protection Committee (PDPC).",
      )}

      {H("ติดต่อเรื่องข้อมูลส่วนบุคคล", "Contact about your data")}
      {P(
        "ทีม Jurrgun ทำหน้าที่ดูแลข้อมูลส่วนบุคคล ติดต่อได้ผ่าน ตั้งค่า → ศูนย์ความเป็นส่วนตัว เราจะตอบภายใน 30 วัน",
        "The Jurrgun team handles data protection. Contact us through Settings → Privacy Center, and we'll reply within 30 days.",
      )}
    </>,
  );
});

publicRoutes.get("/code-of-conduct", (c) => {
  const { t } = view(c);
  const rules: [string, string][] = [
    ["เคารพทุกคน ไม่ว่าเพศ อัตลักษณ์ สัญชาติ ศาสนา อายุ หรือความพิการ", "Respect everyone, whatever their gender, identity, nationality, religion, age or disability."],
    ["ไม่คุกคาม ไม่กดดัน ไม่ตามตื๊อ 'ไม่' คือ 'ไม่'", "No harassment, pressure or persistence. No means no."],
    ["ถ้าเปิดใจมากกว่าเพื่อน ต้องบอกสถานะความสัมพันธ์ตามจริง", "Be truthful about your relationship status if you use romance features."],
    ["ห้ามเปิดเผยตัวตนหรือข้อมูลของผู้อื่น (รวมถึงอัตลักษณ์ทางเพศ) โดยไม่ได้รับอนุญาต", "Never out anyone or share someone's details (including gender identity) without consent."],
    ["ห้ามขายของ หลอกลวง หรือชักชวนเข้าธุรกิจ", "No selling, scams or recruiting."],
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

publicRoutes.get("/terms", (c) => {
  const { t } = view(c);
  return page(
    c,
    { title: t("ข้อกำหนด", "Terms") },
    <>
      <h1>{t("ข้อกำหนดการใช้งาน (ฉบับร่างต้นแบบ)", "Terms of use (prototype draft)")}</h1>
      <p>{t("บริการนี้เป็นต้นแบบเพื่อการทดสอบ สำหรับผู้ที่อายุ 18 ปีขึ้นไปและอยู่ในหรือรอบ ๆ กรุงเทพฯ รวมถึงคนที่มาพักอยู่ช่วงหนึ่ง อย่าใช้ข้อมูลส่วนตัวจริงระหว่างการทดสอบ", "This is a test prototype for adults (18+) in and around Bangkok, including people staying for a while. Please don't use real personal data during testing.")}</p>
      <p>{t("กิจกรรมที่มีค่าใช้จ่าย ให้ชำระเงินนอกแอปที่สถานที่จัดกิจกรรม", "Paid events are paid off-platform, at the venue.")}</p>
    </>,
  );
});

publicRoutes.get("/manifest.webmanifest", (c) =>
  c.json(
    {
      name: "Jurrgun (เจอกัน)",
      short_name: "Jurrgun",
      description: `${BRAND.tagline.en} ${BRAND.meaning.en}.`,
      start_url: "/events",
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
