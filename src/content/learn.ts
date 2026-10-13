/**
 * FAQ, the "What is Jurrgun" blurb (ABOUT) and the Learn section: meeting
 * people (friends, meetup etiquette, communication, dating, consent),
 * wellbeing (loneliness, inclusion, sexual health) and Bangkok (culture
 * basics, getting around). Bilingual, public, non-explicit and inclusive.
 *
 * Facts about Thai services and law are summarised for general education
 * and must be reviewed by BMA (Health Dept / legal) before public launch —
 * see REVIEW_NOTE. Hotline numbers are national Thai services.
 */

export type Text = { th: string; en: string };
const t = (th: string, en: string): Text => ({ th, en });

export const REVIEW_NOTE = t(
  "ข้อมูลนี้เพื่อการเรียนรู้ทั่วไป ไม่ใช่คำแนะนำทางการแพทย์หรือกฎหมาย หากมีข้อสงสัยโปรดปรึกษาแพทย์หรือสายด่วนด้านล่าง (ฉบับร่างต้นแบบ — รอการตรวจทานจากสำนักอนามัยและฝ่ายกฎหมาย กทม.)",
  "This is general education, not medical or legal advice. If in doubt, talk to a doctor or one of the helplines below. (Prototype draft — pending review by BMA's Health Department and legal team.)",
);

export type Helpline = { number: string; name: Text; when: Text; hours: Text; source: string };

const H24 = t("ตลอด 24 ชม.", "24 hours");

export const HELPLINES: Helpline[] = [
  { number: "191", name: t("ตำรวจ", "Police"), when: t("เหตุฉุกเฉิน อันตรายตอนนี้", "Emergency, danger right now"), hours: H24, source: "https://www.pattayamail.com/thailandnews/24-hour-emergency-hotlines-and-services-to-assist-residents-and-visitors-in-thailand-485355" },
  { number: "1669", name: t("เจ็บป่วยฉุกเฉิน", "Medical emergency"), when: t("บาดเจ็บ หมดสติ ต้องการรถพยาบาล", "Injury, unconsciousness, ambulance"), hours: H24, source: "https://www.pattayamail.com/thailandnews/24-hour-emergency-hotlines-and-services-to-assist-residents-and-visitors-in-thailand-485355" },
  { number: "1300", name: t("ศูนย์ช่วยเหลือสังคม (กระทรวง พม.)", "Social assistance centre (Ministry of Social Development)"), when: t("ความรุนแรง การล่วงละเมิด การคุกคาม", "Violence, abuse, harassment"), hours: t("ตลอด 24 ชม. มีล่ามภาษาอังกฤษ", "24 hours, English interpreters"), source: "https://data.unwomen.org/global-database-on-violence-against-women/country-profile/Thailand/measures/24-Hour%20Hotline%20Service%20at%20the%20Prachabodi%20Centre" },
  { number: "1663", name: t("สายปรึกษาเอดส์และท้องไม่พร้อม", "AIDS & unplanned pregnancy counselling"), when: t("สุขภาพทางเพศ การตรวจ การป้องกัน ท้องไม่พร้อม", "Sexual health, testing, prevention, unplanned pregnancy"), hours: t("ทุกวัน 09.00–21.00 น. ไม่ต้องบอกชื่อ", "Daily 09:00–21:00, anonymous"), source: "https://rsathai.org/en/contents/25730" },
  { number: "1323", name: t("สายด่วนสุขภาพจิต (กรมสุขภาพจิต)", "Mental health hotline (Dept. of Mental Health)"), when: t("เครียด เศร้า ไม่ไหว อยากมีคนคุยด้วย", "Stress, low mood, need someone to talk to"), hours: H24, source: "https://thailand.go.th/event-detail/--3---24-" },
  { number: "1441", name: t("ศูนย์ต่อต้านการฉ้อโกงออนไลน์ (AOC)", "Anti Online Scam Operation Centre (AOC)"), when: t("ถูกหลอกโอนเงิน หลอกรัก — ขออายัดบัญชีได้", "Money or romance scams — can request an account freeze"), hours: H24, source: "https://www.bangkokpost.com/thailand/general/2924862/govt-hails-use-of-1441-hotline" },
  { number: "1155", name: t("ตำรวจท่องเที่ยว", "Tourist Police"), when: t("ชาวต่างชาติที่ต้องการความช่วยเหลือ (หลายภาษา)", "Help for foreign residents and visitors (several languages)"), hours: H24, source: "https://www.touristpolice.go.th/post/tpbnews2025110903" },
  { number: "02-113-6789", name: t("สมาริตันส์แห่งประเทศไทย", "Samaritans of Thailand"), when: t("อยากมีคนรับฟัง คุยได้ทั้งภาษาไทยและอังกฤษ", "Someone to listen, in Thai or English"), hours: t("ทุกวัน 12.00 ถึง 22.00 น.", "Daily 12:00 to 22:00"), source: "https://befrienders.org/find-support-now/samaritans-of-thailand-bangkok-centre" },
];

/** What Jurrgun is, in one or two sentences. Shown on top of /learn; reuse it anywhere. */
export const ABOUT = t(
  "Jurrgun คือแอปพบปะผู้คนในกรุงเทพฯ ที่ช่วยให้คุณมีเพื่อนใหม่และรู้สึกเป็นส่วนหนึ่งของเมือง ผ่านกิจกรรมกลุ่มเล็ก โต๊ะอาหาร และการแฮงเอาต์ในที่จริง แบบทดสอบสั้น ๆ จะบอก ‘ไทป์กรุงเทพฯ’ ของคุณ เพื่อจัดให้นั่งกับคนที่น่าจะคลิกกัน ส่วนเรื่องหัวใจเป็นทางเลือก และเกิดขึ้นเมื่อทั้งสองฝ่ายต้องการเท่านั้น",
  "Jurrgun is a social meetup app for Bangkok that helps you make friends and feel at home in the city through small group meetups, shared tables and hangouts. A short quiz gives you your Bangkok Type so we can seat you with people you'll click with; romance is optional, and only when both people want it.",
);

export type Block =
  | { kind: "p"; text: Text }
  | { kind: "list"; items: Text[] }
  | { kind: "tip"; text: Text }
  | { kind: "link"; text: Text; url: string };

export type Source = { label: string; url: string };

export type Topic = {
  slug: string;
  icon: string;
  title: Text;
  summary: Text;
  sections: { heading: Text; blocks: Block[] }[];
  sources: Source[];
};

/** When the facts and numbers here were last checked against their sources. */
export const LAST_CHECKED = "2026-10-13";

const p = (th: string, en: string): Block => ({ kind: "p", text: t(th, en) });
const list = (...items: [string, string][]): Block => ({ kind: "list", items: items.map(([th, en]) => t(th, en)) });
const tip = (th: string, en: string): Block => ({ kind: "tip", text: t(th, en) });
const link = (th: string, en: string, url: string): Block => ({ kind: "link", text: t(th, en), url });

const WHO_SOCIAL = { label: "WHO: Social connection linked to improved health and reduced risk of early death (2025)", url: "https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death" };
const WHO_COMMISSION = { label: "WHO Commission on Social Connection", url: "https://www.who.int/groups/commission-on-social-connection" };
const GOV_DOS = { label: "Thailand.go.th (Government PR Department, from the Ministry of Culture): Do's and Don'ts in Thailand", url: "https://www.thailand.go.th/issue-focus-detail/009_151" };
const SANROO = "https://sanroo.xyz/";

