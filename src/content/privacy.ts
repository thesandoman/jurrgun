/**
 * The facts behind the privacy notice (/privacy), the Terms (/terms), the
 * consent centre (/settings/consents) and "How we keep you safe" (/safety/how),
 * in one place so the pages and the tests read the same list.
 *
 * Owner rule (16 Oct 2026, design/reference/privacy-risk-assessment.md §7):
 * where the notice promises more than the code does, the code changes; where
 * the code does something reasonable the notice leaves out, the notice says so.
 * test/privacy-promises.test.ts checks each line here against the code.
 */
export type Text = { th: string; en: string };

/** Shown at the top of the notice and the Terms. */
export const NOTICE_DATE: Text = { th: "16 ตุลาคม 2569", en: "16 October 2026" };

// ------------------------------------------------------------- periods --

export type Unit = "hours" | "days" | "months" | "years";
export type Period = { n: number; unit: Unit };

const UNIT: Record<Unit, [string, string, string]> = {
  hours: ["ชั่วโมง", "hour", "hours"],
  days: ["วัน", "day", "days"],
  months: ["เดือน", "month", "months"],
  years: ["ปี", "year", "years"],
};

/** "2 ปี" / "2 years". */
export function periodText(p: Period): Text {
  const [th, one, many] = UNIT[p.unit];
  return { th: `${p.n} ${th}`, en: `${p.n} ${p.n === 1 ? one : many}` };
}

/** The same period in the unit the code uses (hours stay hours, the rest become days). */
export function periodDays(p: Period): number {
  if (p.unit === "hours") return p.n;
  if (p.unit === "days") return p.n;
  if (p.unit === "years") return p.n * 365;
  return p.n % 12 === 0 ? (p.n / 12) * 365 : p.n * 30;
}

// ----------------------------------------------------------- retention --

/**
 * How long each kind of record is kept. `code` names the exported constant in
 * src/services/retention.ts (or the file in `from`) that enforces the period;
 * the test checks the two agree. Items without a period describe an event
 * ("deleted at once", "until you remove it").
 */
export type RetentionItem = { what: Text; keep: Text; period?: Period; code?: string | RegExp; from?: string };

