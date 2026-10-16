/**
 * Jurrgun UI kit: one layout and a handful of components, server-rendered
 * with Hono JSX. Mobile-first, Thai-first, light and dark themes.
 *
 * Every page goes through `page(c, opts, body)`.
 */
import type { Context } from "hono";
import type { Child } from "hono/jsx";
import type { AppEnv, CurrentUser } from "../lib/env";
import { tr, type Lang, type T } from "../lib/i18n";
import { STYLES } from "./styles";
import { VISUAL_CSS } from "./visual";
import { QUESTION_ART_CSS } from "./question-art";
import { LAYOUT_CSS } from "./layout";
import { NATIVE_CSS } from "./native";
import { ALIVE_CSS, ALIVE_JS } from "./alive";
import { SPRING_JS } from "./spring";
import { WARM_CSS } from "./warm";
import { themed } from "./styles";

/** Global CSS: the base styles, plus the visual kit and postcard art used across pages. */
const ALL_CSS = FONT_CSS + STYLES + themed(QUESTION_ART_CSS + VISUAL_CSS) + NATIVE_CSS + ALIVE_CSS + LAYOUT_CSS + WARM_CSS + TYPE_CSS + MOMENTS_CSS + A11Y_CSS;
import { BRAND, BrandMark } from "./brand";
import { FONT_CSS, PRELOAD_FONTS, TYPE_CSS, fontUrl } from "./fonts";
import { A11Y_CSS } from "./a11y-css";
import { MOMENTS_CSS } from "./moments";
import { asset, type AssetPath } from "../assets";
import { A11Y_FORM_JS, A11Y_HEAD_JS, A11Y_MENU_JS, A11yMenu } from "./a11y";
import { NOTIF_JS, NotifMenu } from "./notif-menu";
import { CLEAR_OFFLINE_JS } from "./offline-next";
import { UnreadCount } from "./unread";

export type View = { lang: Lang; t: T; user: CurrentUser | null; path: string };

export function view(c: Context<AppEnv>): View {
  const lang = c.var.lang ?? "th";
  return { lang, t: tr(lang), user: c.var.user ?? null, path: new URL(c.req.url).pathname };
}

type Tab = "events" | "learn" | "buddy" | "mine" | "connections" | "pulse" | "me" | "admin" | "none";

export type PageOpts = {
  title: string;
  tab?: Tab;
  /** Staff pages get a wider layout and the admin side menu. */
  admin?: boolean;
  status?: 200 | 400 | 403 | 404 | 409 | 500;
  /** Focused task screens (onboarding, quiz): no tab bar, no footer. */
  bare?: boolean;
  /** Full-screen map screens (Discover): the page draws its own floating header. */
  fullscreen?: boolean;
  /** How a shared link to this page looks on LINE, Facebook, X (Open Graph). Defaults to the site card. */
  share?: { image?: AssetPath; title?: string; description?: string };
};

/**
 * Confetti is kept for one moment only: a friendship (two people who shared
 * contacts and met at least twice, routes/people.tsx markGraduations). A seat,
 * a check-in, a connection or a stamp get a calm toast (owner, Phase 2A).
 */
const PARTY = new Set(["friendship"]);

