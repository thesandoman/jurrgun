/**
 * Public pages: landing, language switch, policies, PWA manifest and icon.
 */
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/env";
import { Card, LinkButton, page, safeNext, view } from "../ui/kit";
import { FaqList, LearnCards } from "./learn";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/", (c) => {
  const { t, user, lang } = view(c);
  if (user?.profile?.onboardedAt) return c.redirect("/events");
  return page(
    c,
    { title: t("เพื่อนใหม่ในเมืองเดียวกัน", "Make friends in Bangkok") },
    <>
      <Card class="hero">
        <h1>{t("เพื่อนใหม่ในเมืองเดียวกัน", "Bangkok's own way to make friends")}</h1>
        <p>{t("กลุ่มเล็ก สถานที่จริง ไม่ต้องปัดหา", "Small groups. Real places. No swiping.")}</p>
        <div class="row" style="margin-top:12px">
          {user ? (
            <LinkButton href="/onboarding" kind="ghost">{t("ทำโปรไฟล์ต่อ", "Continue setting up")}</LinkButton>
          ) : (
            <>
              <LinkButton href="/signup" kind="ghost">{t("เริ่มเลย", "Get started")}</LinkButton>
              <a href="/login" style="align-self:center">{t("มีบัญชีแล้ว? เข้าสู่ระบบ", "Have an account? Sign in")}</a>
            </>
          )}
        </div>
      </Card>
      <h2>{t("คำถามที่พบบ่อย", "FAQ")}</h2>
      <FaqList lang={lang} limit={6} />
      <p>
        <a href="/faq">{t("ดูคำถามทั้งหมด →", "See all questions →")}</a>
      </p>
      <h2>{t("ทำไมต้อง BKK Social", "Why BKK Social")}</h2>
      <div class="grid2">
        <Card>
          <h3>🏙️ {t("เมืองเป็นเจ้าภาพ", "The city is the host")}</h3>
          <p class="muted">{t("กิจกรรมในสวน พิพิธภัณฑ์ ย่านเก่า และเส้นทางจาก VisitBangkok", "Events in parks, museums, old-town routes from VisitBangkok and city festivals.")}</p>
        </Card>
        <Card>
          <h3>👥 {t("กลุ่มเล็ก 4–6 คน", "Small groups of 4–6")}</h3>
          <p class="muted">{t("จัดโต๊ะอย่างยุติธรรม ไม่มีใครอยากสลับกลุ่มกัน", "Fairly matched tables — no two people would both rather swap.")}</p>
        </Card>
        <Card>
          <h3>🔒 {t("ไม่มีใครถูกปฏิเสธ", "Never rejected, never exposed")}</h3>
          <p class="muted">{t("จะรู้ก็ต่อเมื่อเลือกตรงกันเท่านั้น ไม่มีการส่งข้อความหาคนแปลกหน้า", "You only hear when it's mutual. No browsing, no cold DMs.")}</p>
        </Card>
        <Card>
          <h3>🌈 {t("สำหรับทุกคน", "For everyone")}</h3>
          <p class="muted">{t("ทุกเพศ ทุกความหลากหลาย ชาวไทยและชาวต่างชาติ — โหมดเพื่อนเป็นค่าเริ่มต้น", "Any gender or orientation, Thai or expat — friends-only by default.")}</p>
        </Card>
      </div>
      <h2>{t("เรียนรู้ก่อนออกไปเจอคนใหม่", "Learn before you meet")}</h2>
      <LearnCards lang={lang} />
      <p class="muted" style="margin-top:16px">
        {t("ทุกครั้งที่คุณออกไปพบผู้คน ความคิดเห็นแบบไม่ระบุตัวตนของคุณช่วยให้กรุงเทพฯ น่าอยู่ขึ้น", "Every outing helps: your anonymous City Pulse feedback goes straight to BMA.")}
      </p>
    </>,
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
      <p>{t("BKK Social เป็นโครงการต้นแบบของกรุงเทพมหานคร เราเก็บข้อมูลเท่าที่จำเป็นและแยกเก็บเป็น 3 ส่วน", "BKK Social is a Bangkok Metropolitan Administration prototype. We collect only what's needed and keep it in three separate stores:")}</p>
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
      <p>{t("บริการนี้เป็นต้นแบบเพื่อทดสอบ สำหรับผู้มีอายุ 18 ปีขึ้นไปที่อาศัยอยู่ในกรุงเทพฯ ห้ามใช้ข้อมูลส่วนตัวจริงในระยะทดสอบ", "This is a test prototype for adults (18+) living in Bangkok. Please don't use real personal data during testing.")}</p>
      <p>{t("กิจกรรมแบบมีค่าใช้จ่ายชำระนอกแอป ณ สถานที่จัดงาน", "Paid events are paid off-platform, at the venue.")}</p>
    </>,
  );
});

publicRoutes.get("/manifest.webmanifest", (c) =>
  c.json(
    {
      name: "BKK Social",
      short_name: "BKK Social",
      start_url: "/events",
      display: "standalone",
      background_color: "#faf7f2",
      theme_color: "#0f6b5c",
      lang: "th",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    },
    200,
    { "content-type": "application/manifest+json", "cache-control": "public, max-age=86400" },
  ),
);

publicRoutes.get("/icon.svg", (c) =>
  c.body(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f6b5c"/><circle cx="32" cy="32" r="16" fill="#faf7f2"/><path d="M32 16a16 16 0 0 1 0 32z" fill="#c08a1e"/></svg>`,
    200,
    { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  ),
);