export const RETENTION: RetentionItem[] = [
  {
    what: { th: "ข้อมูลเปิดใจมากกว่าเพื่อนและเป้าหมายการเดต", en: "Open to something more details and dating goals" },
    keep: { th: "ลบทันทีเมื่อกลับเป็นโหมดเพื่อน หรือถอนความยินยอม", en: "deleted at once when you switch back to friends only or withdraw consent" },
  },
  {
    what: { th: "ตัวเลือกหลังกิจกรรมที่ไม่ตรงกัน", en: "Post-event choices that weren't mutual" },
    keep: { th: "ลบเมื่อครบ", en: "deleted after" },
    period: { n: 72, unit: "hours" },
    code: "PEOPLE_WINDOW_HOURS",
    from: "domain/rules",
  },
  {
    what: { th: "สัญญาณว่าอยากคุยเรื่องอะไรที่งาน", en: "What you'd like to talk about at an event" },
    keep: { th: "ลบหลังกิจกรรมจบ", en: "deleted after the event ends, within" },
    period: { n: 7, unit: "days" },
    code: "SIGNAL_RETENTION_DAYS",
  },
  {
    what: { th: "แชตและรูปในแชต", en: "Chats and chat photos" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 180, unit: "days" },
    code: "CHAT_RETENTION_DAYS",
  },
  {
    what: { th: "การถามว่าถึงบ้านปลอดภัยไหม", en: "\"Home safe?\" check-ins" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 180, unit: "days" },
    code: "CHAT_RETENTION_DAYS",
  },
  {
    what: { th: "รายละเอียดการเช็กอินและโต๊ะ", en: "Check-in and table details" },
    keep: { th: "เหลือแค่ยอดรวมหลัง", en: "kept only as totals after" },
    period: { n: 12, unit: "months" },
    code: "CHECKIN_RETENTION_DAYS",
  },
  {
    what: { th: "คำตอบ City Pulse และแบบสอบถามความรู้สึก", en: "City Pulse and wellbeing answers" },
    keep: { th: "เก็บภายใต้รหัสวิจัย ลบหลัง", en: "kept under a research code, deleted after" },
    period: { n: 24, unit: "months" },
    code: "RESEARCH_RETENTION_DAYS",
  },
  {
    what: { th: "การแจ้งเตือนที่อ่านแล้ว", en: "Notifications you've read" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 90, unit: "days" },
    code: /NOTIFICATION.*_DAYS$/,
  },
  {
    what: { th: "รายงาน การดำเนินการของทีมงาน และใบเตือน", en: "Reports, moderation actions and strikes" },
    keep: { th: "เก็บเพื่อความปลอดภัย ลบหลัง", en: "kept for safety, deleted after" },
    period: { n: 2, unit: "years" },
    code: /^(REPORTS?|MODERATION|SAFETY)_.*DAYS$/,
  },
  {
    what: { th: "บันทึกการทำงานของระบบ", en: "The system's audit log" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 1, unit: "years" },
    code: /^AUDIT_.*DAYS$/,
  },
  {
    what: { th: "การเข้าสู่ระบบในเครื่อง", en: "Signed-in sessions" },
    keep: { th: "หมดอายุหลัง", en: "expire after" },
    period: { n: 30, unit: "days" },
    code: "SESSION_DAYS",
    from: "lib/session",
  },
  {
    what: { th: "ความพยายามเข้าสู่ระบบและรหัสทางอีเมล", en: "Sign-in attempts and email codes" },
    keep: { th: "ลบหลัง", en: "deleted after" },
    period: { n: 24, unit: "hours" },
    code: "LOGIN_ATTEMPT_RETENTION_HOURS",
  },
  {
    what: { th: "คนรู้จัก ช่องทางติดต่อที่แชร์ และลิงก์โซเชียล", en: "Connections, shared contacts and social links" },
    keep: { th: "จนกว่าคุณหรืออีกฝ่ายจะลบ หรือปิดบัญชี", en: "until you or the other person removes them, or an account is closed" },
  },
  {
    what: { th: "บัญชีที่ปิดแล้ว", en: "Closed accounts" },
    keep: {
      th: "ซ่อนโปรไฟล์ ลบรูป ลิงก์โซเชียล และการเข้าสู่ระบบด้วย Google LINE หรืออีเมลทันที ส่วนการเข้าร่วมกิจกรรมและคะแนนความพึงพอใจจะเก็บไว้แบบไม่ระบุตัวตนเพื่อนับยอดรวม แล้วลบข้อมูลที่เหลือหลัง",
      en: "profile hidden, and photos, social links and Google, LINE or email sign-in removed at once; event attendance and ratings stay, with nothing that identifies you, for totals; the rest is deleted after",
    },
    period: { n: 30, unit: "days" },
    code: "DEACTIVATED_RETENTION_DAYS",
  },
];

/** Said once under the list. */
export const RETENTION_NOTES: Text[] = [
  { th: "ระบบลบข้อมูลตามรายการนี้ทุกวัน", en: "Our clean-up runs every day." },
  {
    th: "ถ้ามีรายงานเรื่องบัญชีที่ยังตรวจไม่เสร็จ เราจะเก็บบัญชีนั้นไว้จนกว่าจะตรวจเสร็จ",
    en: "If a report about an account is still open, we keep that account until the report is closed.",
  },
  {
    th: "เหตุผลที่ออก (ถ้าบอกเรา) เก็บโดยไม่มีชื่อบัญชี จึงโยงกลับมาหาคุณไม่ได้",
    en: "Reasons for leaving, if you give them, are kept without your account, so they can't be linked back to you.",
  },
];

// -------------------------------------------------------------- cookies --

/** Every cookie the app sets. test/privacy-promises.test.ts greps setCookie calls against this list. */
export type CookieItem = { name: string; what: Text; life: Text };