export const TOPICS: Topic[] = [
  {
    slug: "dating-in-bangkok",
    icon: "🌆",
    title: t("การเดตในกรุงเทพฯ", "Dating in Bangkok"),
    summary: t("เมืองใหญ่ คนเยอะ แต่เจอคนที่ใช่ยาก — เคล็ดลับจากชีวิตจริงในกรุงเทพฯ", "A huge city that can still feel lonely — practical tips for meeting people here."),
    sections: [
      {
        heading: t("ทำไมเจอคนในกรุงเทพฯ ถึงยาก", "Why meeting people here can be hard"),
        blocks: [
          p("รถติด ทำงานดึก อากาศร้อน และชีวิตที่วนอยู่ระหว่างบ้าน–ที่ทำงาน ทำให้หลายคนรู้สึกว่าไม่มีโอกาสเจอคนใหม่ คุณไม่ได้เป็นคนเดียวที่รู้สึกแบบนี้", "Traffic, long working hours, heat and a home–office loop make many people feel they never meet anyone new. You're not the only one."),
          p("การเริ่มจากกิจกรรมที่ชอบ — เดินสำรวจย่านเก่า วิ่งตอนเช้า บอร์ดเกม อาสาสมัคร — ทำให้ได้เจอคนที่สนใจคล้ายกันโดยไม่กดดัน", "Starting from something you enjoy — an old-town walk, a morning run, board games, volunteering — lets you meet like-minded people without pressure."),
        ],
      },
      {
        heading: t("นัดแรกที่ดี", "A good first meet-up"),
        blocks: [
          list(
            ["เลือกที่สาธารณะ มีคนพลุกพล่าน เดินทางง่าย เช่น คาเฟ่ใกล้ BTS/MRT สวนสาธารณะช่วงกลางวัน หรือพิพิธภัณฑ์", "Pick a busy public place that's easy to reach: a café near BTS/MRT, a park in daylight, a museum."],
            ["นัดช่วงสั้น ๆ ก่อน 1–2 ชั่วโมง ถ้าคุยถูกคอค่อยต่อ", "Keep it short — 1–2 hours. Extend it if it's going well."],
            ["เดินทางเอง และวางแผนเส้นทางกลับบ้านไว้ก่อน", "Get there and home on your own, with your route planned."],
            ["บอกเพื่อนว่าไปไหน กับใคร และกลับกี่โมง", "Tell a friend where you're going, who with, and when you'll be back."],
            ["หารค่าใช้จ่ายหรือคุยกันตรง ๆ ว่าใครจ่าย ไม่มีใครติดค้างใคร", "Split the bill or agree who pays — nobody owes anybody anything."],
          ),
        ],
      },
      {
        heading: t("ความหลากหลายในเมืองของเรา", "A diverse city"),
        blocks: [
          p("กรุงเทพฯ มีผู้คนจากทุกภาค ทุกประเทศ ทุกเพศและทุกรสนิยม ตั้งแต่ 23 มกราคม 2568 ประเทศไทยรับรองการสมรสเท่าเทียม คู่รักทุกเพศอายุ 18 ปีขึ้นไปจดทะเบียนสมรสได้ที่สำนักงานเขต ใน Jurrgun ทุกคนได้รับการเคารพเท่ากัน", "Bangkok is home to people from every region, country, gender and orientation. Since 23 January 2025 Thailand recognises marriage equality — couples of any gender aged 18+ can register at any district office. On Jurrgun everyone gets the same respect."),
          p("ถ้าคุณมาจากต่างประเทศ: วัฒนธรรมการเดตอาจต่างกัน — คนไทยหลายคนค่อย ๆ ทำความรู้จัก ให้ความสำคัญกับความสุภาพและครอบครัว ถามและฟังกันมากกว่าเดา", "If you're from abroad: dating culture may differ — many Thais take things slowly and value politeness and family. Ask and listen rather than assume."),
          tip("ไม่ต้องรีบ เพื่อนที่ดีหลายคนเริ่มจากการเจอกันในกลุ่มเล็ก ๆ", "No rush — many great relationships start as friends in a small group."),
        ],
      },
    ],
    sources: [
      { label: "Thailand PRD: Equal marriage law takes effect 23 January 2025", url: "https://thailand.prd.go.th/en/content/category/detail/id/48/iid/356609" },
      { label: "Al Jazeera: Thailand's marriage equality law comes into effect", url: "https://www.aljazeera.com/news/2025/1/23/jubilation-as-thailands-marriage-equality-law-comes-into-effect" },
      { label: "VisitBangkok, BMA's official city guide", url: "https://visit.bangkok.go.th/th" },
    ],
  },
  {
    slug: "consent",
    icon: "🤝",
    title: t("ความยินยอม (Consent)", "Consent"),
    summary: t("‘ใช่’ ต้องชัดเจน เต็มใจ และเปลี่ยนใจได้ทุกเมื่อ", "A real yes is clear, freely given, and can change at any time."),
    sections: [
      {
        heading: t("ความยินยอมคืออะไร", "What consent means"),
        blocks: [
          p("ความยินยอมคือการตกลงอย่างเต็มใจ ชัดเจน และมีสติ ในทุกการสัมผัสหรือกิจกรรมทางเพศ ทุกครั้ง กับทุกคน ไม่ว่าจะเป็นแฟน คู่สมรส หรือคนที่เพิ่งรู้จัก", "Consent is a free, clear and conscious agreement to any touch or sexual activity — every time, with everyone, including partners and spouses."),
          list(
            ["ให้อย่างเต็มใจ — ไม่ถูกกดดัน ขู่ หรือตื๊อ", "Freely given — no pressure, threats or wearing someone down."],
            ["เฉพาะเจาะจง — ‘ใช่’ กับเรื่องหนึ่ง ไม่ได้แปลว่า ‘ใช่’ กับทุกเรื่อง", "Specific — yes to one thing isn't yes to everything."],
            ["เปลี่ยนใจได้ — หยุดได้ทุกเมื่อ แม้จะเริ่มไปแล้ว", "Reversible — anyone can stop at any time, even partway."],
            ["มีสติ — คนที่เมามาก หลับ หรือหมดสติ ให้ความยินยอมไม่ได้", "Conscious — someone very drunk, asleep or passed out cannot consent."],
            ["ความเงียบหรือการไม่ขัดขืน ไม่ใช่ความยินยอม", "Silence or not resisting is not consent."],
          ),
        ],
      },
      {
        heading: t("ถามอย่างไรให้เป็นธรรมชาติ", "How to ask naturally"),
        blocks: [
          list(
            ["“จับมือได้ไหม?”", "“Can I hold your hand?”"],
            ["“โอเคไหม อยากหยุดพักก่อนไหม?”", "“Is this okay? Want to slow down?”"],
            ["“ไม่เป็นไรเลยถ้ายังไม่พร้อม”", "“It's totally fine if you're not ready.”"],
          ),
          tip("ถ้าไม่แน่ใจว่าอีกฝ่ายยินยอม ให้ถือว่า ‘ไม่’ และถามใหม่", "If you're not sure the other person is into it, treat it as a no — and ask."),
        ],
      },
      {
        heading: t("ความยินยอมใน Jurrgun", "Consent on Jurrgun"),
        blocks: [
          p("แอปของเราออกแบบบนหลักความยินยอม: คุณจะเชื่อมต่อกับใครได้ก็ต่อเมื่อเลือกตรงกันทั้งสองฝ่าย ไม่มีใครรู้ว่าคุณไม่ได้เลือกเขา และไม่มีการส่งข้อความหาคนแปลกหน้า", "The app is built on consent: you only connect when both people choose each other, nobody learns that you didn't choose them, and there are no cold messages."),
          p("การกดดัน ตามตื๊อ หรือสัมผัสโดยไม่ได้รับอนุญาตในกิจกรรม เป็นการละเมิดหลักปฏิบัติ — กด ‘รายงาน’ ได้ทันที หรือโทร 191 หากอยู่ในอันตราย", "Pressure, persistence or unwanted touching at an event breaks our code of conduct — use Report straight away, or call 191 if you're in danger."),
        ],
      },
      {
        heading: t("ถ้าเกิดเหตุขึ้นกับคุณ", "If something happened to you"),
        blocks: [
          p("ไม่ใช่ความผิดของคุณ คุณมีสิทธิ์ได้รับความช่วยเหลือ ไปโรงพยาบาลรัฐได้ทันทีเพื่อรับการตรวจ ยาป้องกันการติดเชื้อ (PEP) และยาคุมฉุกเฉิน ศูนย์พึ่งได้ (OSCC) ในโรงพยาบาลรัฐช่วยเหลือผู้ถูกกระทำความรุนแรง หรือโทร 1300 ได้ตลอด 24 ชั่วโมง", "It's not your fault, and help is available. Go to a public hospital as soon as you can for care, HIV-prevention medicine (PEP) and emergency contraception. One Stop Crisis Centres (OSCC) in public hospitals support survivors of violence, or call 1300, 24 hours."),
        ],
      },
    ],
    sources: [
      { label: "UN Women: 1300 hotline (Prachabodi Centre)", url: "https://data.unwomen.org/global-database-on-violence-against-women/country-profile/Thailand/measures/24-Hour%20Hotline%20Service%20at%20the%20Prachabodi%20Centre" },
      { label: "UN Women: Thailand's One Stop Crisis Centres", url: "https://asiapacific.unwomen.org/en/news-and-events/stories/2013/4/thailand-launches-one-stop-crisis-centre" },
      { label: "WHO: HIV post-exposure prophylaxis guidelines (2024)", url: "https://www.who.int/news/item/22-07-2024-who-updates-guidelines-to-enhance-access-to-hiv-post-exposure-prophylaxis" },
    ],
  },
  {
    slug: "sexual-health",
    icon: "🩺",
    title: t("เพศศึกษาและสุขภาพทางเพศ", "Sex education & sexual health"),
    summary: t("ข้อมูลพื้นฐานที่ผู้ใหญ่ทุกคนควรรู้ — การป้องกัน การตรวจ และที่พึ่งในกรุงเทพฯ", "The basics every adult should know — protection, testing and where to get help in Bangkok."),
    sections: [
      {
        heading: t("การป้องกัน", "Protection"),
        blocks: [
          list(
            ["ถุงยางอนามัยช่วยป้องกันทั้งการตั้งครรภ์และโรคติดต่อทางเพศสัมพันธ์ส่วนใหญ่ ใช้ทุกครั้งตั้งแต่เริ่ม", "Condoms help prevent both pregnancy and most sexually transmitted infections (STIs). Use one every time, from the start."],
            ["มีวิธีคุมกำเนิดหลายแบบ (ยาเม็ด ยาฉีด ยาฝัง ห่วงอนามัย) ปรึกษาแพทย์หรือเภสัชกรเพื่อเลือกวิธีที่เหมาะกับคุณ", "There are many kinds of contraception (pill, injection, implant, IUD). Ask a doctor or pharmacist which suits you."],
            ["ยาคุมฉุกเฉินซื้อได้ที่ร้านขายยา ยิ่งกินเร็วยิ่งได้ผล และไม่เกิน 72 ชั่วโมงหลังมีเพศสัมพันธ์ที่ไม่ได้ป้องกัน ไม่ควรใช้เป็นวิธีคุมกำเนิดประจำ และไม่ป้องกันโรคติดต่อทางเพศสัมพันธ์", "Emergency contraception is sold at pharmacies. The sooner the better — no later than 72 hours after unprotected sex. It isn't for regular use and doesn't protect against STIs."],
          ),
        ],
      },
      {
        heading: t("ป้องกันเอชไอวี: PrEP และ PEP", "HIV prevention: PrEP and PEP"),
        blocks: [
          list(
            ["PrEP คือยาที่กินก่อนมีความเสี่ยง ช่วยป้องกันเอชไอวีได้สูงมากเมื่อกินสม่ำเสมอ", "PrEP is medicine taken before possible exposure; it's highly effective against HIV when taken consistently."],
            ["PEP คือยาฉุกเฉินหลังมีความเสี่ยง กินต่อเนื่อง 28 วัน ต้องเริ่มให้เร็วที่สุด ดีที่สุดภายใน 24 ชั่วโมง และไม่เกิน 72 ชั่วโมง", "PEP is a 28-day emergency course after a possible exposure — start as soon as possible, ideally within 24 hours and no later than 72."],
            ["PrEP ฟรีสำหรับคนไทยที่มีสิทธิหลักประกันสุขภาพถ้วนหน้า (บัตรทอง) ทั้งสองอย่างรับได้ที่โรงพยาบาลรัฐ คลินิกนิรนามสภากาชาดไทย และคลินิกชุมชน ผู้ที่ไม่มีสิทธิ รวมถึงชาวต่างชาติ สอบถามค่าใช้จ่ายได้ที่ 1663", "PrEP is free for eligible Thai citizens under Universal Health Coverage. Both are available at public hospitals, the Thai Red Cross Anonymous Clinic and community clinics. If you aren't covered (including foreign residents), ask 1663 about cost."],
            ["PrEP และ PEP ไม่ป้องกันโรคติดต่อทางเพศสัมพันธ์อื่นหรือการตั้งครรภ์ ใช้ร่วมกับถุงยางอนามัย", "PrEP and PEP don't prevent other STIs or pregnancy — use them with condoms."],
          ),
        ],
      },
      {
        heading: t("การตรวจเป็นเรื่องปกติ", "Testing is normal"),
        blocks: [
          p("ผู้ใหญ่ที่มีเพศสัมพันธ์ควรตรวจเอชไอวีและโรคติดต่อทางเพศสัมพันธ์อย่างสม่ำเสมอ หลายโรคไม่มีอาการ การตรวจเป็นความลับ ทำได้ที่โรงพยาบาลรัฐ คลินิกนิรนามสภากาชาดไทย และศูนย์บริการสาธารณสุขของ กทม.", "Sexually active adults should test for HIV and STIs regularly — many infections have no symptoms. Testing is confidential at public hospitals, the Thai Red Cross Anonymous Clinic and BMA public health centres."),
          tip("คุยเรื่องการตรวจกับคู่ของคุณได้อย่างเปิดเผย — เป็นการดูแลกันและกัน", "Talking about testing with a partner is a way of caring for each other."),
        ],
      },
      {
        heading: t("ท้องไม่พร้อม", "Unplanned pregnancy"),
        blocks: [
          p("คุณมีทางเลือกและมีคนพร้อมรับฟังโดยไม่ตัดสิน โทรสายด่วน 1663 (ไม่ต้องบอกชื่อ) เพื่อปรึกษาทางเลือกทั้งหมด", "You have options, and people ready to listen without judgement. Call 1663 (anonymous) to talk them all through."),
          p("ในประเทศไทย การยุติการตั้งครรภ์ทำได้ถูกกฎหมายเมื่ออายุครรภ์ไม่เกิน 12 สัปดาห์ และ 12–20 สัปดาห์หลังรับคำปรึกษาจากแพทย์ (ตามกฎหมายปี 2565) ที่สถานพยาบาลที่ได้รับอนุญาต", "In Thailand, abortion is legal up to 12 weeks, and from 12 to 20 weeks after counselling with a doctor (2022 rules), at licensed health facilities."),
        ],
      },
      {
        heading: t("สำหรับทุกเพศและทุกรสนิยม", "For every gender and orientation"),
        blocks: [
          p("สุขภาพทางเพศเป็นเรื่องของทุกคน — คู่ชายหญิง คู่เพศเดียวกัน คนข้ามเพศ และนอนไบนารี คลินิกในกรุงเทพฯ หลายแห่งให้บริการที่เป็นมิตรกับ LGBTQ+ รวมถึงบริการสำหรับคนข้ามเพศ", "Sexual health is for everyone — straight, gay, lesbian, bi, trans and non-binary people alike. Many Bangkok clinics are LGBTQ+-friendly, including trans-specific services."),
        ],
      },
    ],
    sources: [
      { label: "WHO: HIV post-exposure prophylaxis guidelines (2024)", url: "https://www.who.int/news/item/22-07-2024-who-updates-guidelines-to-enhance-access-to-hiv-post-exposure-prophylaxis" },
      { label: "WHO: Emergency contraception (levonorgestrel) product information", url: "https://extranet.who.int/prequal/sites/default/files/whopar_files/RH069part4v1.pdf" },
      { label: "Thai Red Cross AIDS Research Centre: free PrEP under UHC", url: "https://english.redcross.or.th/news/medical-and-health-care-services/5794/" },
      { label: "Frontiers in Public Health (2022): PrEP in Thailand's UHC", url: "https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2022.1019553/epub" },
      { label: "RSAT: 1663 AIDS & unplanned pregnancy counselling line", url: "https://rsathai.org/en/contents/25730" },
      { label: "Heinrich Böll Stiftung: Abortion in Thailand after the 2022 law", url: "https://th.boell.org/en/2023/02/13/abortions-thailand" },
    ],
  },
  {
    slug: "date-responsibly",
    icon: "🛡️",
    title: t("เดตอย่างปลอดภัยและรับผิดชอบ", "How to date responsibly"),
    summary: t("ดูแลตัวเอง เคารพอีกฝ่าย และรู้ทันมิจฉาชีพ", "Look after yourself, respect the other person, and spot scams."),
    sections: [
      {
        heading: t("ดูแลตัวเอง", "Look after yourself"),
        blocks: [
          list(
            ["นัดเจอที่สาธารณะ โดยเฉพาะครั้งแรก ๆ — กิจกรรม Jurrgun จัดในที่สาธารณะเสมอ", "Meet in public, especially the first few times — Jurrgun events are always in public places."],
            ["ดูแลแก้วเครื่องดื่มของตัวเอง อย่าวางทิ้งไว้ และดื่มแต่พอดี", "Keep your drink with you, never leave it unattended, and drink in moderation."],
            ["เก็บข้อมูลส่วนตัวไว้ก่อน (ที่อยู่ ที่ทำงาน การเงิน) จนกว่าจะไว้ใจกัน", "Keep personal details (address, workplace, finances) to yourself until you trust someone."],
            ["เชื่อสัญชาตญาณ — ถ้ารู้สึกไม่สบายใจ ขอตัวกลับได้เลย ไม่ต้องขอโทษ", "Trust your gut — if something feels off, leave. You don't owe anyone an explanation."],
            ["แชร์ตำแหน่งกับเพื่อนที่ไว้ใจ และนัดเวลาโทรเช็กกัน", "Share your location with a trusted friend and agree a check-in call."],
          ),
        ],
      },
      {
        heading: t("เคารพอีกฝ่าย", "Respect the other person"),
        blocks: [
          list(
            ["ซื่อสัตย์เรื่องสถานะความสัมพันธ์และสิ่งที่คุณมองหา", "Be honest about your relationship status and what you're looking for."],
            ["‘ไม่’ คือ ‘ไม่’ — รับคำปฏิเสธอย่างสุภาพ ไม่ตามตื๊อ", "No means no — accept it gracefully and don't push."],
            ["ห้ามเปิดเผยข้อมูลหรืออัตลักษณ์ทางเพศของผู้อื่นโดยไม่ได้รับอนุญาต", "Never share someone's details or gender identity without their consent."],
            ["ถ้าไม่อยากไปต่อ บอกตรง ๆ อย่างสุภาพ ดีกว่าหายไปเฉย ๆ", "If you're not interested, say so kindly rather than disappearing."],
          ),
        ],
      },
      {
        heading: t("รู้ทันมิจฉาชีพหลอกรัก", "Spot romance scams"),
        blocks: [
          list(
            ["ไม่โอนเงิน ไม่ให้ยืมเงิน ไม่ลงทุนหรือเทรดคริปโตตามคำชวนของคนที่เพิ่งรู้จัก", "Never send or lend money, or invest/trade crypto because someone you just met suggested it."],
            ["ระวังคนที่รีบบอกรัก มีเรื่องฉุกเฉินทางการเงิน หรือไม่ยอมเจอตัวจริง", "Be wary of someone who declares love fast, has money emergencies, or avoids meeting in person."],
            ["ห้ามส่งรหัส OTP หรือข้อมูลบัญชีให้ใคร", "Never share OTP codes or bank details with anyone."],
            ["ถูกหลอกแล้ว โทร 1441 ทันที และกด ‘รายงาน’ ในแอป", "If you've been scammed, call 1441 immediately and report the person in the app."],
          ),
        ],
      },
      {
        heading: t("ดูแลใจตัวเอง", "Look after your mind"),
        blocks: [
          p("การเจอคนใหม่อาจทั้งสนุกและเหนื่อย ถ้าผิดหวังหรือรู้สึกเหงา คุณไม่ได้อยู่คนเดียว พักได้ เริ่มใหม่ได้ และโทรคุยกับสายด่วนสุขภาพจิต 1323 ได้ตลอด 24 ชั่วโมง", "Meeting new people can be fun and tiring. If you feel let down or lonely, you're not alone — take a break, try again, and call the mental health hotline 1323 any time, 24 hours."),
        ],
      },
    ],
    sources: [
      { label: "Bangkok Post: 1441 anti-scam hotline", url: "https://www.bangkokpost.com/thailand/general/2924862/govt-hails-use-of-1441-hotline" },
      { label: "Thai Government: mental health hotline 1323, 24/7", url: "https://thailand.go.th/event-detail/--3---24-" },
      { label: "Royal Thai Police online crime reporting", url: "https://www.thaipoliceonline.go.th" },
    ],
  },
  {
    slug: "making-friends",
    icon: "👋",
    title: t("หาเพื่อนใหม่และแฮงเอาต์เป็นกลุ่ม", "Making friends in Bangkok"),
    summary: t("เริ่มจากกลุ่มเล็ก ไปให้ถึง แล้วนัดกันต่อ มิตรภาพเกิดจากการเจอกันซ้ำ ๆ", "Start small, show up, follow up. Friendship grows from seeing people again."),
    sections: [
      {
        heading: t("เริ่มจากเล็ก ๆ", "Start small"),
        blocks: [
          p("การมีเพื่อนใหม่ตอนเป็นผู้ใหญ่ไม่ใช่เรื่องง่าย และไม่ใช่ความผิดของใคร คนส่วนใหญ่ก็อยากมีเพื่อนเพิ่มเหมือนกัน แค่ไม่รู้จะเริ่มตรงไหน", "Making friends as an adult isn't easy, and it's nobody's fault. Most people would like more friends too; they just don't know where to start."),
          list(
            ["เลือกกิจกรรมที่ชอบอยู่แล้ว เช่น กินข้าว เดินเล่นย่านเก่า บอร์ดเกม วิ่ง หรืออาสาสมัคร", "Pick something you already enjoy: a dinner, an old-town walk, board games, a run, volunteering."],
            ["กลุ่มเล็ก 4 ถึง 6 คนคุยง่ายกว่างานใหญ่ ทุกคนได้พูดและได้ฟัง", "Small groups of 4 to 6 are easier than big parties. Everyone gets to talk and to listen."],
            ["ตั้งเป้าเล็ก ๆ เช่น ไปหนึ่งกิจกรรมต่อสัปดาห์ หรือคุยกับคนใหม่หนึ่งคน", "Set a small goal, like one meetup a week or one new person to talk to."],
            ["ไปกิจกรรมเดิมซ้ำ ๆ หน้าคุ้นเคยจะค่อย ๆ กลายเป็นเพื่อน", "Go back to the same thing more than once. Familiar faces slowly become friends."],
          ),
        ],
      },
      {
        heading: t("ไปให้ถึง", "Show up"),
        blocks: [
          list(
            ["ตื่นเต้นเป็นเรื่องปกติ คนอื่นในโต๊ะก็รู้สึกเหมือนกัน", "Feeling nervous is normal. Others at the table feel it too."],
            ["มาตรงเวลา ทักทาย บอกชื่อ และถามคำถามง่าย ๆ สักข้อ", "Arrive on time, say hello, share your name and ask one easy question."],
            ["ให้โอกาสสองสามครั้ง ครั้งแรกอาจยังไม่คลิก ซึ่งไม่เป็นไร", "Give it a few tries. The first meetup might not click, and that's fine."],
            ["ถ้าไปไม่ได้ ยกเลิกในแอปล่วงหน้าอย่างน้อย 24 ชั่วโมง ที่นั่งจะได้ไปถึงคนอื่น", "If you can't make it, cancel in the app at least 24 hours ahead so someone else can take the seat."],
          ),
        ],
      },
      {
        heading: t("นัดกันต่อ", "Follow up"),
        blocks: [
          p("หลังกิจกรรม คุณมีเวลา 72 ชั่วโมงเลือกคนที่อยากติดต่อต่อแบบเป็นความลับ ถ้าเลือกตรงกันจึงจะเชื่อมต่อกัน", "After a meetup you have 72 hours to privately choose who you'd like to stay in touch with. You connect only if it's mutual."),
          list(
            ["ส่งข้อความสั้น ๆ ภายในวันสองวัน พูดถึงสิ่งที่คุยกัน", "Send a short message within a day or two that mentions something you talked about."],
            ["ชวนแบบเจาะจง เช่น ‘เสาร์นี้ไปตลาดนัดกันไหม’ ง่ายกว่า ‘ว่าง ๆ เจอกันนะ’", "Suggest something specific. “Market on Saturday?” works better than “let's hang out sometime.”"],
            ["ถ้าเขาไม่ตอบหรือยังไม่ว่าง ไม่ต้องคิดมาก ทุกคนมีจังหวะชีวิตของตัวเอง", "If they don't reply or aren't free, don't take it personally. Everyone has their own pace."],
          ),
          tip("องค์การอนามัยโลกแนะนำก้าวเล็ก ๆ เช่น ทักทายเพื่อนบ้าน เข้ากลุ่มในชุมชน หรือเป็นอาสาสมัคร เพื่อสร้างความสัมพันธ์", "WHO suggests small steps like greeting neighbours, joining a local group or volunteering to build connection."),
        ],
      },
    ],
    sources: [
      WHO_SOCIAL,
      WHO_COMMISSION,
      { label: "VisitBangkok (BMA): things to do in Bangkok", url: "https://visit.bangkok.go.th/place" },
      { label: "VisitBangkok (BMA): festival and events calendar", url: "https://visit.bangkok.go.th/festival-calendar" },
    ],
  },
  {
    slug: "meetup-etiquette",
    icon: "🍽️",
    title: t("มารยาทและสิ่งควรทำ ไม่ควรทำในการพบปะ", "Meetup dos and don'ts"),
    summary: t("ตรงเวลา หารค่าอาหาร วางมือถือ เคารพขอบเขต และกลับอย่างสุภาพ", "Be on time, split fairly, put the phone down, respect boundaries and leave politely."),
    sections: [
      {
        heading: t("ก่อนไป", "Before you go"),
        blocks: [
          list(
            ["มาตรงเวลา ถ้าจะสาย ส่งข้อความบอกกลุ่มหรือโฮสต์", "Be on time. If you're running late, message the group or the host."],
            ["เช็กเส้นทางล่วงหน้า กรุงเทพฯ รถติดและฝนตกหนักได้", "Check your route ahead. Bangkok traffic and rain can slow you down."],
            ["แต่งตัวให้เหมาะกับสถานที่ โดยเฉพาะถ้าไปวัดหรือสถานที่สำคัญ", "Dress for the place, especially for temples and landmarks."],
          ),
        ],
      },
      {
        heading: t("ที่โต๊ะ", "At the table"),
        blocks: [
          list(
            ["คุยกันก่อนสั่งว่าจะหารเท่ากันหรือจ่ายตามที่สั่ง จะได้ไม่มีใครอึดอัด", "Agree before ordering whether you'll split evenly or pay for what you ordered, so nobody feels awkward."],
            ["วางมือถือไว้ก่อน ฟังกันเต็มที่ องค์การอนามัยโลกก็แนะนำแบบนี้", "Put your phone away and give people your full attention. WHO suggests this too."],
            ["ดื่มหรือไม่ดื่มก็ได้ ไม่มีใครต้องอธิบาย และไม่คะยั้นคะยอใคร", "Drinking is optional. Nobody needs to explain, and nobody pushes."],
            ["ให้ทุกคนได้พูด ชวนคนที่เงียบเข้ามาคุยอย่างเป็นธรรมชาติ", "Make room for everyone to talk, and gently bring quieter people in."],
          ),
        ],
      },
      {
        heading: t("ความยินยอมและขอบเขต", "Consent and boundaries"),
        blocks: [
          list(
            ["ถามก่อนกอดหรือสัมผัส คนไทยหลายคนไม่ทักทายด้วยการกอดหรือหอมแก้ม", "Ask before a hug or any touch. Many Thais don't greet with hugs or kisses."],
            ["ถามก่อนถ่ายรูป และถามอีกครั้งก่อนโพสต์หรือแท็กใคร", "Ask before taking photos, and ask again before posting or tagging anyone."],
            ["ไม่ถามเรื่องส่วนตัวที่อีกฝ่ายยังไม่อยากเล่า เช่น เงินเดือน สถานะ หรือที่อยู่", "Don't press for personal details someone hasn't offered, like salary, relationship status or address."],
            ["‘ไม่’ หรือ ‘ไม่เป็นไร’ คือคำตอบที่ต้องเคารพ", "A no, or a “no thanks”, is an answer to respect."],
          ),
        ],
      },
      {
        heading: t("ความปลอดภัยในที่สาธารณะ", "Staying safe in public"),
        blocks: [
          list(
            ["กิจกรรม Jurrgun จัดในที่สาธารณะเสมอ เดินทางมาเองและกลับเอง", "Jurrgun meetups are always in public places. Get there and home on your own."],
            ["ดูแลของใช้และแก้วเครื่องดื่มของตัวเอง", "Keep an eye on your belongings and your drink."],
            ["ถ้ารู้สึกไม่สบายใจ บอกโฮสต์ หรือกด ‘รายงาน’ ในแอป ถ้าอยู่ในอันตรายโทร 191 หรือ 1669", "If something feels wrong, tell the host or use Report in the app. If you're in danger, call 191 or 1669."],
          ),
        ],
      },
      {
        heading: t("กลับอย่างสุภาพ", "Leaving politely"),
        blocks: [
          p("คุณกลับได้ทุกเมื่อ ไม่ต้องให้เหตุผลยาว ๆ แค่บอกลากลุ่ม ขอบคุณโฮสต์ และจ่ายส่วนของตัวเองก่อนไป", "You can leave whenever you like without a long reason. Say goodbye to the group, thank the host and settle your share first."),
          tip("ประโยคง่าย ๆ อย่าง ‘วันนี้สนุกมาก ขอตัวก่อนนะ’ ก็เพียงพอ", "Something simple like “This was fun, I'm heading off now” is plenty."),
        ],
      },
    ],
    sources: [GOV_DOS, WHO_SOCIAL],
  },
  {
    slug: "communication",
    icon: "💬",
    title: t("การสื่อสาร: เริ่มคุย ฟัง และทักต่อ", "Communication: talking, listening, texting"),
    summary: t("เปิดบทสนทนา ฟังให้ดี ผ่านช่วงเงียบ คุยข้ามภาษา และทักหลังเจอกัน", "Starting conversations, listening well, awkward pauses, mixing languages and texting after."),
    sections: [
      {
        heading: t("เริ่มบทสนทนา", "Starting a conversation"),
        blocks: [
          p("คำถามปลายเปิดชวนให้เล่าเรื่องได้มากกว่าคำถามที่ตอบแค่ใช่หรือไม่ใช่", "Open questions invite a story, unlike yes or no questions."),
          list(
            ["“ย่านไหนในกรุงเทพฯ ที่ชอบที่สุด?”", "“What's your favourite part of Bangkok?”"],
            ["“ร้านอร่อยใกล้บ้านหรือที่ทำงานมีร้านไหนแนะนำบ้าง?”", "“Any good food spots near where you live or work?”"],
            ["“ช่วงนี้สนใจอะไรอยู่?”", "“What are you into lately?”"],
            ["“ถ้ามีวันว่างหนึ่งวันในกรุงเทพฯ จะทำอะไร?”", "“If you had a free day in Bangkok, what would you do?”"],
          ),
        ],
      },
      {
        heading: t("ฟังให้ดี", "Listening well"),
        blocks: [
          list(
            ["ถามต่อจากสิ่งที่เขาเล่า แสดงว่าคุณฟังอยู่", "Ask a follow-up about what they just said. It shows you're listening."],
            ["ปล่อยให้อีกฝ่ายพูดจบ ไม่ต้องรีบเล่าเรื่องของตัวเองแทรก", "Let people finish before you share your own story."],
            ["วางมือถือ สบตา และพยักหน้า ง่ายแต่ได้ผล", "Phone down, eye contact, a nod. Simple, and it works."],
          ),
        ],
      },
      {
        heading: t("เมื่อเกิดช่วงเงียบหรือเขิน", "When it gets awkward"),
        blocks: [
          list(
            ["ช่วงเงียบสั้น ๆ เป็นเรื่องปกติ ไม่ต้องรีบเติม", "Short silences are normal. You don't have to fill them."],
            ["ใช้สิ่งรอบตัว อาหารบนโต๊ะ ร้าน หรือกิจกรรมที่ทำอยู่ เป็นเรื่องคุย", "Use what's around you: the food, the place, the activity."],
            ["ถ้าหัวข้อไหนทำให้บรรยากาศตึง เปลี่ยนเรื่องได้เลย เช่น ‘มาคุยเรื่องสบาย ๆ กันดีกว่า’", "If a topic gets tense, change it. “Let's keep it light” is fine to say."],
            ["คนไทยหลายคนให้ความสำคัญกับการไม่ทำให้ใครเสียหน้าต่อหน้าคนอื่น ถ้าไม่เห็นด้วย พูดอย่างนุ่มนวลหรือคุยกันเป็นส่วนตัว", "Many Thais value not embarrassing anyone in front of others. If you disagree, say it gently or privately."],
          ),
        ],
      },
      {
        heading: t("คุยข้ามภาษา ไทยและอังกฤษ", "Across languages: Thai and English"),
        blocks: [
          list(
            ["พูดช้าลง ใช้คำง่าย และเลี่ยงคำสแลง", "Speak a little slower, use simple words and skip slang."],
            ["ถ้าโต๊ะมีหลายภาษา ใช้ภาษาที่ทุกคนเข้าใจ และช่วยแปลให้กันสั้น ๆ", "At a mixed table, use the language everyone shares and translate briefly for each other."],
            ["ลองใช้คำไทยง่าย ๆ เช่น ‘ขอบคุณ’ หรือ ‘ขอโทษ’ คนส่วนใหญ่ยินดีที่คุณลอง", "Try a little Thai, like khop khun (thank you) or kho thot (sorry). Most people appreciate the effort."],
            ["ใช้แอปแปลภาษาได้ ไม่ใช่เรื่องน่าอาย", "Translation apps are fine. There's nothing embarrassing about them."],
          ),
        ],
      },
      {
        heading: t("ทักหลังเจอกัน", "Texting after a meetup"),
        blocks: [
          list(
            ["สั้น ๆ และอ้างถึงเรื่องที่คุยกัน เช่น ‘ร้านที่เล่าเมื่อวาน ไปมาแล้ว อร่อยจริง’", "Keep it short and specific: “Tried the place you mentioned, it was great.”"],
            ["ชวนต่อแบบมีวันและที่ชัดเจน แต่ไม่กดดัน", "Suggest a clear day and place, without pressure."],
            ["ถ้าเขาตอบช้าหรือไม่ตอบ ทักอีกครั้งได้หนึ่งครั้ง แล้วปล่อยไป", "If they reply slowly or not at all, one more nudge is fine. Then let it go."],
          ),
          tip("คนที่ทักก่อนไม่ได้ดูเสียฟอร์ม คนส่วนใหญ่ดีใจที่มีคนทักมา", "Being the one who texts first isn't uncool. Most people are glad someone reached out."),
        ],
      },
    ],
    sources: [
      GOV_DOS,
      { label: "Thailand Foundation: Wai, the Thai greeting", url: "https://thailandfoundation.or.th/wai-the-thai-greeting/" },
      WHO_SOCIAL,
    ],
  },
  {
    slug: "loneliness-and-mental-health",
    icon: "🌱",
    title: t("ความเหงาและสุขภาพใจ", "Loneliness and mental health"),
    summary: t("ความเหงาเกิดกับใครก็ได้ ก้าวเล็ก ๆ ช่วยได้ และมีคนพร้อมรับฟังเสมอ", "Loneliness is common, small steps help, and someone is always there to listen."),
    sections: [
      {
        heading: t("ความเหงาเป็นเรื่องที่เกิดกับหลายคน", "Loneliness is common"),
        blocks: [
          p("องค์การอนามัยโลกรายงานในปี 2568 ว่า ประมาณ 1 ใน 6 คนทั่วโลกรู้สึกเหงา ความเหงาไม่ได้แปลว่าคุณมีอะไรผิดปกติ แม้แต่ในเมืองที่มีคนเป็นล้านก็รู้สึกเหงาได้", "In 2025 the World Health Organization reported that about 1 in 6 people worldwide are affected by loneliness. Feeling lonely doesn't mean something is wrong with you, even in a city of millions."),
          p("องค์การอนามัยโลกยังระบุว่า ความสัมพันธ์ที่ดีกับผู้คนส่งผลดีต่อทั้งสุขภาพกายและใจ", "WHO also notes that good social connection is good for both physical and mental health."),
        ],
      },
      {
        heading: t("ก้าวเล็ก ๆ ที่ช่วยได้", "Small steps that help"),
        blocks: [
          list(
            ["ทักใครสักคนที่ไม่ได้คุยนาน หรือถามไถ่คนที่ดูเหนื่อย ๆ", "Message someone you haven't talked to in a while, or check on someone who seems to be struggling."],
            ["วางมือถือเวลาคุยกับคนตรงหน้า", "Put your phone down when you're with people."],
            ["ทักทายเพื่อนบ้าน เข้ากลุ่มในชุมชน หรือเป็นอาสาสมัคร", "Greet a neighbour, join a local group or volunteer."],
            ["ดูแลพื้นฐาน นอนให้พอ กินข้าว ดื่มน้ำ และขยับตัวบ้าง", "Look after the basics: sleep, meals, water and some movement."],
            ["ใจดีกับตัวเอง วันที่ไม่อยากเจอใคร พักก่อนได้", "Be kind to yourself. On days you don't feel like seeing anyone, it's okay to rest."],
          ),
        ],
      },
      {
        heading: t("เมื่อไหร่ควรขอความช่วยเหลือ", "When to reach out for help"),
        blocks: [
          p("ถ้าความรู้สึกเศร้า เครียด หรือเหงา อยู่นานจนกระทบการนอน การกิน การทำงาน หรือความสัมพันธ์ การคุยกับผู้เชี่ยวชาญช่วยได้ ไม่ต้องรอให้หนักก่อน", "If sadness, stress or loneliness hangs around and starts to affect your sleep, eating, work or relationships, talking to a professional can help. You don't have to wait until it's serious."),
          list(
            ["สายด่วนสุขภาพจิต 1323 ของกรมสุขภาพจิต โทรฟรี ตลอด 24 ชั่วโมง", "Department of Mental Health hotline 1323: free, 24 hours."],
            ["สมาริตันส์แห่งประเทศไทย 02-113-6789 คุยได้ทั้งไทยและอังกฤษ ทุกวัน 12.00 ถึง 22.00 น.", "Samaritans of Thailand 02-113-6789, Thai and English, daily 12:00 to 22:00."],
            ["ถ้าคิดทำร้ายตัวเองหรือมีอันตรายตอนนี้ โทร 1669 หรือไปห้องฉุกเฉินที่ใกล้ที่สุด", "If you're thinking about hurting yourself or are in danger now, call 1669 or go to the nearest emergency room."],
          ),
        ],
      },
      {
        heading: t("ถ้าเพื่อนไม่ไหว", "If a friend is struggling"),
        blocks: [
          list(
            ["ฟังโดยไม่ตัดสิน ไม่ต้องมีคำตอบให้ทุกเรื่อง", "Listen without judging. You don't need to have all the answers."],
            ["ถามตรง ๆ ว่าอยากให้ช่วยอะไร", "Ask simply what would help."],
            ["ชวนโทร 1323 ด้วยกัน หรืออยู่เป็นเพื่อนระหว่างหาความช่วยเหลือ", "Offer to call 1323 together, or stay with them while they get help."],
          ),
          tip("ข้อมูลนี้เพื่อการดูแลใจทั่วไป ไม่ใช่คำแนะนำทางการแพทย์", "This is general wellbeing information, not medical advice."),
        ],
      },
    ],
    sources: [
      WHO_SOCIAL,
      WHO_COMMISSION,
      { label: "Thai Government: mental health hotline 1323, free, 24/7", url: "https://thailand.go.th/event-detail/--3---24-" },
      { label: "Befrienders Worldwide: Samaritans of Thailand (Bangkok)", url: "https://befrienders.org/find-support-now/samaritans-of-thailand-bangkok-centre" },
    ],
  },
  {
    slug: "inclusion",
    icon: "🤗",
    title: t("ทุกคนมีที่นั่ง: ความหลากหลายและการเป็นส่วนหนึ่ง", "Inclusion and belonging"),
    summary: t("ทุกเพศ ทุกวัย ทุกพื้นเพ ทุกความสามารถ ทุกศาสนา และทุกภาษา ยินดีต้อนรับ", "Every gender, age, background, ability, faith and language is welcome."),
    sections: [
      {
        heading: t("ทุกคนยินดีต้อนรับ", "Everyone is welcome"),
        blocks: [
          p("Jurrgun เปิดให้ผู้ใหญ่ทุกคนในกรุงเทพฯ ไม่ว่าเพศ อายุ พื้นเพ ความสามารถ ศาสนา รสนิยม หรือภาษา ทุกคนได้รับความเคารพเท่ากัน และไทป์กรุงเทพฯ ไม่เคยใช้คัดใครออก", "Jurrgun is for every adult in Bangkok, whatever your gender, age, background, ability, faith, orientation or language. Everyone gets the same respect, and Bangkok Types are never used to leave anyone out."),
        ],
      },
      {
        heading: t("ทำให้ทุกคนที่โต๊ะรู้สึกเป็นส่วนหนึ่ง", "Making everyone at the table feel included"),
        blocks: [
          list(
            ["แนะนำคนที่มาใหม่ และเรียกชื่อกัน", "Introduce newcomers and use people's names."],
            ["ถ้าไม่แน่ใจว่าจะเรียกใครอย่างไร ถามอย่างสุภาพ แล้วใช้ตามนั้น", "If you're not sure how someone likes to be addressed, ask kindly and go with it."],
            ["ใช้ภาษาที่ทุกคนในโต๊ะเข้าใจ", "Use a language everyone at the table understands."],
            ["เคารพเรื่องอาหาร เช่น ฮาลาล มังสวิรัติ หรือแพ้อาหาร และไม่ต้องให้ใครอธิบายเหตุผล", "Respect food needs like halal, vegetarian or allergies, without asking anyone to justify them."],
            ["ไม่เดาเรื่องศาสนา เพศ หรือที่มาของใครจากหน้าตาหรือสำเนียง", "Don't guess someone's faith, gender or origin from how they look or sound."],
          ),
        ],
      },
      {
        heading: t("การเข้าถึง", "Accessibility"),
        blocks: [
          p("องค์การอนามัยโลกประมาณว่า ผู้คนราว 1.3 พันล้านคน หรือประมาณ 1 ใน 6 คนทั่วโลก มีภาวะพิการที่สำคัญ การออกแบบกิจกรรมให้เข้าถึงได้จึงเป็นเรื่องของทุกคน", "WHO estimates that about 1.3 billion people, roughly 1 in 6 worldwide, live with significant disability. Accessible meetups matter to everyone."),
          list(
            ["บอกโฮสต์เป็นการส่วนตัวได้ ถ้าต้องการทางลาด ที่นั่งใกล้ทางออก ที่เงียบ หรืออื่น ๆ", "Tell your host privately if you need step-free access, a seat near the exit, a quieter spot or anything else."],
            ["โฮสต์ควรเลือกที่ที่เข้าถึงง่าย ใกล้ระบบขนส่ง และบอกรายละเอียดสถานที่ไว้ล่วงหน้า", "Hosts: choose places that are easy to reach near transit, and describe the venue in advance."],
            ["ความพิการบางอย่างมองไม่เห็น ไม่ต้องถามเหตุผล แค่ช่วยตามที่ขอ", "Some disabilities aren't visible. No need to ask why; just help as asked."],
          ),
          tip("ถ้าเห็นใครถูกกันออกหรือถูกล้อเลียน บอกโฮสต์หรือกด ‘รายงาน’", "If you see someone being left out or mocked, tell the host or use Report."),
        ],
      },
    ],
    sources: [
      { label: "WHO: Disability fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/disability-and-health" },
      { label: "Thailand PRD: Equal marriage law takes effect 23 January 2025", url: "https://thailand.prd.go.th/en/content/category/detail/id/48/iid/356609" },
      WHO_SOCIAL,
    ],
  },
  {
    slug: "new-to-bangkok",
    icon: "🙏",
    title: t("มาใหม่ในกรุงเทพฯ: วัฒนธรรมและภาษาไทย", "New to Bangkok: Thai culture basics"),
    summary: t("การไหว้ การให้เกียรติ วัด คำไทยที่ใช้บ่อย และเคล็ดลับหาเพื่อนสำหรับชาวต่างชาติ", "The wai, showing respect, temples, handy Thai phrases and tips for building your circle."),
    sections: [
      {
        heading: t("ทักทายและการไหว้", "Greetings and the wai"),
        blocks: [
          p("คนไทยทักทายด้วยคำว่า ‘สวัสดี’ และมักยกมือไหว้ คือพนมมือไว้ระดับอกแล้วก้มศีรษะเล็กน้อย การไหว้ใช้ทั้งทักทาย ขอบคุณ และขอโทษ ปัจจุบันเพื่อนกันหลายคนก็โบกมือทักทายแทน", "People in Thailand greet each other with “sawasdee”, often with a wai: palms pressed together at the chest and a slight bow of the head. The wai is used to greet, thank and apologise. Today many friends simply wave."),
          tip("ถ้ามีคนไหว้คุณ ไหว้ตอบ หรือยิ้มและพยักหน้าก็สุภาพแล้ว", "If someone gives you a wai, a wai back, or a smile and a nod, is a kind reply."),
        ],
      },
      {
        heading: t("การให้เกียรติในชีวิตประจำวัน", "Everyday respect"),
        blocks: [
          list(
            ["ศีรษะถือเป็นส่วนสูงสุดของร่างกาย ไม่ควรจับหัวผู้อื่นหรือยื่นของข้ามศีรษะ", "The head is seen as the highest part of the body. Don't touch people's heads or pass things over them."],
            ["เท้าถือเป็นส่วนต่ำ ไม่ใช้เท้าชี้สิ่งของ และไม่ก้าวข้ามคน อาหาร หรือหนังสือ", "Feet are seen as low. Don't point with your feet or step over people, food or books."],
            ["ถอดรองเท้าก่อนเข้าบ้านคนและศาสนสถาน", "Take your shoes off before entering homes and places of worship."],
            ["ให้เกียรติผู้สูงอายุ และไม่ทำให้ใครเสียหน้าต่อหน้าคนอื่น", "Show respect to elders, and avoid embarrassing anyone in front of others."],
          ),
        ],
      },
      {
        heading: t("วัด พระพุทธรูป และสถาบัน", "Temples, Buddha images and national institutions"),
        blocks: [
          list(
            ["แต่งกายสุภาพเมื่อเข้าวัดหรือสถานที่สำคัญ ไม่ใส่กระโปรงสั้นหรือเสื้อเปิดไหล่", "Dress modestly at temples and landmarks: no short skirts or bare shoulders."],
            ["เคารพพระพุทธรูป ไม่ปีนป่ายหรือวางไว้ในที่ต่ำ", "Respect Buddha images: don't climb on them or place them somewhere low."],
            ["เมื่อได้ยินเพลงชาติ ยืนตรงเพื่อแสดงความเคารพ และในโรงภาพยนตร์จะยืนขึ้นเมื่อเปิดเพลงสรรเสริญพระบารมี", "When the national anthem plays, people stand still out of respect. In cinemas, people stand for the royal anthem."],
            ["คนไทยให้ความเคารพชาติ ศาสนา และพระมหากษัตริย์อย่างสูง และกฎหมายไทยคุ้มครองสถาบันเหล่านี้ พูดถึงด้วยความเคารพ", "Thailand holds the nation, religion and the monarchy in high respect, and Thai law protects these institutions. Speak about them respectfully."],
          ),
        ],
      },
      {
        heading: t("คำไทยที่ใช้บ่อย", "Handy Thai phrases"),
        blocks: [
          list(
            ["สวัสดี (sawasdee): สวัสดี ทักทายและลา", "Sawasdee: hello, and also goodbye."],
            ["ขอบคุณ (khop khun): ขอบคุณ", "Khop khun: thank you."],
            ["ขอโทษ (kho thot): ขอโทษ หรือขอทางหน่อย", "Kho thot: sorry, or excuse me."],
            ["ไม่เป็นไร (mai pen rai): ไม่เป็นไร ไม่ต้องห่วง", "Mai pen rai: no worries, never mind."],
            ["อร่อย (aroi): อร่อย", "Aroi: delicious."],
            ["เท่าไหร่ (tao rai): ราคาเท่าไหร่", "Tao rai: how much?"],
          ),
          p("ลงท้ายด้วย ‘ครับ’ หรือ ‘ค่ะ’ เพื่อความสุภาพ เลือกคำที่ตรงกับตัวคุณ", "Add khrap or kha at the end to sound polite. Use whichever fits you."),
        ],
      },
      {
        heading: t("สร้างวงเพื่อนในเมืองใหม่", "Building your circle"),
        blocks: [
          list(
            ["มีทั้งเพื่อนไทยและเพื่อนต่างชาติ จะได้รู้จักเมืองจากหลายมุม", "Mix Thai and international friends to see the city from more than one angle."],
            ["มองหาป้าย ‘ใช้ภาษาอังกฤษได้’ และกิจกรรมแลกเปลี่ยนภาษา", "Look for the English-friendly tag and language exchange meetups."],
            ["ดูปฏิทินเทศกาลของเมืองใน VisitBangkok เป็นไอเดียชวนเพื่อนไปเที่ยว", "Browse VisitBangkok's festival calendar for plans to invite people to."],
            ["ตำรวจท่องเที่ยว 1155 ช่วยเหลือชาวต่างชาติได้หลายภาษา ตลอด 24 ชั่วโมง", "The Tourist Police on 1155 help foreign residents and visitors in several languages, 24 hours."],
          ),
        ],
      },
    ],
    sources: [
      GOV_DOS,
      { label: "Thailand Foundation: Wai, the Thai greeting", url: "https://thailandfoundation.or.th/wai-the-thai-greeting/" },
      { label: "Thailand Foundation: Feet low, head high, a guide to Thai etiquette", url: "https://thailandfoundation.or.th/feet-low-head-high-a-guide-to-thai-etiquettes/" },
      { label: "VisitBangkok (BMA): festival and events calendar", url: "https://visit.bangkok.go.th/festival-calendar" },
      { label: "Tourist Police 1155", url: "https://www.touristpolice.go.th/post/tpbnews2025110903" },
    ],
  },
  {
    slug: "getting-around",
    icon: "🚆",
    title: t("เดินทางในกรุงเทพฯ", "Getting around Bangkok"),
    summary: t("รถไฟฟ้า เรือ รถเมล์ แท็กซี่ การจ่ายเงิน รับมือแดดและฝน และเดินกลับตอนกลางคืน", "Trains, boats, buses, taxis, paying, heat and rain, and getting home at night."),
    sections: [
      {
        heading: t("รถไฟฟ้า", "Trains"),
        blocks: [
          list(
            ["BTS (สายสุขุมวิท สายสีลม และสายสีทอง): ซื้อบัตรโดยสารเที่ยวเดียวที่ตู้หรือห้องจำหน่ายตั๋ว จ่ายด้วยเหรียญหรือสแกน QR หรือใช้บัตรแรบบิทแบบเติมเงิน", "BTS (Sukhumvit, Silom and Gold lines): buy a single journey ticket at a machine or ticket office, paying with coins or a QR code, or use a reloadable Rabbit card."],
            ["MRT สายสีน้ำเงินและสายสีม่วง: แตะบัตรเครดิตแบบ EMV Contactless (Visa, Mastercard, UnionPay) หรือบัตรเดบิตของบางธนาคารที่ประตูได้เลย ใช้บัตรเดียวต่อหนึ่งคน และแตะเข้าออกด้วยบัตรใบเดิม", "MRT Blue and Purple lines: tap a contactless (EMV) Visa, Mastercard or UnionPay credit card, or a debit card from some Thai banks, at the gate. One card per person, and tap in and out with the same card."],
            ["ตั้งแต่ 1 มิถุนายน 2569 บัตร MRT และ MRT Plus แบบเติมเงินแบบเดิม ใช้เข้าระบบสายสีน้ำเงินและสายสีม่วงไม่ได้แล้ว", "Since 1 June 2026, the old MRT and MRT Plus stored value cards no longer work on the Blue and Purple lines."],
            ["สายสีเหลืองและสายสีชมพูเป็นโมโนเรลที่มีผู้ให้บริการของตัวเอง เช็กวิธีชำระเงินในเว็บไซต์ของแต่ละสาย", "The Yellow and Pink monorail lines have their own operators. Check each line's site for how to pay."],
            ["แอร์พอร์ต เรล ลิงก์ เชื่อมสนามบินสุวรรณภูมิกับเมือง 8 สถานี เปลี่ยนเป็น MRT ได้ที่มักกะสัน (เพชรบุรี) และเป็น BTS ได้ที่พญาไท", "The Airport Rail Link runs 8 stations from Suvarnabhumi Airport into the city. Change to the MRT at Makkasan (Phetchaburi) and to the BTS at Phaya Thai."],
          ),
          tip("ระบบการจ่ายเงินกำลังเปลี่ยนอยู่ เช็กประกาศล่าสุดของแต่ละสายก่อนเดินทาง", "Ticketing is changing. Check each operator's latest notices before you travel."),
        ],
      },
      {
        heading: t("เรือ", "Boats"),
        blocks: [
          list(
            ["เรือด่วนเจ้าพระยาแบ่งสายด้วยสีธง เรือธงส้มวิ่งทุกวันและจอดเกือบทุกท่า ธงอื่นส่วนใหญ่วิ่งช่วงเวลาเดินทางของวันธรรมดา ดูสีธงก่อนขึ้นเรือ", "Chao Phraya Express boats are coded by flag colour. The orange flag runs every day and stops at most piers; other flags mostly run at weekday commuting times. Check the flag before you board."],
            ["เรือคลองแสนแสบ วิ่งตามแนวถนนเพชรบุรี จากท่าผ่านฟ้าลีลาศใกล้ภูเขาทองไปท่าประตูน้ำ แล้วเปลี่ยนลำต่อไปฝั่งตะวันออก หลบรถติดได้ดี", "The Khlong Saen Saep canal boat runs alongside Phetchaburi Road, from Panfa Leelard pier near the Golden Mount to Pratunam, where you change boats to continue east. A good way to skip traffic."],
            ["ขึ้นลงเรือช้า ๆ จับราวไว้ และเก็บโทรศัพท์ให้ดี", "Step on and off slowly, hold the rail and keep your phone secure."],
          ),
        ],
      },
      {
        heading: t("รถเมล์ แท็กซี่ และแอปเรียกรถ", "Buses, taxis and ride apps"),
        blocks: [
          list(
            ["รถเมล์ ขสมก. วิ่งหลายเส้นทางทั่วกรุงเทพฯ ราคาประหยัด", "BMTA buses cover most of Bangkok at low fares."],
            ["แท็กซี่ ขอให้กดมิเตอร์ก่อนออกรถ ถ้ามีปัญหา จดทะเบียนรถและเวลา แล้วแจ้งสายด่วนกรมการขนส่งทางบก 1584", "Taxis: ask for the meter before you set off. If there's a problem, note the plate number and time and call the Department of Land Transport on 1584."],
            ["แอปเรียกรถส่วนใหญ่แสดงราคาก่อนเดินทาง และแชร์เส้นทางให้เพื่อนดูได้", "Most ride hailing apps show the fare before you ride and let you share your trip with a friend."],
          ),
        ],
      },
      {
        heading: t("แดด ฝน และอากาศ", "Heat, rain and air"),
        blocks: [
          list(
            ["หน้าร้อนช่วงกลางกุมภาพันธ์ถึงกลางพฤษภาคม ร้อนที่สุดราวกลางเมษายน พกน้ำ หาที่ร่ม และเลี่ยงเดินกลางแดดจัด", "The hot season runs from mid-February to mid-May, peaking around mid-April. Carry water, find shade and avoid long walks in the midday sun."],
            ["หน้าฝนช่วงกลางพฤษภาคมถึงกลางตุลาคม พกร่ม เผื่อเวลาเดินทาง เพราะฝนหนักทำให้รถติดและน้ำท่วมขังได้", "The rainy season runs from mid-May to mid-October. Carry an umbrella and allow extra time; heavy rain means traffic and flooded streets."],
            ["เช็กค่าฝุ่น PM2.5 ได้ที่ Air4Thai ของกรมควบคุมมลพิษ และเช็กพยากรณ์อากาศจากกรมอุตุนิยมวิทยา", "Check PM2.5 air quality on Air4Thai from the Pollution Control Department, and the forecast from the Thai Meteorological Department."],
          ),
        ],
      },
      {
        heading: t("เดินกลับตอนกลางคืน", "Walking at night"),
        blocks: [
          list(
            ["เดินถนนใหญ่ที่มีไฟสว่างและมีคน", "Stick to main roads that are lit and busy."],
            ["ข้ามถนนที่ทางม้าลายหรือสะพานลอย และระวังมอเตอร์ไซค์บนทางเท้า", "Cross at crossings or footbridges, and watch for motorbikes on the pavement."],
            ["ทางเท้าบางช่วงไม่เรียบ ดูทางให้ดี", "Some pavements are uneven, so watch your step."],
            ["ชาร์จโทรศัพท์ให้พอ แชร์ตำแหน่งกับเพื่อน และเช็กเวลารถไฟฟ้าเที่ยวสุดท้าย", "Keep your phone charged, share your location with a friend and check the last train time."],
          ),
        ],
      },
      {
        heading: t("แผนที่สำหรับสำรวจเมือง", "Maps for exploring"),
        blocks: [
          link("แสนรู้ (Sanroo): อีกหนึ่งแผนที่ของสถานที่ในกรุงเทพฯ แผนที่สดสำหรับการเดินทางทุกวัน ใช้ฟรี มีภาษาไทยและอังกฤษ", "Sanroo (แสนรู้): another map of Bangkok places, a free live map for everyday travel in Thai and English.", SANROO),
          link("VisitBangkok: เว็บท่องเที่ยวทางการของ กทม. รวมสถานที่น่าไปในกรุงเทพฯ", "VisitBangkok: the BMA's official city guide to places in Bangkok.", "https://visit.bangkok.go.th/place"),
        ],
      },
    ],
    sources: [
      { label: "BTS Skytrain: how to buy a single journey ticket", url: "https://www.bts.co.th/eng/tickets/ticket-machine.html" },
      { label: "BTS Skytrain: how to get a Rabbit card", url: "https://www.bts.co.th/eng/tickets/ticket-rabbit-issuing.html" },
      { label: "BTS Skytrain: route map", url: "https://www.bts.co.th/eng/routemap.html" },
      { label: "MRT (BEM): EMV contactless payment", url: "https://metro.bemplc.co.th/EMV-Contactless" },
      { label: "MRT (BEM): end of MRT and MRT Plus stored value cards", url: "https://metro.bemplc.co.th/Legacy-Transition" },
      { label: "MRT Yellow Line (EBM): route map", url: "https://ebm.co.th/en/routemap/" },
      { label: "MRT Pink Line (NBM): route map", url: "https://nbm.co.th/en/routemap/" },
      { label: "Wikipedia: Airport Rail Link (Bangkok)", url: "https://en.wikipedia.org/wiki/Airport_Rail_Link_(Bangkok)" },
      { label: "Chao Phraya Express Boat", url: "https://www.chaophrayaexpressboat.com/en/home/" },
      { label: "Thailand.go.th: Where can the Chao Phraya Express Boat take me?", url: "https://thailand.go.th/guide-book-detail/001_01_105" },
      { label: "Wikipedia: Khlong Saen Saep boat service", url: "https://en.wikipedia.org/wiki/Khlong_Saen_Saep_boat_service" },
      { label: "BMTA (Bangkok Mass Transit Authority) buses", url: "https://www.bmta.co.th/" },
      { label: "Nation Thailand: taxi complaints to the DLT 1584 hotline", url: "https://www.nationthailand.com/thailand/general/40036664" },
      { label: "Thailand.go.th: The seasons of Thailand", url: "https://thailand.go.th/issue-focus-detail/009_142" },
      { label: "Air4Thai, Pollution Control Department", url: "https://air4thai.pcd.go.th/webV3/" },
      { label: "Thai Meteorological Department", url: "https://www.tmd.go.th/en/" },
      { label: "Sanroo (แสนรู้): another map of Bangkok places", url: SANROO },
    ],
  },
];