/** `?notice=` keys pages can redirect with. */
const NOTICES: Record<string, [string, string]> = {
  saved: ["บันทึกแล้ว", "Saved"],
  welcome: ["ยินดีต้อนรับสู่ Jurrgun!", "Welcome to Jurrgun!"],
  rsvp_confirmed: ["ได้ที่นั่งแล้ว ดูบัตรเข้างานได้ในกิจกรรมของฉัน", "You're in, your pass is in My events"],
  rsvp_waitlisted: ["อยู่ในคิวสำรองแล้ว มีที่ว่างเมื่อไหร่ เราจะบอกทันทีนะ", "You're on the waitlist, we'll tell you if a spot opens"],
  cancelled: ["ยกเลิกแล้ว", "Cancelled"],
  late_cancel: ["ยกเลิกแล้ว แต่ยกเลิกไม่ถึง 24 ชั่วโมงก่อนงาน เลยนับเป็นใบเตือน 1 ใบ", "Cancelled, cancelling within 24h counts as 1 strike"],
  offer_accepted: ["รับที่นั่งแล้ว!", "Spot accepted!"],
  checked_in: ["เช็กอินสำเร็จ", "Checked in"],
  choices_saved: ["บันทึกแล้ว เราจะบอกก็ต่อเมื่อเลือกกันทั้งสองคน", "Saved, you'll only hear if it's mutual"],
  reported: ["ได้รับรายงานแล้ว ทีมงานจะตรวจสอบ", "Report received, our team will review it"],
  blocked: ["บล็อกแล้ว คุณจะไม่เห็นกันอีก", "Blocked, you won't see each other again"],
  thanks: ["ขอบคุณสำหรับความคิดเห็น", "Thanks for your feedback"],
  shared: ["แชร์ช่องทางติดต่อแล้ว", "Contact shared"],
  deactivated: ["ปิดบัญชีแล้ว", "Account deactivated"],
  done: ["เรียบร้อย", "Done"],
  clock_unavailable: ["นาฬิกาทำงานได้เฉพาะบนเว็บไซต์จริง", "The clock only runs on the live site"],
  clock_no_secret: ["ต้องตั้ง TASK_WEBHOOK_SECRET ก่อนเริ่มนาฬิกา", "Set TASK_WEBHOOK_SECRET before starting the clock"],
  connected: ["เป็นคนรู้จักกันแล้ว!", "You're connected!"],
  offered: ["ส่งข้อเสนอที่นั่งให้คิวถัดไปแล้ว", "Offered the spot to the next person"],
  groups_suggested: ["จัดโต๊ะแนะนำแล้ว ตรวจดูแล้วกดเผยแพร่", "Groups suggested, review, then publish"],
  groups_published: ["เผยแพร่โต๊ะแล้ว", "Groups published"],
  notice_sent: ["ส่งประกาศแล้ว", "Notice sent"],
  strikes_recorded: ["บันทึกคนที่ไม่มาตามนัดแล้ว", "No-shows recorded"],
  answered: ["ขอบคุณนะ คำตอบของคุณช่วยให้กรุงเทพฯ ดีขึ้นได้จริง ๆ", "Thanks! Your answer helps the city"],
  buddy_round: ["จับคู่บัดดี้แล้ว", "Buddy round complete"],
  password_changed: ["เปลี่ยนรหัสผ่านแล้ว", "Password changed"],
  vibe_saved: ["บันทึกแล้ว", "Saved"],
  stamped: ["ได้แสตมป์เขตใหม่ในพาสปอร์ตแล้ว", "New district stamped in your passport"],
  friendship: ["นี่แหละมิตรภาพ ชวนกันไปเจออีกนะ", "That's a friendship. Go meet again soon."],
  romance_on: ["เปิดใจมากกว่าเพื่อนแล้ว ไม่มีใครเห็น จะรู้กันก็ต่อเมื่อเลือกตรงกัน ลองตอบคำถามชวนเดตดูนะ", "You're open to something more. It's private and only mutual choices show. Try a dating prompt."],
  romance_off: ["กลับเป็นโหมดเพื่อนแล้ว ลบข้อมูลเรื่องเดตทั้งหมดแล้ว", "Back to friends only. Your dating details are deleted."],
  romance_single: ["เปิดใจมากกว่าเพื่อนได้เฉพาะคนโสด เปลี่ยนสถานะได้ที่นี่", "Open to something more is for people who are single. You can change your status here."],
};

/** A new mutual connection: two circles slide together and a spark pops. Decorative only; the toast says it in words. */
function SparkPop(props: { initial: string }) {
  return (
    <div class="spark-pop" aria-hidden="true">
      <i class="sp-a">{props.initial || "•"}</i>
      <b>✨</b>
      <i class="sp-b">👋</i>
    </div>
  );
}

export function page(c: Context<AppEnv>, opts: PageOpts, body: Child) {
  const v = view(c);
  const noticeKey = c.req.query("notice");
  const notice = noticeKey && NOTICES[noticeKey];
  const errorText = c.req.query("error");
  return c.html(
    <Layout v={v} opts={opts} origin={new URL(c.req.url).origin} url={new URL(c.req.url).origin + new URL(c.req.url).pathname}>
      {notice ? (
        <Notice kind="ok" class={PARTY.has(noticeKey) ? "toast party" : "toast"}>
          {v.t(notice[0], notice[1])}
        </Notice>
      ) : null}
      {noticeKey === "connected" ? <SparkPop initial={(v.user?.profile?.nickname ?? "").slice(0, 1).toUpperCase()} /> : null}
      {errorText ? <Notice kind="error">{errorText}</Notice> : null}
      {body}
    </Layout>,
    opts.status ?? 200,
  );
}