export const COOKIES: CookieItem[] = [
  { name: "bkk_sid", what: { th: "ให้คุณเข้าสู่ระบบค้างไว้", en: "Keeps you signed in" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "lang", what: { th: "ภาษาที่คุณเลือก", en: "Your language" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "jg_intro", what: { th: "จำว่าคุณดูหน้าแนะนำแล้ว", en: "Remembers you've seen the intro" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "jg_src", what: { th: "ลิงก์แคมเปญหรือพาร์ตเนอร์ที่พาคุณมา", en: "The campaign or partner link that brought you" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_oauth", what: { th: "ระหว่างเข้าสู่ระบบด้วย Google หรือ LINE", en: "While you sign in with Google or LINE" }, life: { th: "10 นาที", en: "10 minutes" } },
  { name: "bkk_invite", what: { th: "ลิงก์ชวนจากเพื่อน จนกว่าคุณจะสมัครเสร็จ", en: "A friend's invite link, until you finish signing up" }, life: { th: "7 วัน", en: "7 days" } },
  { name: "bkk_intent", what: { th: "สิ่งที่คุณเลือกในหน้าต้อนรับ (เพื่อน หรือเปิดใจมากกว่าเพื่อน)", en: "Your choice on the welcome screen (friends, or open to more)" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_dating_pending", what: { th: "คำตอบเรื่องเดตตอนสมัคร เก็บไว้ในเครื่องคุณจนกว่าจะยินยอม ถ้าไม่ยินยอมจะถูกลบ", en: "Your sign-up dating answers, kept on your device until you consent; dropped if you don't" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_quiz_skip", what: { th: "จำว่าคุณข้ามแบบทดสอบไว้ก่อน", en: "Remembers you skipped the quiz for now" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "jg_new", what: { th: "จำว่าคุณเพิ่งย้ายมากรุงเทพฯ", en: "Remembers you're new to Bangkok" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "jg_intl", what: { th: "จำว่าคุณมาจากต่างประเทศ", en: "Remembers you're from abroad" }, life: { th: "30 วัน", en: "30 days" } },
  { name: "bkk_quiz_hint", what: { th: "ซ่อนคำแนะนำให้ทำแบบทดสอบ", en: "Hides the quiz hint" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "bkk_for_you", what: { th: "ซ่อนแถบแนะนำสำหรับคุณ", en: "Hides the For you strip" }, life: { th: "1 ปี", en: "1 year" } },
  { name: "bkk_pev_", what: { th: "เปิดกิจกรรมส่วนตัวจากลิงก์ที่ได้รับ (หนึ่งคุกกี้ต่อกิจกรรม)", en: "Opens a private event from its link (one per event)" }, life: { th: "60 วัน", en: "60 days" } },
];

/** Kept only in this browser (localStorage); never sent to us. */
export const DEVICE_STORAGE: CookieItem[] = [
  { name: "bkk-a11y", what: { th: "ขนาดตัวอักษร ธีมสว่างหรือมืด และการตั้งค่าการเข้าถึง", en: "Text size, light or dark theme and accessibility settings" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-discover", what: { th: "มุมมองแผนที่หรือรายการที่เลือกไว้", en: "Your map or list view" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-map-style", what: { th: "แบบแผนที่", en: "Your map style" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
  { name: "bkk-key-pos", what: { th: "ตำแหน่งกล่องคำอธิบายบนแผนที่", en: "Where you moved the map key" }, life: { th: "จนกว่าคุณจะลบ", en: "until you clear it" } },
];

// ------------------------------------------------------- who else -----

export type Processor = { name: string; does: Text; sees: Text };

export const PROCESSORS: Processor[] = [
  {
    name: "SV Cloud · Cloudflare",
    does: { th: "โฮสต์แอป ฐานข้อมูล และไฟล์ (เช่น รูป)", en: "Host the app, its database and files such as photos" },
    sees: { th: "ข้อมูลทั้งหมดที่แอปเก็บ ในฐานะผู้ให้บริการของเรา", en: "Everything the app stores, as our service providers" },
  },
  {
    name: "Google · LINE",
    does: { th: "ให้เข้าสู่ระบบ ถ้าคุณเลือกใช้ และแชร์ลงใน LINE เมื่อคุณแตะ", en: "Sign-in, if you choose it, and sharing to LINE when you tap it" },
    sees: { th: "ว่าคุณใช้ Jurrgun เราขอแค่รหัสบัญชี ไม่ขออีเมลหรือรายชื่อเพื่อน และสิ่งที่คุณเลือกแชร์", en: "That you use Jurrgun (we only ask for an account ID, never your email or friends), and whatever you choose to share" },
  },
  {
    name: "Resend · Postmark",
    does: { th: "ส่งรหัสเข้าสู่ระบบทางอีเมล เมื่อเปิดใช้", en: "Send sign-in codes by email, once switched on" },
    sees: { th: "อีเมลของคุณและรหัส ตอนส่ง", en: "Your email address and the code, when one is sent" },
  },
  {
    name: "Google · Apple · Mozilla · Microsoft",
    does: { th: "ส่งการแจ้งเตือนไปที่มือถือหรือเบราว์เซอร์ ถ้าคุณเปิด", en: "Deliver notifications to your phone or browser, if you turn them on" },
    sees: { th: "ที่อยู่สำหรับส่งของเครื่องคุณ ข้อความถูกเข้ารหัส อ่านไม่ได้", en: "Your device's push address. Messages are encrypted, so they can't read them" },
  },
  {
    name: "Esri · OpenStreetMap · jsDelivr",
    does: { th: "ภาพแผนที่และโค้ดแผนที่", en: "Map images and the map's code" },
    sees: { th: "IP ของคุณและบริเวณแผนที่ที่เปิด", en: "Your IP address and the map area you view" },
  },
  {
    name: "Google Maps",
    does: { th: "เส้นทางไปสถานที่ เมื่อคุณแตะลิงก์", en: "Directions, when you tap a map link" },
    sees: { th: "สิ่งที่คุณทำใน Google Maps ตามนโยบายของ Google", en: "What you do in Google Maps, under Google's own policy" },
  },
  {
    name: "Open-Meteo",
    does: { th: "สภาพอากาศและฝุ่นในกรุงเทพฯ", en: "Bangkok weather and air quality" },
    sees: { th: "ไม่มีข้อมูลของคุณ เซิร์ฟเวอร์เราขอข้อมูลของกรุงเทพฯ เอง", en: "Nothing about you. Our server asks for Bangkok's weather" },
  },
];

/** PDPA section 28: data may leave Thailand. */
export const TRANSFERS: Text = {
  th: "ข้อมูลอาจถูกส่งหรือเก็บนอกประเทศไทย เครือข่ายของ Cloudflare มีเซิร์ฟเวอร์ทั่วโลก ส่วนผู้ส่งอีเมล ผู้ส่งการแจ้งเตือน และ Esri อยู่ในสหรัฐอเมริกา เราใช้บริการเหล่านี้ภายใต้ข้อตกลงคุ้มครองข้อมูลมาตรฐานของแต่ละราย และส่งเฉพาะข้อมูลที่จำเป็น",
  en: "Data may be sent to or stored outside Thailand. Cloudflare's network has servers around the world, and the email senders, push services and Esri are based in the United States. We use them under each provider's standard data protection terms, and send only what's needed.",
};

// -------------------------------------------------------------- contact --

/** Owner, 16 Oct 2026: the BMA's public contact, as host and overseer. */
export const CONTACT_ADDRESS: Text = {
  th: "กรุงเทพมหานคร (ผู้ดูแลและกำกับบริการ) ศาลาว่าการกรุงเทพมหานคร 173 ถนนดินสอ แขวงเสาชิงช้า เขตพระนคร กรุงเทพฯ 10200 · สายด่วน 1555",
  en: "Bangkok Metropolitan Administration (host and overseer of this service), Bangkok City Hall, 173 Dinso Road, Sao Chingcha, Phra Nakhon, Bangkok 10200 · Hotline 1555",
};

export const PRIVACY_CONTACT: Text = {
  th: `ติดต่อเรื่องข้อมูลส่วนตัว: ${CONTACT_ADDRESS.th}`,
  en: `Privacy contact: ${CONTACT_ADDRESS.en}`,
};

/** The in-app route for a problem with a person or an event. */
export const REPORT_LINE: Text = {
  th: "ถ้าเป็นเรื่องของสมาชิกหรือกิจกรรม กดรายงานในโปรไฟล์ของคนนั้น หรือในหน้ากิจกรรม ทีมงานจะเห็นทันที",
  en: "For a problem with a member or an event, tap Report on their profile or the event page. Our team sees it straight away.",
};

// ------------------------------------------------------------- consents --

/**
 * Every consent category the app records (social_consents.category). The
 * consent centre lists all of them; test/privacy-promises.test.ts fails if the
 * code writes a category that is missing here.
 *
 *   required   needed for the app; withdrawn only by closing the account
 *   toggle     switched on and off on the consent centre
 *   elsewhere  switched where the data is entered (`href`)
 *   withdraw   given where the data is entered (`href`), withdrawn here too
 *   record     a one-off agreement, shown with its date
 */
export type ConsentCategory = {
  key: string;
  control: "required" | "toggle" | "elsewhere" | "withdraw" | "record";
  title: Text;
  hint: Text;
  href?: string;
  sensitive?: boolean;
};

export const CONSENT_CATEGORIES: ConsentCategory[] = [
  {
    key: "service",
    control: "required",
    title: { th: "บัญชีและบริการกิจกรรม", en: "Account and events" },
    hint: { th: "จำเป็นเพื่อให้แอปทำงาน เช่น จัดโต๊ะ แชต และเช็กอิน ยกเลิกได้โดยปิดบัญชี", en: "Needed for the app to work: tables, chat and check-in. Ends when you close your account." },
  },
  {
    key: "safety",
    control: "required",
    title: { th: "ความปลอดภัยและการดูแลชุมชน", en: "Safety and moderation" },
    hint: { th: "ใช้ตรวจรายงานและกันการคุกคาม ยกเลิกได้โดยปิดบัญชี", en: "Used to review reports and stop harassment. Ends when you close your account." },
  },
  {
    key: "personalization",
    control: "toggle",
    title: { th: "จัดโต๊ะตามความสนใจ", en: "Seat me by my interests" },
    hint: { th: "ใช้ความสนใจและภาษาของคุณช่วยจัดโต๊ะ", en: "Uses your interests and languages to help seat you." },
  },
  {
    key: "research",
    control: "toggle",
    title: { th: "City Pulse: ช่วยวิจัยเมือง", en: "City Pulse: city research" },
    hint: { th: "คำตอบเก็บใต้รหัสวิจัย กทม. เห็นแค่ยอดรวมจาก 10 คนขึ้นไป ถ้าปิด เราลบหรือตัดคำตอบเดิมออกจากตัวคุณ", en: "Answers sit under a research code. The BMA only sees totals from 10 or more people. Turn it off and past answers are deleted or unlinked from you." },
  },
  {
    key: "notifications",
    control: "toggle",
    title: { th: "แจ้งเตือนกิจกรรม", en: "Event reminders" },
    hint: { th: "เตือนก่อนกิจกรรมและเมื่อมีที่ว่าง ถ้าไม่ได้เปิด เราจะไม่ส่ง", en: "Reminders before events and when a spot opens. If it's not on, we don't send them." },
  },
  {
    key: "profile_links",
    control: "toggle",
    title: { th: "ให้คนรู้จักเห็นลิงก์โซเชียล", en: "Show my social links to my people" },
    hint: { th: "เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย เพิ่มหรือลบลิงก์ได้ที่แก้ไขโปรไฟล์", en: "Only mutual connections see them. Add or remove links in Edit profile." },
  },
  {
    key: "relationship_data",
    control: "elsewhere",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "สถานะความสัมพันธ์", en: "Relationship status" },
    hint: { th: "ส่วนตัว ทีมงานไม่เห็น ใช้กับเรื่องเปิดใจมากกว่าเพื่อนเท่านั้น", en: "Private, never shown to staff. Used only for Open to something more." },
  },
  {
    key: "gender_data",
    control: "elsewhere",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "เพศ (ส่วนตัว)", en: "Gender (private)" },
    hint: { th: "ใช้กับโต๊ะและบัดดี้สำหรับผู้หญิงเท่านั้น ไม่แสดงให้ใครเห็น", en: "Used for women-only tables and buddies. Never shown to anyone." },
  },
  {
    key: "romance_data",
    control: "withdraw",
    href: "/settings/connections",
    sensitive: true,
    title: { th: "ข้อมูลเปิดใจมากกว่าเพื่อน", en: "Open to something more data" },
    hint: { th: "อัตลักษณ์ทางเพศ คนที่อยากเจอ และเป้าหมายการเดต ถ้าถอน เราลบทันที", en: "Gender identity, who you'd like to meet and dating goals. Withdraw and they're deleted at once." },
  },
  {
    key: "guide",
    control: "record",
    title: { th: "สัญญาในคู่มือเริ่มต้น", en: "Your promise in the first-time guide" },
    hint: { th: "บันทึกว่าคุณรับหลักปฏิบัติของชุมชนแล้ว", en: "A record that you agreed to the code of conduct." },
  },
];
