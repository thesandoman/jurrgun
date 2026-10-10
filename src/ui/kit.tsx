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
import { BrandMark } from "./brand";
import { A11Y_HEAD_JS, A11Y_MENU_JS, A11yMenu } from "./a11y";

export type View = { lang: Lang; t: T; user: CurrentUser | null; path: string };

export function view(c: Context<AppEnv>): View {
  const lang = c.var.lang ?? "th";
  return { lang, t: tr(lang), user: c.var.user ?? null, path: new URL(c.req.url).pathname };
}

type Tab = "events" | "learn" | "mine" | "connections" | "pulse" | "me" | "admin" | "none";

export type PageOpts = {
  title: string;
  tab?: Tab;
  /** Staff pages get a wider layout and the admin side menu. */
  admin?: boolean;
  status?: 200 | 400 | 403 | 404 | 409;
  /** Focused task screens (onboarding, quiz): no tab bar, no footer. */
  bare?: boolean;
  /** Full-screen map screens (Discover): the page draws its own floating header. */
  fullscreen?: boolean;
};

/** `?notice=` keys pages can redirect with. */
const NOTICES: Record<string, [string, string]> = {
  saved: ["บันทึกแล้ว", "Saved"],
  welcome: ["ยินดีต้อนรับสู่ Jurrgun!", "Welcome to Jurrgun!"],
  rsvp_confirmed: ["ยืนยันที่นั่งแล้ว — บัตรเข้างานอยู่ใน 'กิจกรรมของฉัน'", "You're in — your pass is in My events"],
  rsvp_waitlisted: ["คุณอยู่ในรายชื่อสำรอง เราจะแจ้งเมื่อมีที่ว่าง", "You're on the waitlist — we'll tell you if a spot opens"],
  cancelled: ["ยกเลิกแล้ว", "Cancelled"],
  late_cancel: ["ยกเลิกแล้ว — การยกเลิกภายใน 24 ชม. นับเป็น 1 strike", "Cancelled — cancelling within 24h counts as 1 strike"],
  offer_accepted: ["รับที่นั่งแล้ว!", "Spot accepted!"],
  checked_in: ["เช็กอินสำเร็จ", "Checked in"],
  choices_saved: ["บันทึกตัวเลือกแล้ว — จะแจ้งเมื่อเลือกตรงกันเท่านั้น", "Saved — you'll only hear if it's mutual"],
  reported: ["ได้รับรายงานแล้ว ทีมงานจะตรวจสอบ", "Report received — our team will review it"],
  blocked: ["บล็อกแล้ว คุณจะไม่เห็นกันอีก", "Blocked — you won't see each other again"],
  thanks: ["ขอบคุณสำหรับความคิดเห็น", "Thanks for your feedback"],
  shared: ["แชร์ช่องทางติดต่อแล้ว", "Contact shared"],
  deactivated: ["ปิดบัญชีแล้ว", "Account deactivated"],
  done: ["เรียบร้อย", "Done"],
  connected: ["เชื่อมต่อกันแล้ว!", "You're connected!"],
  offered: ["ส่งข้อเสนอที่นั่งให้คิวถัดไปแล้ว", "Offered the spot to the next person"],
  groups_suggested: ["จัดกลุ่มแนะนำแล้ว — ตรวจสอบแล้วกดเผยแพร่", "Groups suggested — review, then publish"],
  groups_published: ["เผยแพร่กลุ่มแล้ว", "Groups published"],
  notice_sent: ["ส่งประกาศแล้ว", "Notice sent"],
  strikes_recorded: ["บันทึกผู้ไม่มาแล้ว", "No-shows recorded"],
  answered: ["ขอบคุณ! คำตอบของคุณช่วยเมืองได้จริง", "Thanks! Your answer helps the city"],
  buddy_round: ["จับคู่บัดดี้แล้ว", "Buddy round complete"],
  password_changed: ["เปลี่ยนรหัสผ่านแล้ว", "Password changed"],
  vibe_saved: ["บันทึกแล้ว", "Saved"],
};

