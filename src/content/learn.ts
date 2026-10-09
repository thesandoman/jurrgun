/**
 * FAQ and the Learn section (dating in Bangkok, consent, sex education,
 * dating responsibly). Bilingual, public, non-explicit and inclusive.
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
];

export type Block =
  | { kind: "p"; text: Text }
  | { kind: "list"; items: Text[] }
  | { kind: "tip"; text: Text };

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
export const LAST_CHECKED = "2026-10-09";

const p = (th: string, en: string): Block => ({ kind: "p", text: t(th, en) });
const list = (...items: [string, string][]): Block => ({ kind: "list", items: items.map(([th, en]) => t(th, en)) });
const tip = (th: string, en: string): Block => ({ kind: "tip", text: t(th, en) });

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
          p("กรุงเทพฯ มีผู้คนจากทุกภาค ทุกประเทศ ทุกเพศและทุกรสนิยม ตั้งแต่ 23 มกราคม 2568 ประเทศไทยรับรองการสมรสเท่าเทียม คู่รักทุกเพศอายุ 18 ปีขึ้นไปจดทะเบียนสมรสได้ที่สำนักงานเขต ใน BKK Social ทุกคนได้รับการเคารพเท่ากัน", "Bangkok is home to people from every region, country, gender and orientation. Since 23 January 2025 Thailand recognises marriage equality — couples of any gender aged 18+ can register at any district office. On BKK Social everyone gets the same respect."),
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
        heading: t("ความยินยอมใน BKK Social", "Consent on BKK Social"),
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
            ["นัดเจอที่สาธารณะ โดยเฉพาะครั้งแรก ๆ — กิจกรรม BKK Social จัดในที่สาธารณะเสมอ", "Meet in public, especially the first few times — BKK Social events are always in public places."],
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
];

export const FAQ: { q: Text; a: Text }[] = [
  {
    q: t("BKK Social คืออะไร?", "What is BKK Social?"),
    a: t("แพลตฟอร์มของกรุงเทพมหานครที่ช่วยให้คนในเมืองได้รู้จักเพื่อนใหม่ผ่านกิจกรรมจริงในกลุ่มเล็ก 4–6 คน เช่น เดินสำรวจย่านเก่า บอร์ดเกม หรือแลกเปลี่ยนภาษา", "A Bangkok Metropolitan Administration platform that helps people meet through real activities in small groups of 4–6 — old-town walks, board games, language exchanges and more."),
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