function Layout(props: { v: View; opts: PageOpts; origin: string; url: string; children: Child }) {
  const { v, opts } = props;
  const shareTitle = opts.share?.title ?? `Jurrgun (เจอกัน): ${BRAND.tagline.en}`;
  const shareText = opts.share?.description ?? `${BRAND.tagline.th} · Make friends in Bangkok, no endless swiping. ${BRAND.bma.en}.`;
  const shareImage = props.origin + asset(opts.share?.image ?? "og/site.jpg");
  const { t, user } = v;
  const member = !!user?.profile?.onboardedAt;
  // Circle heads are members who host; they reach their check-in tools from Host.
  const staff = user && user.account.role !== "user" && user.account.role !== "circle_head";
  const other = v.lang === "th" ? "en" : "th";
  return (
    <html lang={v.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{`${opts.title} · Jurrgun`}</title>
        <meta name="description" content={`Jurrgun (เจอกัน): ${BRAND.tagline.th} · ${BRAND.tagline.en} Make friends in Bangkok, no endless swiping.`} />
        <meta name="theme-color" content="#fff9f0" media="(prefers-color-scheme: light)" data-media="(prefers-color-scheme: light)" data-scheme="light" />
        <meta name="theme-color" content="#06301c" media="(prefers-color-scheme: dark)" data-media="(prefers-color-scheme: dark)" data-scheme="dark" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Jurrgun" />
        <meta property="og:title" content={shareTitle} />
        <meta property="og:description" content={shareText} />
        <meta property="og:url" content={props.url} />
        <meta property="og:image" content={shareImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={v.lang === "en" ? "en_GB" : "th_TH"} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {PRELOAD_FONTS.map((f) => <link rel="preload" href={fontUrl(f)} as="font" type="font/woff2" crossorigin="" />)}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        {/* Only the accessibility "easier to read" font comes from Google; the brand fonts are ours (ui/fonts.ts). */}
        <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: ALL_CSS }} />
        <script
          dangerouslySetInnerHTML={{
            __html: A11Y_HEAD_JS,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: SPRING_JS }} />
      </head>
      <body class={[opts.admin && "admin", opts.bare && "bare", opts.fullscreen && "fullmap-body"].filter(Boolean).join(" ") || undefined}>
        {opts.fullscreen ? (
          <main class="fullmap">{props.children}</main>
        ) : (
          <>
        <a class="skip-link" href="#main">
          {t("ข้ามไปที่เนื้อหา", "Skip to content")}
        </a>
        <header class="topbar">
          <a href={member ? "/events" : "/"} class="brand" aria-label="Jurrgun">
            <BrandMark /> Jurrgun <small lang="th">เจอกัน</small>
          </a>
          {/* Prototype notice: a small chip, the full sentence one tap away. */}
          <details class="proto-chip">
            <summary>{t("ทดลอง", "Prototype")}</summary>
            <p>{t("เวอร์ชันทดลอง อย่าใส่ข้อมูลส่วนตัวจริง", "Prototype: please don't use real personal data")}</p>
          </details>
          {/* Laptops: the main menu sits in the header (top-down); phones use the bottom bar. */}
          {member && !opts.admin && !opts.bare ? <TabBar v={v} tab={opts.tab ?? "none"} top /> : null}
          <nav class="top-actions">
            {staff ? <a href="/admin" class="chip">{t("ทีมงาน", "Staff")}</a> : null}
            {member ? <NotifMenu t={t} unread={user?.unread ?? 0} /> : null}
            <A11yMenu t={t} />
            <a href={`/lang/${other}?back=${encodeURIComponent(v.path)}`} class="chip" lang={other}>
              {other === "en" ? "EN" : "ไทย"}
            </a>
            {!user ? <a href="/login" class="chip">{t("เข้าสู่ระบบ", "Sign in")}</a> : null}
          </nav>
        </header>
        {opts.admin ? <AdminNav v={v} /> : null}
        <main id="main" tabindex={-1} class={opts.admin ? "wrap wide" : "wrap"}>
          {props.children}
        </main>
        <footer class="foot">
          <a href="/faq">{t("คำถามที่พบบ่อย", "FAQ")}</a>
          <a href="/learn">{t("เรียนรู้", "Learn")}</a>
          <a href="/privacy">{t("ความเป็นส่วนตัว", "Privacy")}</a>
          <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
          <a href="/terms">{t("ข้อกำหนด", "Terms")}</a>
          <span>{t(BRAND.tagline.th, BRAND.tagline.en)}</span>
          <span class="foot-endorse">🏛️ {t(BRAND.bma.th, BRAND.bma.en)}</span>
        </footer>
          </>
        )}
        {member && !opts.admin && !opts.bare ? <TabBar v={v} tab={opts.tab ?? "none"} /> : null}
        <script dangerouslySetInnerHTML={{ __html: A11Y_MENU_JS + ";" + A11Y_FORM_JS }} />
        {opts.admin ? <script dangerouslySetInnerHTML={{ __html: TABLE_FILTER_JS }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: ALIVE_JS }} />
        {member && !opts.fullscreen ? <script dangerouslySetInnerHTML={{ __html: NOTIF_JS }} /> : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`,
          }}
        />
        {/* Signed out (or the session ended): forget any table saved for offline on this device. The offline page is cached signed-out, so it is left out. */}
        {!user && v.path !== "/offline" ? <script dangerouslySetInnerHTML={{ __html: CLEAR_OFFLINE_JS }} /> : null}
      </body>
    </html>
  );
}

/** Line icons for the tab bar (emoji render differently on every phone). */
function Icon(props: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d={props.d} />
    </svg>
  );
}
/** Small drawn icons for facts on cards (time, place, language), in the nav's stroke style (Phase 3: emoji stay for warmth, controls and facts get drawn icons). */
export function FactIcon(props: { name: "time" | "place" | "lang" }) {
  const d = {
    time: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
    place: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    lang: "M4 6h16v10H9l-5 4V6Zm4 4h8M8 13h5",
  }[props.name];
  return (
    <svg class="fact-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const TAB_ICONS = {
  events: <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z" />,
  learn: <Icon d="M3 5.5C5 4.5 7.5 4.3 12 6c4.5-1.7 7-1.5 9-.5v13c-2-1-4.5-1.2-9 .5-4.5-1.7-7-1.5-9-.5v-13ZM12 6v13.5" />,
  mine: <Icon d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5V7Zm10-2v14" />,
  connections: <Icon d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5m2.5 3.5c1.5.8 2.4 2.6 2.5 5.5" />,
  me: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />,
  buddy: <Icon d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20c.4-3.3 2.6-5.5 5.5-5.5 1.6 0 3 .7 4 1.8 1-1.1 2.4-1.8 4-1.8 2.9 0 5.1 2.2 5.5 5.5" />,
};

function TabBar(props: { v: View; tab: Tab; top?: boolean }) {
  const { t } = props.v;
  // Same five places on every page; "My events" is the big centre button
  // (your pass lives there), like the Sanroo map's centre action. Bangkok
  // Buddy is a core tab; Learn lives at the top of Me (and the footer).
  const items: [Tab, string, Child, string][] = [
    ["events", "/events", TAB_ICONS.events, t("ค้นหา", "Discover")],
    ["buddy", "/buddy", TAB_ICONS.buddy, t("บัดดี้", "Buddy")],
    // "นัดของฉัน", not "ของฉัน": it sat next to "ฉัน" (Me) and read as the same word (Phase 3).
    ["mine", "/me/events", TAB_ICONS.mine, t("นัดของฉัน", "My events")],
    ["connections", "/connections", TAB_ICONS.connections, t("คนรู้จัก", "My people")],
    // City Pulse lives under Me (and in the Discover ticker).
    ["me", "/settings", TAB_ICONS.me, t("ฉัน", "Me")],
  ];
  // Unread chats show on My people, where Chats live: the same pill as the bell, and the count in the name.
  const chats = props.v.user?.chatUnread ?? 0;
  return (
    <nav class={props.top ? "top-nav" : "tabbar"} aria-label={t("เมนูหลัก", "Main")}>
      {items.map(([key, href, icon, text]) => (
        <a
          href={href}
          class={`${key === "mine" ? "center " : ""}${props.tab === key || (key === "me" && (props.tab === "pulse" || props.tab === "learn")) ? "on" : ""}`.trim() || undefined}
          aria-current={props.tab === key ? "page" : undefined}
          aria-label={key === "connections" && chats > 0 ? t(`${text} แชตยังไม่ได้อ่าน ${chats}`, `${text}, ${chats} unread ${chats === 1 ? "chat" : "chats"}`) : undefined}
        >
          <span aria-hidden="true">{icon}</span>
          {text}
          {key === "connections" ? <UnreadCount n={chats} class="tab-badge" /> : null}
        </a>
      ))}
    </nav>
  );
}

function AdminNav(props: { v: View }) {
  const { t, user, path } = props.v;
  const role = user?.account.role ?? "user";
  const all = role === "bma_admin";
  const links: [string, string, boolean][] = [
    ["/admin", t("ภาพรวม", "Overview"), true],
    ["/admin/events", t("กิจกรรม", "Events"), all || ["host", "partner_admin", "circle_head"].includes(role)],
    ["/admin/review", t("ตรวจกิจกรรม", "Event review"), all || role === "moderator"],
    ["/host", t("🎪 จัดกิจกรรม", "🎪 Host an event"), all || role === "partner_admin" || role === "host" || role === "circle_head"],
    ["/admin/moderation", t("รายงาน", "Moderation"), all || role === "moderator"],
    ["/admin/users", t("ผู้ใช้", "Users"), all || role === "moderator"],
    ["/admin/pulse", "City Pulse", all],
    ["/admin/insights", t("ข้อมูลเชิงลึก", "Insights"), all || role === "insight_viewer"],
    ["/admin/partners", t("พาร์ตเนอร์และสิทธิ์", "Partners & roles"), all],
    ["/admin/audit", t("บันทึกการตรวจสอบ", "Audit log"), all],
    ["/events", t("← แอปสมาชิก", "← Member app"), true],
  ];
  return (
    <nav class="adminnav" aria-label={t("เมนูทีมงาน", "Staff menu")}>
      {links
        .filter(([, , ok]) => ok)
        .map(([href, text]) => (
          <a href={href} class={path === href || (href !== "/admin" && path.startsWith(href)) ? "on" : ""}>
            {text}
          </a>
        ))}
    </nav>
  );
}

// ------------------------------------------------------------ components --

export function Notice(props: { kind?: "ok" | "error" | "info" | "warn"; class?: string; children: Child }) {
  return (
    <div class={`notice ${props.kind ?? "info"}${props.class ? ` ${props.class}` : ""}`} role={props.kind === "error" ? "alert" : "status"}>
      {props.children}
    </div>
  );
}

export function Card(props: { children: Child; class?: string; href?: string }) {
  if (props.href) {
    return (
      <a href={props.href} class={`card link ${props.class ?? ""}`}>
        {props.children}
      </a>
    );
  }
  return <section class={`card ${props.class ?? ""}`}>{props.children}</section>;
}

export function Tag(props: { children: Child; tone?: "accent" | "warn" | "muted" | "ok" | "love" }) {
  return <span class={`tag ${props.tone ?? ""}`}>{props.children}</span>;
}

export function Empty(props: { children: Child }) {
  return <p class="empty">{props.children}</p>;
}

export function Field(props: {
  label: string;
  name: string;
  type?: string;
  value?: string | number | null;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  autocomplete?: string;
  maxlength?: number;
  pattern?: string;
  /** Password fields: labels for a Show / Hide toggle (needs JS; without it the field stays hidden-text). */
  reveal?: { show: string; hide: string; caps?: string };
  /** What's wrong with the value, shown under the field and read with it. */
  error?: string;
}) {
  const id = `f-${props.name}`;
  const described = describedBy(id, props.hint, props.error);
  const input = (
      <input
        id={id}
        aria-describedby={described}
        aria-invalid={props.error ? "true" : undefined}
        name={props.name}
        type={props.type ?? "text"}
        value={props.value ?? ""}
        required={props.required}
        placeholder={props.placeholder}
        min={props.min}
        max={props.max}
        autocomplete={props.autocomplete}
        maxlength={props.maxlength}
        pattern={props.pattern}
      />
  );
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      {props.reveal && props.type === "password" ? (
        <div class="pw">
          {input}
          <button
            type="button"
            class="pw-toggle"
            aria-controls={id}
            aria-pressed="false"
            data-show={props.reveal.show}
            data-hide={props.reveal.hide}
            onclick="var i=document.getElementById(this.getAttribute('aria-controls')),s=i.type==='password';i.type=s?'text':'password';this.setAttribute('aria-pressed',String(s));this.textContent=s?this.dataset.hide:this.dataset.show"
          >
            {props.reveal.show}
          </button>
        </div>
      ) : (
        input
      )}
      {props.type === "password" ? (
        <small class="caps-warn" role="status" hidden>
          <span aria-hidden="true">⇪ </span>
          {props.reveal?.caps ?? "Caps Lock"}
        </small>
      ) : null}
      <FieldNotes id={id} hint={props.hint} error={props.error} />
    </div>
  );
}

/** Ids of a field's hint and error, for aria-describedby. */
function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
}

/** A field's hint and error, each with the id its input points at. */
function FieldNotes(props: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {props.hint ? <small id={`${props.id}-hint`}>{props.hint}</small> : null}
      {props.error ? (
        <small id={`${props.id}-err`} class="field-err">
          <span aria-hidden="true">⚠ </span>
          {props.error}
        </small>
      ) : null}
    </>
  );
}

export function TextArea(props: { label: string; name: string; value?: string | null; rows?: number; hint?: string; required?: boolean; maxlength?: number; error?: string }) {
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <textarea
        id={id}
        name={props.name}
        rows={props.rows ?? 3}
        required={props.required}
        maxlength={props.maxlength}
        aria-describedby={describedBy(id, props.hint, props.error)}
        aria-invalid={props.error ? "true" : undefined}
      >
        {props.value ?? ""}
      </textarea>
      <FieldNotes id={id} hint={props.hint} error={props.error} />
    </div>
  );
}

type Opt = { value: string; th: string; en: string };

export function Select(props: { label: string; name: string; options: Opt[]; value?: string | null; lang: Lang; required?: boolean; blank?: string; hint?: string }) {
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <select id={id} name={props.name} required={props.required} aria-describedby={describedBy(id, props.hint)}>
        {props.blank !== undefined ? <option value="">{props.blank}</option> : null}
        {props.options.map((o) => (
          <option value={o.value} selected={o.value === props.value}>
            {props.lang === "en" ? o.en : o.th}
          </option>
        ))}
      </select>
      <FieldNotes id={id} hint={props.hint} />
    </div>
  );
}

/** Pill-style checkboxes or radios. */
export function Choices(props: {
  legend: string;
  name: string;
  options: Opt[];
  values?: string[];
  lang: Lang;
  type?: "checkbox" | "radio";
  required?: boolean;
  hint?: string;
}) {
  const type = props.type ?? "checkbox";
  const selected = new Set(props.values ?? []);
  const hintId = props.hint ? `c-${props.name}-hint` : undefined;
  return (
    <fieldset class="choices" aria-describedby={hintId}>
      <legend>{props.legend}</legend>
      {props.hint ? <small id={hintId}>{props.hint}</small> : null}
      <div class="pills">
        {props.options.map((o) => (
          <label class="pill">
            <input
              type={type}
              name={props.name}
              value={o.value}
              checked={selected.has(o.value)}
              required={type === "radio" ? props.required : undefined}
            />
            <span>{props.lang === "en" ? o.en : o.th}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle(props: { name: string; label: string; checked?: boolean; hint?: string }) {
  return (
    <label class="toggle">
      <input type="checkbox" name={props.name} value="1" checked={props.checked} />
      <span>
        {props.label}
        {props.hint ? <small>{props.hint}</small> : null}
      </span>
    </label>
  );
}

/**
 * A small ⓘ that opens one or two extra lines: helper text stays one short
 * line, and anything longer waits behind this (owner, 2026-10-16).
 */
export function MoreInfo(props: { t: T; children: Child }) {
  return (
    <details class="more-info">
      <summary>
        <span aria-hidden="true">ⓘ</span>
        <span class="sr-only">{props.t("เพิ่มเติม", "More about this")}</span>
      </summary>
      <div class="more-info-body">{props.children}</div>
    </details>
  );
}

export function Button(props: { children: Child; kind?: "primary" | "ghost" | "danger"; name?: string; value?: string; formaction?: string }) {
  return (
    <button type="submit" class={`btn ${props.kind ?? "primary"}`} name={props.name} value={props.value} formaction={props.formaction}>
      {props.children}
    </button>
  );
}

export function LinkButton(props: { href: string; children: Child; kind?: "primary" | "ghost" | "danger" }) {
  return (
    <a href={props.href} class={`btn ${props.kind ?? "primary"}`}>
      {props.children}
    </a>
  );
}

/**
 * Type-to-filter for a long staff table: hides rows that don't contain the
 * text and says how many are showing. Pair with `<table id={target}>`.
 */
export function TableFilter(props: { t: T; target: string; label: string }) {
  const { t, target } = props;
  const id = `tf-${target}`;
  return (
    <div class="tfilter">
      <label for={id}>{props.label}</label>
      <input type="search" id={id} data-filter={target} autocomplete="off" />
      <small id={`${id}-st`} role="status" data-tpl={t("แสดง {n} จาก {t} รายการ", "Showing {n} of {t}")} />
    </div>
  );
}

/** The browser side of TableFilter. */
export const TABLE_FILTER_JS = `(function(){document.querySelectorAll("input[data-filter]").forEach(function(i){var tb=document.getElementById(i.dataset.filter);if(!tb)return;var rows=[].slice.call(tb.querySelectorAll("tbody tr")),st=document.getElementById(i.id+"-st");
function run(){var q=i.value.trim().toLowerCase(),n=0;rows.forEach(function(r){var on=!q||r.textContent.toLowerCase().indexOf(q)>-1;r.hidden=!on;if(on)n++});if(st)st.textContent=q?st.dataset.tpl.replace("{n}",n).replace("{t}",rows.length):""}
i.addEventListener("input",run);if(i.value)run()})})()`;

/** Rows per page, the 1-based page asked for, and the rows to skip. */
export function pageOf(raw: string | undefined, size: number): { page: number; offset: number } {
  const n = Number.parseInt(raw ?? "", 10);
  const page = Number.isFinite(n) && n >= 1 && n <= 100_000 ? n : 1;
  return { page, offset: (page - 1) * size };
}

/**
 * "Showing 51–100 of 142" with Previous / Next links for a server-paged
 * table. `href(n)` builds the link to page n, keeping the page's filters.
 */
export function Pager(props: { t: T; label: string; page: number; size: number; shown: number; total: number; href: (page: number) => string }) {
  const { t, page, size, shown, total } = props;
  if (total === 0 || shown === 0) return null;
  const from = (page - 1) * size + 1;
  const to = from + shown - 1;
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <nav class="pager" aria-label={props.label}>
      <p>{t(`แสดง ${fmt(from)} ถึง ${fmt(to)} จาก ${fmt(total)} รายการ`, `Showing ${fmt(from)} to ${fmt(to)} of ${fmt(total)}`)}</p>
      {page > 1 ? (
        <a href={props.href(page - 1)} rel="prev" class="btn ghost">
          {t("← ก่อนหน้า", "← Previous")}
        </a>
      ) : null}
      {to < total ? (
        <a href={props.href(page + 1)} rel="next" class="btn ghost">
          {t("ถัดไป →", "Next →")}
        </a>
      ) : null}
    </nav>
  );
}

export function Stat(props: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div class="stat">
      <div class="stat-v">{props.value === null ? "<10" : props.value}</div>
      <div class="stat-l">{props.label}</div>
      {props.hint ? <small>{props.hint}</small> : null}
    </div>
  );
}

/**
 * Redirect target from a form's `next`/`back` field, restricted to this site.
 * Browsers drop tabs and newlines and treat \ like /, so "/\t/evil.example"
 * would leave the site: any control character or backslash is refused.
 */
export function safeNext(raw: string | undefined | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\x00-\x1f\x7f\\]/.test(raw)) return fallback;
  return raw;
}

/** Form helpers: hono's parseBody gives string | File | (string|File)[]. */
export function str(v: unknown): string {
  // NUL can't be stored in Postgres text: drop it rather than fail the request.
  if (typeof v === "string") return v.replace(/\0/g, "").trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].replace(/\0/g, "").trim();
  return "";
}

export function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

export function int(v: unknown, fallback: number): number {
  const n = Number(str(v));
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback;
}

/** Discover's floating Map ⇄ Cards switch: one tap between the two views. */
export function ViewSwitch(props: { t: T; on: "map" | "cards"; mapHref: string; cardsHref: string }) {
  const { t } = props;
  return (
    <nav class="view-switch" aria-label={t("มุมมอง", "View")}>
      <a href={props.mapHref} class={props.on === "map" ? "on" : undefined} aria-current={props.on === "map" ? "page" : undefined}>
        🗺️ <span class="vs-l">{t("แผนที่", "Map")}</span>
      </a>
      <a href={props.cardsHref} class={props.on === "cards" ? "on" : undefined} aria-current={props.on === "cards" ? "page" : undefined}>
        🃏 <span class="vs-l">{t("การ์ด", "Cards")}</span>
      </a>
    </nav>
  );
}