/** The Learn page groups its cards into these sections (Bangkok Types included by slug). */
export const LEARN_GROUPS: { key: string; title: Text; slugs: string[] }[] = [
  { key: "meeting-people", title: t("เจอผู้คน", "Meeting people"), slugs: ["making-friends", "meetup-etiquette", "communication", "dating-in-bangkok", "consent", "date-responsibly"] },
  { key: "wellbeing", title: t("ดูแลกายและใจ", "Wellbeing"), slugs: ["loneliness-and-mental-health", "inclusion", "sexual-health"] },
  { key: "bangkok", title: t("กรุงเทพฯ", "Bangkok"), slugs: ["new-to-bangkok", "getting-around", "bangkok-types"] },
];

export const FAQ: { q: Text; a: Text }[] = [
  {
    q: t("Jurrgun คืออะไร?", "What is Jurrgun?"),
    a: ABOUT,
  },
  {
    q: t("นี่คือแอปหาคู่หรือเปล่า?", "Is this a dating app?"),
    a: t("ไม่ใช่ เราเน้นเพื่อนใหม่เป็นหลัก โหมด ‘เปิดใจมากกว่าเพื่อน’ เป็นทางเลือกสำหรับคนโสดเท่านั้น และจะเชื่อมต่อก็ต่อเมื่อทั้งสองฝ่ายเลือกตรงกัน", "No — it's friends first. 'Open to something more' is optional, only for people who are single, and only connects you when both people choose it."),
  },
  {
    q: t("ใครใช้ได้บ้าง?", "Who can join?"),
    a: t("ผู้ที่อายุ 18 ปีขึ้นไปและอาศัยอยู่ในกรุงเทพฯ ทุกสัญชาติ ทุกเพศ ทุกความหลากหลาย ไม่จำเป็นต้องมีทะเบียนบ้านในกรุงเทพฯ", "Adults 18+ who live in Bangkok — any nationality, gender or orientation. Your household registration can be anywhere."),
  },
  {
    q: t("ต้องเสียเงินไหม?", "Does it cost anything?"),
    a: t("ใช้แอปฟรี กิจกรรมส่วนใหญ่ฟรี ถ้ามีค่าใช้จ่ายจะแจ้งไว้ชัดเจน และชำระที่หน้างาน", "The app is free and most events are free. Any cost is shown upfront and paid at the venue."),
  },
  {
    q: t("ไม่พูดภาษาไทย ใช้ได้ไหม?", "I don't speak Thai — can I join?"),
    a: t("ได้ เปลี่ยนเป็นภาษาอังกฤษได้ที่มุมขวาบน มองหาป้าย ‘ใช้ภาษาอังกฤษได้’ และเราจะจัดโต๊ะให้มีคนที่พูดภาษาเดียวกับคุณเสมอ", "Yes. Switch to English (top right), look for the 'English-friendly' tag, and we always seat you with someone who shares a language."),
  },
  {
    q: t("หลังกิจกรรมเกิดอะไรขึ้น?", "What happens after an event?"),
    a: t("ภายใน 72 ชั่วโมง คุณเลือกได้ว่าอยากเป็นเพื่อนกับใครในกลุ่ม ถ้าเลือกตรงกันจะเชื่อมต่อกันและแลกช่องทางติดต่อได้ ถ้าไม่ตรงกัน จะไม่มีใครรู้", "For 72 hours you can privately choose who in your group you'd like to stay in touch with. If it's mutual you connect and can swap contacts. If not, nobody ever knows."),
  },
  {
    q: t("มีแฟนหรือแต่งงานแล้ว ใช้ได้ไหม?", "I'm in a relationship — can I still join?"),
    a: t("ได้แน่นอน คุณใช้โหมดเพื่อนและเพื่อนทำกิจกรรมได้เต็มที่ สถานะความสัมพันธ์เป็นความลับเสมอ", "Of course. Friends and activity-buddy modes are fully open to you. Your relationship status is always private."),
  },
  {
    q: t("พาเพื่อนไปด้วยได้ไหม?", "Can I bring a friend?"),
    a: t("กิจกรรมที่ติดป้าย +1 ชวนเพื่อนได้ 1 คน เพื่อนต้องสมัครและ RSVP เอง แล้วเราจะจัดให้นั่งด้วยกัน", "Events marked +1 let you bring one friend. They sign up and RSVP too, and we'll seat you together."),
  },
  {
    q: t("ถ้าไปไม่ได้ต้องทำอย่างไร?", "What if I can't make it?"),
    a: t("ยกเลิกในแอปก่อนเริ่มกิจกรรม 24 ชั่วโมงได้ฟรี ถ้ายกเลิกช้าหรือไม่มาโดยไม่แจ้ง จะได้ 1 strike ซึ่งหมดอายุใน 90 วัน", "Cancel in the app at least 24 hours before — free. Late cancellations or no-shows get a strike that expires after 90 days."),
  },
  {
    q: t("กทม. เห็นข้อมูลอะไรของฉันบ้าง?", "What does BMA see about me?"),
    a: t("เจ้าหน้าที่ไม่เห็นสถานะความสัมพันธ์ อัตลักษณ์ทางเพศ หรือการเลือกของคุณ ข้อมูลวิจัยเมืองแสดงเป็นภาพรวมจากอย่างน้อย 10 คนเท่านั้น และคุณดาวน์โหลดหรือลบข้อมูลได้เอง", "Staff never see your relationship status, gender identity or choices. City research is only shown as totals of 10+ people, and you can download or delete your data yourself."),
  },
  {
    q: t("ถ้ารู้สึกไม่ปลอดภัยทำอย่างไร?", "What if I feel unsafe?"),
    a: t("แจ้งโฮสต์ทันที กด ‘รายงาน’ หรือ ‘บล็อก’ ในแอป หากอยู่ในอันตรายโทร 191 (ตำรวจ) หรือ 1669 (เจ็บป่วยฉุกเฉิน)", "Tell your host straight away and use Report or Block in the app. If you're in danger, call 191 (police) or 1669 (medical emergency)."),
  },
];

