# Personal data breach plan · แผนรับมือเหตุละเมิดข้อมูลส่วนบุคคล

*PDPA section 37(4) and the PDPC Notification on the criteria and methods for personal data breach notification, B.E. 2565 (2022). Drafted 16 Oct 2026 against `origin/main` at a038582. Not legal advice; the open items at the end need the owner. The record of processing is `design/reference/record-of-processing.md`.*

## 1. What counts · อะไรคือเหตุละเมิด

Any security failure that loses, exposes, changes or makes unavailable personal data without authority:
- **Confidentiality** (someone sees what they shouldn't): a member's dating intent or Pinky tap leaks to another member; a staff page shows romance, relationship or gender data; a push or notification goes to the wrong account; a data export reaches the wrong person or is left somewhere shared; a database credential or an SV Cloud setting (for example `EMAIL_HASH_SALT`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`) is stolen or committed.
- **Integrity** (data wrongly changed): a bug writes another member's profile, consent or check-in; consents flip without the member.
- **Availability** (data lost or unreachable): the retention job deletes too much; chat photos lost from storage; a long outage of sign-in.

A near miss (caught before any data left) is logged in the breach log too, marked "no breach".

## 2. Roles · ใครทำอะไร

| Role | Does | Who |
|---|---|---|
| Incident lead | Decides severity, whether to notify, signs off messages | Open item: the owner by default |
| Engineer on call | Contains, collects evidence, fixes | Open item |
| Privacy contact or DPO | Writes the PDPC notice and the member message | Open item (see the record, section 4) |
| BMA liaison | Tells the BMA when it touches their moderation or City Pulse | Open item |

Anyone who spots a possible breach tells the incident lead at once. The 72-hour clock starts when the lead has checked the report and has reasonable grounds to believe a breach happened.

## 3. First hour: contain · ชั่วโมงแรก: หยุดความเสียหาย

1. **Start the timeline** (UTC and Bangkok time) in the breach log below.
2. **Rotate secrets** in SV Cloud settings (`settings_set`): `GOOGLE_CLIENT_SECRET`, `LINE_CHANNEL_SECRET`, `EMAIL_API_KEY`, `SETUP_KEY`, `IP_HASH_SECRET`. Ask SV Cloud to rotate the database credential. Caution: a new `EMAIL_HASH_SALT` orphans every stored sign-in email, and new VAPID keys end every push device.
3. **Pause push and email:** remove `VAPID_PRIVATE_KEY` (push sends nothing without both keys) and `EMAIL_PROVIDER` (email sign-in hides itself without all four settings).
4. **Revoke sessions:** delete rows from `identity_sessions` for the affected accounts, or all of them (a destructive step: confirm with the owner first, SVAGENTS.md rule 9). Members simply sign in again.
5. **Disable the leaking route or staff access:** there is no kill switch in the code today, so roll back the last deploy (`deploy_rollback`) or push a fix that returns 404; set an affected staff account's role to `user` or suspend it.
6. **Preserve evidence** before anything is cleaned up (section 8). Do not run the retention job by hand during an incident.

## 4. Assess the risk · ประเมินความเสี่ยง

Weigh the PDPC's factors: the kind of breach; the type and volume of data; whether it is section 26 data; who the people are (vulnerable members, women-only spaces); how identifiable it is; how severe the harm could be; the security in place; and the scale of the service.

| Level | Typical Jurrgun case | Do |
|---|---|---|
| **No risk** | Hashes only (passwords, email HMACs, session ids) and the keys are safe; research codes alone, cut from accounts; an outage under an hour | Log it, no notice |
| **Risk** | Nicknames, districts, event attendance, contact handles to a few people; a misdirected reminder | PDPC within 72 hours |
| **High risk** | Any dating intent, Pinky, gender, relationship or wellbeing data; chats; a full database copy; data linking a research code to an account; anything enabling stalking | PDPC within 72 hours **and** members without delay |

Research codes count as personal data while the account still holds its `research_id`; a leak of both together is high risk.

## 5. Notify the PDPC within 72 hours · แจ้ง สคส. ภายใน 72 ชั่วโมง

Notify the PDPC Office without delay and within 72 hours of becoming aware, unless the breach is unlikely to result in a risk to people's rights and freedoms. Use the PDPC's Data Breach Report e-service, a letter or in person. Include:
- the nature of the breach, the kinds and rough number of people and records;
- the name and contact of the DPO or privacy contact;
- the likely consequences;
- what was done and will be done to stop it and limit harm, including what members were told.

If 72 hours can't be met, notify as soon as possible and explain the delay; the PDPC's published advice is no later than 15 days. A first notice can be followed by updates. When not notifying, keep the risk assessment and evidence: the PDPC may ask for it.

## 6. Tell members without delay (high risk) · แจ้งสมาชิก

Say what happened, what data, what we did, what they can do, and who to contact. Send it in the app (a notification row), by push (no details on the lock screen) and by email where an address is linked. Message template, Thai first; the incident lead fills in the incident, the data and the date beside each line before sending:

> **เรื่องข้อมูลของคุณใน Jurrgun**
> เราพบเหตุที่ทำให้ข้อมูลบางส่วนของคุณอาจถูกเปิดเผย ข้อมูลที่เกี่ยวข้องและวันที่เกิดเหตุอยู่ด้านล่าง
> เราหยุดเหตุแล้ว และแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลแล้ว
> สิ่งที่คุณทำได้ตอนนี้: เปลี่ยนรหัสผ่าน ตรวจความยินยอมของฉัน และระวังข้อความที่อ้างว่ามาจากเรา
> สงสัยอะไร ติดต่อทีม Jurrgun ได้ที่อีเมลเรื่องข้อมูลส่วนตัวในนโยบายความเป็นส่วนตัว
>
> **About your data on Jurrgun**
> We found a problem that may have exposed some of your data. What was involved and when is below.
> We've stopped it and told Thailand's Personal Data Protection Committee.
> What you can do now: change your password, check My consents, and be careful of messages claiming to be us.
> Questions? Contact the Jurrgun team at the privacy address in our privacy notice.

Push text: "มีเรื่องสำคัญเกี่ยวกับบัญชีของคุณ เปิดแอปเพื่ออ่าน / Important news about your account. Open the app to read it."

## 7. Processors · ผู้ประมวลผลข้อมูล

SV Cloud, Cloudflare (through SV Cloud), the email provider (Resend or Postmark) and the push services must tell us of a breach without delay, and the PDPC expects the contract to say within 72 hours. None of these agreements is confirmed: open item. Check SV Cloud status and errors first when the cause may be the platform.

## 8. Evidence to keep · หลักฐาน

- The audit log (`identity_audit_log`, read at `/admin/audit`); export the relevant rows before `AUDIT_RETENTION_DAYS` removes them.
- SV Cloud observability: `obs_list_errors`, `obs_get_trace`, `obs_list_slow_requests`, and `deploy_list` for what was live.
- The timeline, the risk assessment, every notice sent and its time.
- Never copy leaked personal data into tickets or chats; refer to ids.

## 9. The BMA · กรุงเทพมหานคร

Tell the BMA liaison when the breach touches moderation, staff accounts held by BMA staff, or City Pulse totals they received. Whether the BMA is a joint controller (and so shares the duty to notify) is an open item.

## 10. After · หลังเหตุ

Fix the cause, add a test that keeps the promise (in `test/privacy-promises.test.ts` or a `privacy-*` test), update the notice if anything it says changed, and write a short postmortem within 14 days: what happened, timeline, impact, what we changed.

## Breach log · บันทึกเหตุละเมิด

| ID | Found (date and time) | Aware (72-hour clock start) | What happened | Data and people affected | Risk level | Contained | PDPC notified (date or "not needed, why") | Members told | Processor involved | Fix and test | Postmortem |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |

## Open items · เรื่องที่ต้องตัดสินใจ

1. Names for the incident lead, engineer on call, privacy contact and BMA liaison, with phone numbers kept outside the repo.
2. The controller's legal name and address for the PDPC notice.
3. A DPO decision.
4. Signed processor terms with a 72-hour breach clause: SV Cloud, the email provider.
5. The BMA's controller status.
6. A real privacy email to replace the placeholder.
7. A kill switch or read-only mode for staff pages, so containment doesn't need a deploy.

## Sources

- PDPC, home and e-services (Data Breach Report): https://www.pdpc.or.th/en/home/
- PDPC, notifications of the PDPC: https://www.pdpc.or.th/en/category/notifications-of-the-pdpc/
- PDPC, subordinate legislation: https://www.pdpc.or.th/en/category/subordinate-legislation/
- PDPC advisory opinion on breach notification timing (72 hours from reasonable belief, phased notice, 15 days at the latest): https://www.pdpc.or.th/wp-content/uploads/2024/11/PDPC-consultation-46.pdf
- Tilleke and Gibbins, summary of the 2022 breach notification: https://www.tilleke.com/insights/thailand-pdpc-notification-on-data-breaches/2/
- Tilleke and Gibbins, the 2023 DPO notification: https://www.tilleke.com/insights/thailand-releases-notification-on-data-protection-officer-appointment/