export function page(c: Context<AppEnv>, opts: PageOpts, body: Child) {
  const v = view(c);
  const noticeKey = c.req.query("notice");
  const notice = noticeKey && NOTICES[noticeKey];
  const errorText = c.req.query("error");
  return c.html(
    <Layout v={v} opts={opts}>
      {notice ? <Notice kind="ok">{v.t(notice[0], notice[1])}</Notice> : null}
      {errorText ? <Notice kind="error">{errorText}</Notice> : null}
      {body}
    </Layout>,
    opts.status ?? 200,
  );
}

function Layout(props: { v: View; opts: PageOpts; children: Child }) {
  const { v, opts } = props;
  const { t, user } = v;
  const member = !!user?.profile?.onboardedAt;
  const staff = user && user.account.role !== "user";
  const other = v.lang === "th" ? "en" : "th";
  return (
    <html lang={v.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{`${opts.title} · Jurrgun`}</title>
        <meta name="description" content="Jurrgun (เจอกัน) — เพื่อนใหม่ในกรุงเทพฯ กลุ่มเล็ก สถานที่จริง ไม่ต้องปัดหา · Meet new friends in Bangkok: small groups, real places, no swiping." />
        <meta name="theme-color" content="#06492a" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <script
          dangerouslySetInnerHTML={{
            __html: A11Y_HEAD_JS,
          }}
        />
      </head>
      <body class={[opts.admin && "admin", opts.bare && "bare", opts.fullscreen && "fullmap-body"].filter(Boolean).join(" ") || undefined}>
        {opts.fullscreen ? (
          <main class="fullmap">{props.children}</main>
        ) : (
          <>
        <div class="proto-banner">
          {t("ต้นแบบ (Prototype) — ห้ามใช้ข้อมูลจริง", "Prototype — please don't use real personal data")}
        </div>
        <header class="topbar">
          <a href={member ? "/events" : "/"} class="brand" aria-label="Jurrgun">
            <BrandMark /> Jurrgun <small lang="th">เจอกัน</small>
          </a>
          <nav class="top-actions">
            {staff ? <a href="/admin" class="chip">{t("ทีมงาน", "Staff")}</a> : null}
            {member ? (
              <a href="/notifications" class="icon-link" aria-label={t("การแจ้งเตือน", "Notifications")}>
                🔔
              </a>
            ) : null}
            <A11yMenu t={t} />
            <a href={`/lang/${other}?back=${encodeURIComponent(v.path)}`} class="chip" lang={other}>
              {other === "en" ? "EN" : "ไทย"}
            </a>
            {!user ? <a href="/login" class="chip">{t("เข้าสู่ระบบ", "Sign in")}</a> : null}
          </nav>
        </header>
        {opts.admin ? <AdminNav v={v} /> : null}
        <main class={opts.admin ? "wrap wide" : "wrap"}>{props.children}</main>
        <footer class="foot">
          <a href="/faq">{t("คำถามที่พบบ่อย", "FAQ")}</a>
          <a href="/learn">{t("เรียนรู้", "Learn")}</a>
          <a href="/privacy">{t("ความเป็นส่วนตัว", "Privacy")}</a>
          <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
          <a href="/terms">{t("ข้อกำหนด", "Terms")}</a>
          <span>{t("โครงการของกรุงเทพมหานคร", "A Bangkok Metropolitan Administration project")}</span>
        </footer>
          </>
        )}
        {member && !opts.admin && !opts.bare ? <TabBar v={v} tab={opts.tab ?? "none"} /> : null}
        <script dangerouslySetInnerHTML={{ __html: A11Y_MENU_JS }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`,
          }}
        />
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
const TAB_ICONS = {
  events: <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z" />,
  learn: <Icon d="M3 5.5C5 4.5 7.5 4.3 12 6c4.5-1.7 7-1.5 9-.5v13c-2-1-4.5-1.2-9 .5-4.5-1.7-7-1.5-9-.5v-13ZM12 6v13.5" />,
  mine: <Icon d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5V7Zm10-2v14" />,
  connections: <Icon d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5m2.5 3.5c1.5.8 2.4 2.6 2.5 5.5" />,
  me: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />,
};

function TabBar(props: { v: View; tab: Tab }) {
  const { t } = props.v;
  // Same five places on every page; "My events" is the big centre button
  // (your pass lives there), like the Sanroo map's centre action.
  const items: [Tab, string, Child, string][] = [
    ["events", "/events", TAB_ICONS.events, t("ค้นหา", "Discover")],
    ["learn", "/learn", TAB_ICONS.learn, t("เรียนรู้", "Learn")],
    ["mine", "/me/events", TAB_ICONS.mine, t("ของฉัน", "My events")],
    ["connections", "/connections", TAB_ICONS.connections, t("คนรู้จัก", "Circle")],
    // City Pulse lives under Me (and in the Discover ticker).
    ["me", "/settings", TAB_ICONS.me, t("ฉัน", "Me")],
  ];
  return (
    <nav class="tabbar" aria-label={t("เมนูหลัก", "Main")}>
      {items.map(([key, href, icon, text]) => (
        <a href={href} class={`${key === "mine" ? "center " : ""}${props.tab === key || (key === "me" && props.tab === "pulse") ? "on" : ""}`.trim() || undefined} aria-current={props.tab === key ? "page" : undefined}>
          <span aria-hidden="true">{icon}</span>
          {text}
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
    ["/admin/events", t("กิจกรรม", "Events"), all || ["host", "partner_admin"].includes(role)],
    ["/admin/moderation", t("รายงาน", "Moderation"), all || role === "moderator"],
    ["/admin/users", t("ผู้ใช้", "Users"), all || role === "moderator"],
    ["/admin/pulse", "City Pulse", all],
    ["/admin/insights", t("ข้อมูลเชิงลึก", "Insights"), all || role === "insight_viewer"],
    ["/admin/partners", t("พาร์ตเนอร์และสิทธิ์", "Partners & roles"), all],
    ["/admin/audit", t("บันทึกการตรวจสอบ", "Audit log"), all],
    ["/events", t("← แอปผู้ใช้", "← Member app"), true],
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

export function Notice(props: { kind?: "ok" | "error" | "info" | "warn"; children: Child }) {
  return (
    <div class={`notice ${props.kind ?? "info"}`} role={props.kind === "error" ? "alert" : "status"}>
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

export function Tag(props: { children: Child; tone?: "accent" | "warn" | "muted" | "ok" }) {
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
  reveal?: { show: string; hide: string };
}) {
  const id = `f-${props.name}`;
  const input = (
      <input
        id={id}
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
      {props.hint ? <small>{props.hint}</small> : null}
    </div>
  );
}

export function TextArea(props: { label: string; name: string; value?: string | null; rows?: number; hint?: string; required?: boolean; maxlength?: number }) {
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <textarea id={id} name={props.name} rows={props.rows ?? 3} required={props.required} maxlength={props.maxlength}>
        {props.value ?? ""}
      </textarea>
      {props.hint ? <small>{props.hint}</small> : null}
    </div>
  );
}

type Opt = { value: string; th: string; en: string };

export function Select(props: { label: string; name: string; options: Opt[]; value?: string | null; lang: Lang; required?: boolean; blank?: string }) {
  const id = `f-${props.name}`;
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <select id={id} name={props.name} required={props.required}>
        {props.blank !== undefined ? <option value="">{props.blank}</option> : null}
        {props.options.map((o) => (
          <option value={o.value} selected={o.value === props.value}>
            {props.lang === "en" ? o.en : o.th}
          </option>
        ))}
      </select>
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
  return (
    <fieldset class="choices">
      <legend>{props.legend}</legend>
      {props.hint ? <small>{props.hint}</small> : null}
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

export function Stat(props: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div class="stat">
      <div class="stat-v">{props.value === null ? "<10" : props.value}</div>
      <div class="stat-l">{props.label}</div>
      {props.hint ? <small>{props.hint}</small> : null}
    </div>
  );
}

/** Redirect target from a form's `next`/`back` field, restricted to this site. */
export function safeNext(raw: string | undefined | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/** Form helpers: hono's parseBody gives string | File | (string|File)[]. */
export function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
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