/** The Bangkok Types topic is generated from the archetypes, so it only needs a card. */
export const TYPES_CARD = {
  slug: "bangkok-types",
  icon: "🧩",
  title: t("ไทป์กรุงเทพฯ 16 แบบ", "The 16 Bangkok Types"),
  summary: t("ตัวละคร 16 แบบจากไลฟ์สไตล์ พร้อมคำอธิบายสัญลักษณ์", "16 lifestyle characters, with a legend for every letter and icon"),
};

export type LearnCard = { slug: string; icon: string; title: Text; summary: Text };

const ALL_CARDS: LearnCard[] = [...TOPICS.map((x) => ({ slug: x.slug, icon: x.icon, title: x.title, summary: x.summary })), TYPES_CARD];

/** The cards in one Learn group, in the group's order. */
export const groupCards = (slugs: string[]): LearnCard[] => slugs.map((s) => ALL_CARDS.find((c) => c.slug === s)).filter((c): c is LearnCard => !!c);

/** Every Learn card, in group order (Meeting people, Wellbeing, Bangkok), plus any topic not yet grouped. */
export const LEARN_CARDS: LearnCard[] = (() => {
  const grouped = groupCards(LEARN_GROUPS.flatMap((g) => g.slugs));
  return [...grouped, ...ALL_CARDS.filter((c) => !grouped.includes(c))];
})();
