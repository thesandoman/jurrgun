/**
 * The written promises, Thai first, in plain words:
 *
 *   GET /privacy      the privacy notice (PDPA)
 *   GET /terms        the Terms of service
 *   GET /safety/how   How we keep you safe
 *
 * Every period, cookie, provider and consent comes from src/content/privacy.ts
 * or from the constant the code enforces, so the words can't drift from the
 * code; test/privacy-promises.test.ts checks both.
 */
import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { L } from "../lib/i18n";
import { page, view } from "../ui/kit";
import { FLAG_SUSPEND_DAYS, FLAG_WINDOW_DAYS, FLAGS_TO_REMOVE, LATE_CANCEL_HOURS, MIN_AGE } from "../domain/rules";
import { DEACTIVATED_RETENTION_DAYS } from "../services/retention";
import {
  CONTACT_ADDRESS,
  COOKIES,
  DEVICE_STORAGE,
  NOTICE_DATE,
  PRIVACY_CONTACT,
  PROCESSORS,
  REPORT_LINE,
  RETENTION,
  RETENTION_NOTES,
  TRANSFERS,
  periodText,
  type Text,
} from "../content/privacy";

export const policyRoutes = new Hono<AppEnv>();

type Pair = [string, string];

policyRoutes.get("/privacy", (c) => {
  const { t, lang } = view(c);
  const T = (x: Text) => L(lang, x);
  const items = (rows: Pair[]) => (
    <ul>
      {rows.map(([th, en]) => (
        <li>{t(th, en)}</li>
      ))}
    </ul>
  );
  return page(
    c,
    { title: t("ความเป็นส่วนตัว", "Privacy") },
    <article class="policy">
      <h1>{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</h1>
      <p class="muted">
        {t("ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) · ฉบับวันที่", "Under Thailand's Personal Data Protection Act 2019 (PDPA) · Version of")} {T(NOTICE_DATE)}
      </p>
      <nav class="policy-links" aria-label={t("ไปที่", "Go to")}>
        <a href="/settings/consents">{t("ความยินยอมของฉัน", "My consents")}</a>
        <a href="/settings/privacy/export">{t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}</a>
        <a href="/safety/how">{t("เราดูแลความปลอดภัยยังไง", "How we keep you safe")}</a>
      </nav>

      <h2>{t("ใครดูแลข้อมูลของคุณ", "Who looks after your data")}</h2>
      <p>
        {t(
          "Jurrgun เป็นแอปอิสระ ทีม Jurrgun เป็นผู้ควบคุมข้อมูลส่วนบุคคล กรุงเทพมหานคร (กทม.) เป็นเจ้าภาพหลัก ช่วยดูแลชุมชน และกำกับดูแล แต่ไม่ได้เป็นผู้สร้างแอป",
          "Jurrgun is an independent app. The Jurrgun team is the data controller. The Bangkok Metropolitan Administration (BMA) is its main host, helps moderate and oversees it, but didn't make the app.",
        )}
      </p>

      <h2>{t("เราเก็บอะไร", "What we collect")}</h2>
      {items([
        ["บัญชี: ชื่อผู้ใช้และรหัสผ่านแบบแฮช หรือรหัสบัญชี Google หรือ LINE ถ้าคุณใช้เข้าสู่ระบบ", "Account: username and a hashed password, or a Google or LINE account ID if you sign in with them."],
        ["อีเมลสำหรับเข้าสู่ระบบ (ถ้าเพิ่ม): เก็บเป็นค่าแฮชเท่านั้น อ่านย้อนกลับไม่ได้", "Sign-in email, if you add one: stored only as a hash that can't be read back."],
        ["โปรไฟล์: ชื่อเล่น รูป เขต ภาษา ความสนใจ คำตอบในโปรไฟล์ และสรรพนามถ้าใส่", "Profile: nickname, photo, district, languages, interests, profile answers and pronouns if you add them."],
        ["วันเกิด: ใช้ตรวจว่าอายุ 18 ปีขึ้นไป และจัดช่วงอายุ ไม่แสดงให้ใครเห็น", "Birth date: to check you're 18 or over and for age ranges. Never shown to anyone."],
        ["ข้อมูลส่วนตัว: เพศ และสถานะความสัมพันธ์ เก็บเมื่อคุณยินยอม", "Private details: gender and relationship status, kept with your consent."],
        ["ข้อมูลอ่อนไหว: อัตลักษณ์ทางเพศ คนที่อยากเจอ และเป้าหมายการเดต เก็บเมื่อคุณยินยอมโดยชัดแจ้งเท่านั้น", "Sensitive data: gender identity, who you'd like to meet and dating goals, kept only with your explicit consent."],
        ["ผลแบบทดสอบไทป์กรุงเทพฯ", "Your Bangkok Type quiz result."],
        ["การใช้งาน: กิจกรรมที่ลงชื่อ การเช็กอิน เวลาที่จะไปถึง โต๊ะ คนรู้จัก ตัวเลือกหลังกิจกรรม แชตและรูป บัดดี้ คำขอบคุณ ความเห็นหลังกิจกรรม และคำตอบว่าถึงบ้านปลอดภัยไหม", "Activity: events you join, check-ins, your ETA, tables, connections, post-event choices, chats and photos, buddies, thank-yous, event feedback and \"home safe?\" answers."],
        ["ความปลอดภัย: รายงาน การบล็อก คำเตือน และใบเตือน", "Safety: reports, blocks, warnings and strikes."],
        ["City Pulse และแบบสอบถามความรู้สึก: เมื่อคุณยินยอม เก็บใต้รหัสวิจัยแทนตัวตน", "City Pulse and wellbeing answers: with your consent, under a research code instead of your identity."],
        ["ข้อมูลทางเทคนิค: ค่าแฮชแบบมีกุญแจของ IP เพื่อกันการเดารหัสผ่าน ที่อยู่สำหรับส่งการแจ้งเตือนถ้าคุณเปิด และลิงก์ที่พาคุณมาสมัคร", "Technical: a keyed hash of your IP address to stop password guessing, a push address if you turn notifications on, and the link that brought you to sign up."],
        ["เราไม่เก็บตำแหน่ง GPS ปุ่มตำแหน่งของฉันบนแผนที่ทำงานในเบราว์เซอร์เท่านั้น ไม่ส่งมาหาเรา", "We don't collect GPS location. The map's my location button works in your browser only and is never sent to us."],
      ])}

      <h2>{t("เราใช้ข้อมูลเพื่ออะไร", "Why we use it")}</h2>
      {items([
        ["ให้บริการ: จัดโต๊ะ บัดดี้ โต๊ะประจำ แชต และเช็กอิน (ตามสัญญาการใช้บริการ)", "To run the service: tables, buddies, Regular Tables, chat and check-in (to provide the service you signed up for)."],
        ["ความปลอดภัย: ตรวจรายงาน กันการคุกคามและการหลอกลวง (ประโยชน์โดยชอบด้วยกฎหมาย) และช่วยเมื่อคุณกดขอความช่วยเหลือ", "Safety: reviewing reports and stopping harassment and scams (legitimate interest), and helping when you ask for help."],
        ["ข้อมูลอ่อนไหว: ใช้เมื่อคุณยินยอมโดยชัดแจ้ง (PDPA มาตรา 26) เท่านั้น", "Sensitive data: only with your explicit consent (PDPA section 26)."],
        ["City Pulse การแจ้งเตือน การจัดโต๊ะตามความสนใจ และลิงก์โซเชียล: เมื่อคุณยินยอม ถอนได้ทุกเมื่อ", "City Pulse, reminders, seating by interests and social links: only with your consent, which you can withdraw at any time."],
        ["ยอดรวมว่าคนมาจากลิงก์ไหน: เพื่อดูว่าการชวนแบบไหนได้ผล (ประโยชน์โดยชอบด้วยกฎหมาย)", "Totals of which links bring people: to see what works (legitimate interest)."],
      ])}

      <h2>{t("ใครเห็นอะไร", "Who sees what")}</h2>
      {items([
        ["คนที่เช็กอินกิจกรรมเดียวกับคุณ และคนรู้จักของคุณ เปิดโปรไฟล์คุณได้ ไม่มีใครค้นหาหรือไล่ดูสมาชิกทั้งหมดได้", "People checked in at the same event as you, and your connections, can open your profile. Nobody can search or scroll through all members."],
        ["ถ้าคุณเข้าร่วมบัดดี้กรุงเทพฯ คนอื่นที่เข้าร่วมจะเห็นการ์ดสั้น ๆ: ชื่อเล่น สรรพนามถ้าแสดง เขต ความสนใจ ภาษา และไทป์ถ้าคุณเปิดให้เห็น ไม่มีรูปหรืออายุ", "If you join Bangkok Buddy, others who joined see a short card: nickname, pronouns if shown, district, interests, languages, and your Bangkok Type if you show it. No photo or age."],
        ["โฮสต์และผู้จัดที่เป็นพาร์ตเนอร์ เห็นชื่อเล่น การลงชื่อ การเช็กอิน โต๊ะ เวลาที่จะไปถึง และการไม่มาตามนัด ของคนในกิจกรรมของเขา", "Hosts and partner organisers see the nickname, sign-up, check-in, table, ETA and no-shows of people at their events."],
        ["คนในแชตเดียวกัน (โต๊ะ โต๊ะประจำ บัดดี้ หรือคนรู้จัก) เห็นข้อความในแชตนั้น", "People in a chat with you (a table, Regular Table, buddy or connection) see the messages in it."],
        ["ลิงก์โซเชียลในโปรไฟล์ของคุณ เห็นได้เฉพาะคนที่เลือกกันทั้งสองฝ่าย และเฉพาะตอนที่คุณเปิดให้เห็น", "The social links on your profile are visible only to mutual connections, and only while your switch is on."],
        ["ข้อมูลเปิดใจมากกว่าเพื่อน เห็นได้เฉพาะคนที่เปิดใจเหมือนกัน และเฉพาะส่วนที่คุณเลือกแสดง", "Open to something more details are seen only by others who also opted in, and only what you choose to show."],
        ["ทีมงานและเจ้าหน้าที่ กทม. เห็นเฉพาะที่ความปลอดภัยต้องใช้ เช่น สถานะบัญชีและรายงาน ไม่เห็นข้อมูลเดต สถานะความสัมพันธ์ เพศ หรือตัวเลือกส่วนตัว และเห็นแชตเฉพาะข้อความที่ถูกรายงาน", "Our team and BMA staff see only what safety needs, such as account status and reports. They never see dating data, relationship status, gender or private choices, and see chats only when a message is reported."],
        ["กทม. ได้ผล City Pulse เป็นยอดรวมจาก 10 คนขึ้นไปเท่านั้น", "The BMA gets City Pulse only as totals from 10 or more people."],
        ["เราไม่ขายข้อมูล ไม่ใช้ตัวติดตามโฆษณา และพาร์ตเนอร์เห็นแค่สิ่งที่โฮสต์เห็นตามข้อด้านบน", "We never sell data or use ad trackers. Partners see only what hosts see, as above."],
      ])}

      <h2>{t("ใครอีกบ้างที่เกี่ยวข้อง", "Who else is involved")}</h2>
      <ul class="policy-rows">
        {PROCESSORS.map((p) => (
          <li>
            <strong>{p.name}</strong>
            <span>{T(p.does)}</span>
            <small>{T(p.sees)}</small>
          </li>
        ))}
      </ul>
      <p>{T(TRANSFERS)}</p>

      <h2>{t("เก็บไว้นานแค่ไหน", "How long we keep it")}</h2>
      <ul class="policy-rows">
        {RETENTION.map((r) => (
          <li>
            <strong>{T(r.what)}</strong>
            <span>
              {T(r.keep)}
              {r.period ? ` ${T(periodText(r.period))}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {items(RETENTION_NOTES.map((n) => [n.th, n.en]))}

      <h2>{t("คุกกี้และข้อมูลในเครื่อง", "Cookies and this device")}</h2>
      <p>{t("เราใช้เฉพาะคุกกี้ที่แอปต้องใช้ ไม่มีคุกกี้โฆษณาหรือติดตาม", "We only use cookies the app needs. No advertising or tracking cookies.")}</p>
      <ul class="policy-rows">
        {COOKIES.map((k) => (
          <li>
            <code>{k.name.endsWith("_") ? `${k.name}…` : k.name}</code>
            <span>{T(k.what)}</span>
            <small>{T(k.life)}</small>
          </li>
        ))}
      </ul>
      <p>{t("เก็บไว้ในเบราว์เซอร์นี้เท่านั้น ไม่ส่งมาหาเรา:", "Kept in this browser only, never sent to us:")}</p>
      <ul class="policy-rows">
        {DEVICE_STORAGE.map((k) => (
          <li>
            <code>{k.name}</code>
            <span>{T(k.what)}</span>
          </li>
        ))}
        <li>
          <code>{t("บัตรเข้างาน", "Event pass")}</code>
          <span>{t("บัตรเข้างานถูกเก็บไว้ในเบราว์เซอร์ เพื่อเปิดได้แม้ไม่มีเน็ต", "Your event pass is saved in the browser so it opens offline.")}</span>
        </li>
      </ul>

      <h2>{t("สิทธิของคุณ", "Your rights")}</h2>
      <p>
        {t(
          "คุณขอดู ขอสำเนา แก้ไข ลบ ระงับการใช้ คัดค้าน หรือโอนย้ายข้อมูล และถอนความยินยอมได้ทุกเมื่อ ส่วนใหญ่ทำได้เอง:",
          "You can ask to see, copy, correct, delete, restrict, object to or move your data, and withdraw consent at any time. Most of it you can do yourself:",
        )}
      </p>
      <ul>
        <li>
          <a href="/settings/consents">{t("ความยินยอมของฉัน", "My consents")}</a>: {t("เปิดหรือปิดแต่ละเรื่อง", "turn each one on or off")}
        </li>
        <li>
          <a href="/settings/privacy/export">{t("ดาวน์โหลดข้อมูลของฉัน", "Download my data")}</a>: {t("สำเนาข้อมูลทั้งหมดเป็นไฟล์ JSON", "a copy of all your data as a JSON file")}
        </li>
        <li>
          <a href="/settings/profile">{t("แก้ไขโปรไฟล์", "Edit profile")}</a>: {t("แก้ข้อมูลให้ถูก", "correct your details")}
        </li>
        <li>
          <a href="/settings/privacy">{t("ศูนย์ความเป็นส่วนตัว", "Privacy Center")}</a>: {t("ปิดบัญชี", "close your account")}
        </li>
      </ul>
      <p>{t("คุณร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.) ได้เสมอ", "You can always complain to Thailand's Personal Data Protection Committee (PDPC).")}</p>

      <h2>{t("ติดต่อ", "Contact")}</h2>
      <p class="policy-contact">{T(PRIVACY_CONTACT)}</p>
      <p>{T(REPORT_LINE)}</p>
    </article>,
  );
});

policyRoutes.get("/terms", (c) => {
  const { t, lang } = view(c);
  const T = (x: Text) => L(lang, x);
  const flagYears = Math.round(FLAG_WINDOW_DAYS / 365);
  const S = (props: { h: Pair; rows: Pair[] }) => (
    <>
      <h2>{t(props.h[0], props.h[1])}</h2>
      {props.rows.length === 1 ? (
        <p>{t(props.rows[0][0], props.rows[0][1])}</p>
      ) : (
        <ul>
          {props.rows.map(([th, en]) => (
            <li>{t(th, en)}</li>
          ))}
        </ul>
      )}
    </>
  );
  return page(
    c,
    { title: t("ข้อกำหนด", "Terms") },
    <article class="policy">
      <h1>{t("ข้อกำหนดการใช้งาน", "Terms of service")}</h1>
      <p class="muted">
        {t("ฉบับวันที่", "Version of")} {T(NOTICE_DATE)}
      </p>
      <S
        h={["ใครดูแล Jurrgun", "Who runs Jurrgun"]}
        rows={[[
          "Jurrgun เป็นแอปอิสระ ดำเนินการโดยผู้ก่อตั้ง กรุงเทพมหานคร (กทม.) เป็นเจ้าภาพหลัก ช่วยดูแลชุมชน และกำกับดูแล แต่ไม่ได้เป็นผู้สร้างแอป",
          "Jurrgun is an independent app run by its founder. The Bangkok Metropolitan Administration (BMA) is its main host, helps moderate and oversees it, but didn't make the app.",
        ]]}
      />
      <S
        h={["ช่วงทดลอง", "A pilot"]}
        rows={[["Jurrgun อยู่ในช่วงทดลอง บางอย่างอาจเปลี่ยน หยุดชั่วคราว หรือยังใช้ไม่ได้ เราจะบอกในแอปก่อนเปลี่ยนเรื่องใหญ่", "Jurrgun is in a pilot. Things may change, pause or not work yet. We'll tell you in the app before anything big changes."]]}
      />
      <S
        h={["ใครใช้ได้", "Who can join"]}
        rows={[
          [`อายุ ${MIN_AGE} ปีขึ้นไป`, `You're ${MIN_AGE} or over.`],
          ["อยู่ในหรือรอบ ๆ กรุงเทพฯ รวมถึงคนที่มาอยู่ช่วงหนึ่ง", "You live in or around Bangkok, or are staying for a while."],
          ["หนึ่งคนหนึ่งบัญชี และใช้ข้อมูลจริงของตัวเอง", "One account per person, with your own true details."],
        ]}
      />
      <h2>{t("กติกาความปลอดภัย", "Safety rules")}</h2>
      <ul>
        <li>{t("ทุกการเชื่อมต่อต้องเลือกกันทั้งสองฝ่าย", "Every connection is mutual: both people choose it.")}</li>
        <li>{t("ไม่ทักคนแปลกหน้า แชตได้เฉพาะกับโต๊ะ บัดดี้ หรือคนรู้จักของคุณ", "No cold messages. You chat only with your table, your buddy or your people.")}</li>
        <li>{t("นัดเจอในที่สาธารณะ", "Meet in public places.")}</li>
        <li>{t("ห้ามคุกคาม เกลียดชัง หลอกลวง ขายของ หรือชักชวนเข้าธุรกิจ", "No harassment, hate, scams, selling or recruiting.")}</li>
        <li>
          {t("ทำตาม", "Follow the")} <a href="/code-of-conduct">{t("หลักปฏิบัติของชุมชน", "code of conduct")}</a>
        </li>
      </ul>
      <S
        h={["ถ้ามีคนทำผิดกติกา", "If someone breaks the rules"]}
        rows={[
          ["ทีมงานตรวจทุกรายงานด้วยตัวเอง รายงานอย่างเดียวไม่ทำให้ใครถูกเชิญออก", "A person on our team reviews every report. A report alone never removes anyone."],
          [`เรื่องเล็กได้คำเตือน คำเตือนแต่ละครั้งนับเป็น 1 ธง และนับอยู่ ${flagYears} ปี`, `Smaller issues get a warning. Each warning is a flag, and a flag counts for ${flagYears} year${flagYears === 1 ? "" : "s"}.`],
          [`ครบ ${FLAGS_TO_REMOVE} ธง บัญชีถูกระงับ ${FLAG_SUSPEND_DAYS} วัน ทำผิดกติกาชัดเจน อาจถูกระงับหรือแบน`, `${FLAGS_TO_REMOVE} flags mean a ${FLAG_SUSPEND_DAYS}-day suspension. Clearly breaking a rule can mean a suspension or a ban.`],
          [`ไม่มาตามนัด หรือยกเลิกช้า (น้อยกว่า ${LATE_CANCEL_HOURS} ชั่วโมงก่อนเริ่ม) นับเป็นใบเตือน ซึ่งพักการลงชื่อชั่วคราว แต่ไม่ปิดบัญชี`, `No-shows and late cancels (under ${LATE_CANCEL_HOURS} hours) are event strikes. They pause sign-ups for a while, but never close your account.`],
          ["เราแจ้งคุณทุกครั้ง ถ้าคิดว่าเราตัดสินผิด ติดต่อเราตามช่องทางด้านล่าง แล้วเราจะดูเรื่องอีกครั้ง", "We always tell you. If you think we got it wrong, contact us below and we'll look again."],
        ]}
      />
      <S
        h={["บล็อกและรายงาน", "Block and report"]}
        rows={[
          ["บล็อกใครก็ได้ทุกเมื่อ ทั้งสองคนจะไม่เห็นกันอีก และไม่ถูกจัดนั่งโต๊ะเดียวกัน", "Block anyone at any time. You stop seeing each other and won't be seated together."],
          ["รายงานคนหรือกิจกรรมที่เคยเจอได้ อีกฝ่ายไม่รู้ว่าใครรายงาน", "Report a person or event you've met. They're never told who reported them."],
        ]}
      />
      <S
        h={["สิ่งที่คุณโพสต์", "What you post"]}
        rows={[
          ["โปรไฟล์ แชต และรูปเป็นของคุณ", "Your profile, chats and photos are yours."],
          ["คุณอนุญาตให้ Jurrgun เก็บและแสดงให้คนที่นโยบายความเป็นส่วนตัวบอกไว้เห็น ทีมงานเห็นเฉพาะเมื่อมีการรายงาน", "You let Jurrgun store them and show them to the people our privacy notice describes. Staff see them only when something is reported."],
          ["ลบได้ทุกเมื่อ อย่าโพสต์ข้อมูลหรือรูปของคนอื่นโดยไม่ได้รับอนุญาต", "Delete them whenever you like. Don't post other people's details or photos without their OK."],
        ]}
      />
      <S
        h={["กิจกรรมที่มีค่าใช้จ่าย", "Paid events"]}
        rows={[["จ่ายให้ผู้จัดโดยตรง ที่สถานที่หรือผ่านลิงก์ของผู้จัด Jurrgun ไม่รับเงินและไม่ได้เป็นคู่สัญญา เรื่องเงินคืนตกลงกับผู้จัด", "You pay the host directly, at the venue or through the host's own link. Jurrgun takes no money and isn't part of that deal. Refunds are between you and the host."]]}
      />
      <h2>{t("การเจอกันจริง", "Meeting in person")}</h2>
      <p>{t("การไปเจอใครเป็นการตัดสินใจและความเสี่ยงของคุณเอง เรามีตัวช่วยให้:", "Meeting people is your own choice and at your own risk. We give you tools to help:")}</p>
      <ul>
        <li>{t("สถานที่จริงในที่สาธารณะ มีโฮสต์ และเช็กอิน", "Real public places, a host and check-in.")}</li>
        <li>{t("บอกโต๊ะว่ากำลังไปหรือจะสาย และให้เราถามว่าถึงบ้านปลอดภัยไหม", "Tell your table you're on your way or running late, and let us ask if you got home safe.")}</li>
        <li>{t("สายด่วนแตะโทรได้ทันที บล็อก และรายงาน", "One-tap helplines, block and report.")}</li>
      </ul>
      <p>
        {t("ถ้าอยู่ในอันตราย โทร 191 ทันที", "If you're in danger, call 191 now.")} <a href="/safety/how">{t("เราดูแลความปลอดภัยยังไง", "How we keep you safe")}</a>
      </p>
      <S
        h={["ปิดบัญชี", "Closing an account"]}
        rows={[
          [`ปิดบัญชีได้ทุกเมื่อที่ศูนย์ความเป็นส่วนตัว โปรไฟล์ถูกซ่อนทันที และข้อมูลถูกลบหลัง ${DEACTIVATED_RETENTION_DAYS} วัน`, `Close your account at any time in the Privacy Center. Your profile is hidden at once, and your data is deleted after ${DEACTIVATED_RETENTION_DAYS} days.`],
          ["เราอาจระงับหรือปิดบัญชีที่ทำผิดข้อกำหนดนี้ ตามขั้นตอนด้านบน", "We may suspend or close an account that breaks these Terms, as described above."],
        ]}
      />
      <S
        h={["เมื่อข้อกำหนดเปลี่ยน", "Changes to these Terms"]}
        rows={[["เราจะบอกในแอปก่อนข้อกำหนดใหม่มีผล และแสดงวันที่ไว้ด้านบน", "We'll tell you in the app before new Terms take effect, and show the date at the top."]]}
      />
      <h2>{t("กฎหมายและการติดต่อ", "Law and contact")}</h2>
      <p>{t("ข้อกำหนดนี้ใช้กฎหมายไทย", "These Terms are governed by Thai law.")}</p>
      <p class="policy-contact">
        {t("ติดต่อ:", "Contact:")} {T(CONTACT_ADDRESS)}
      </p>
      <p>
        <a href="/privacy">{t("นโยบายความเป็นส่วนตัว", "Privacy notice")}</a>
      </p>
    </article>,
  );
});

/** How we keep you safe: one line per promise (owner: less text heavy). */
export const SAFETY_PROMISES: { emoji: string; title: Text; line: Text }[] = [
  {
    emoji: "🤝",
    title: { th: "เลือกกันทั้งสองฝ่ายเท่านั้น", en: "Mutual only" },
    line: { th: "คุณจะรู้ก็ต่อเมื่อเลือกกันทั้งสองคน ช่องทางติดต่อและลิงก์โซเชียลเห็นได้เฉพาะคนที่เลือกกันแล้ว", en: "You only hear when it's mutual. Contacts and social links are only shared between mutual connections." },
  },
  {
    emoji: "💬",
    title: { th: "ไม่มีคนแปลกหน้าทักมา", en: "No cold messages" },
    line: { th: "แชตได้เฉพาะกับโต๊ะ บัดดี้ หรือคนรู้จักของคุณ", en: "You can only chat with your table, your buddy or your people." },
  },
  {
    emoji: "👭",
    title: { th: "โต๊ะสำหรับผู้หญิง", en: "Women-only tables" },
    line: { th: "ผู้หญิงและคนนอนไบนารีเลือกโต๊ะ โต๊ะประจำ และบัดดี้ที่มีแต่ผู้หญิงได้", en: "Women and non-binary members can choose women-only tables, Regular Tables and buddies." },
  },
  {
    emoji: "🔒",
    title: { th: "ทีมงานไม่เห็นข้อมูลเดต", en: "Staff can't see dating data" },
    line: { th: "ข้อมูลเดต สถานะความสัมพันธ์ และเพศ ไม่แสดงให้ทีมงานหรือเจ้าหน้าที่ กทม. เห็น", en: "Dating data, relationship status and gender are never shown to our team or BMA staff." },
  },
  {
    emoji: "🚫",
    title: { th: "บล็อกและรายงาน", en: "Block and report" },
    line: { th: "บล็อกแล้วไม่เห็นกันทันที รายงานไปถึงทีมงานที่เป็นคนจริง และอีกฝ่ายไม่รู้ว่าใครรายงาน", en: "A block hides you from each other at once. Reports go to a real person, and nobody is told who reported." },
  },
  {
    emoji: "📍",
    title: { th: "เช็กอินที่สถานที่จริง", en: "Check-in at real places" },
    line: { th: "เจอกันในที่สาธารณะ มีโฮสต์ และเช็กอินด้วย QR หรือรหัสสั้น", en: "You meet in public places with a host, and check in with a QR or a short code." },
  },
  {
    emoji: "🕒",
    title: { th: "สถานะวันนัด", en: "Day-of status" },
    line: { th: "บอกโต๊ะว่ากำลังไปหรือจะสาย และให้เราถามว่าถึงบ้านปลอดภัยไหม", en: "Tell your table you're on your way or running late, and let us check you got home safe." },
  },
];

policyRoutes.get("/safety/how", (c) => {
  const { t, lang } = view(c);
  return page(
    c,
    { title: t("เราดูแลความปลอดภัยยังไง", "How we keep you safe") },
    <article class="policy safe-how">
      <h1>{t("เราดูแลความปลอดภัยยังไง", "How we keep you safe")}</h1>
      {SAFETY_PROMISES.map((s) => (
        <section>
          <h2>
            <span aria-hidden="true">{s.emoji}</span> {L(lang, s.title)}
          </h2>
          <p>{L(lang, s.line)}</p>
        </section>
      ))}
      <nav class="policy-links" aria-label={t("อ่านต่อ", "Read more")}>
        <a href="/safety">{t("สายด่วนและแชร์แผนนัด", "Helplines and share your plans")}</a>
        <a href="/code-of-conduct">{t("หลักปฏิบัติ", "Code of conduct")}</a>
        <a href="/privacy">{t("ความเป็นส่วนตัว", "Privacy")}</a>
      </nav>
    </article>,
  );
});
