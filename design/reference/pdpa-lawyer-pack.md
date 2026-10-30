# PDPA lawyer review pack · เอกสารสำหรับทนายด้าน PDPA

*Prepared 30 Oct 2026 by Privacy & Security for one paid pre-pilot review (owner card L1, approved 27 Oct 2026). The owner books and pays; nobody else contacts the lawyer. Not legal advice: these are the questions we need answered, with what the app does today.*

## What to send ahead

1. The privacy notice as members see it: `/privacy` on the live site (dated 27 October 2026 once card P1 lands), with `/terms`.
2. `design/reference/record-of-processing.md`: 20 processing activities, lawful bases, retention constants, processors.
3. `design/reference/breach-response-plan.md`, including the dry run of 30 Oct 2026 (section 11).
4. `design/reference/privacy-risk-assessment.md`.
5. This page.

## Jurrgun in five lines

- A web app that puts people in Bangkok at small tables in real places, then lets them choose who to meet again (only mutual choices connect).
- Run by its founder. The BMA (Bangkok Metropolitan Administration) hosts, moderates and oversees safety, and receives research totals of 10 or more people, rounded.
- Data includes section 26 data with explicit consent: gender identity, who someone wants to meet, dating goals, and เกี่ยวก้อย · Pinky (a private plan and chat for two people who chose each other).
- Hosted on SV Cloud (Cloudflare Workers and Postgres); servers may be outside Thailand.
- No real members yet; a pilot is planned.

## The six questions (parked 16 Oct 2026, unparked by the owner 27 Oct 2026)

| # | Question | What we do today | Why it matters |
|---|---|---|---|
| 1 | Who is the data controller, and what is the BMA: processor, joint controller or separate controller? | The notice names Jurrgun as run by its founder, and gives the BMA's public contact as host and overseer. The BMA moderates through staff accounts and receives research totals. | Decides who signs the notice, who notifies the PDPC after a breach, and what agreement we need with the BMA. |
| 2 | Minimum age: 18 or 20? | Sign-up checks 18 or over from the birth date. | PDPA section 20 consent rules for minors; Thai majority is 20. Dating features are adult-only. |
| 3 | Does the Computer Crime Act's 90-day traffic-data retention apply to us? | Failed sign-in attempts are kept 24 hours as keyed hashes. We keep no IP log of normal use, and the SV Cloud platform logs are theirs. | If it applies, we may need to keep more than we do, and say so in the notice. |
| 4 | Cross-border transfers: are the providers' standard terms enough? | Section 28 transfer line in the notice. Cloudflare (via SV Cloud), the push services (Google, Apple, Mozilla, Microsoft) and, once on, the email sender (Resend or Postmark) are abroad. No signed agreements beyond standard terms. | Section 28 and 29 safeguards; processor terms with a 72-hour breach clause. |
| 5 | Do we need a DPO (section 41)? | None appointed. | We process section 26 data (dating, Pinky) as a core activity, which may count as large scale once the pilot grows. |
| 6 | What does a real moderation appeal need? | Banned members can ask once for "someone else to look again" (reviewed by a different staff member). Outcomes are told by in-app notice; the data export now lists moderation actions about the member. | Fairness and access rights; PDPA section 30 and the Terms. |

## Smaller questions found since

- **Breach notices to members:** sign-in emails are stored only as keyed hashes, so we can't email members. Are an in-app notice, push and a dated note on `/privacy` enough "without delay"?
- **Campaign link counts:** per day, per link code, with no IP, no browser details and no cookie. We treat them as not personal data. Agree?
- **Research codes:** City Pulse answers are kept under a code, not the name, but the account holds the code until deletion. Pseudonymous or anonymous for the notice and the BMA totals?
- **Privacy contact:** the notice still shows a placeholder address. What must the contact be (a named person, a role address)?

## Background: PDPC sources

- PDPC home and e-services: https://www.pdpc.or.th/en/home/
- PDPC notifications: https://www.pdpc.or.th/en/category/notifications-of-the-pdpc/
- PDPC subordinate legislation: https://www.pdpc.or.th/en/category/subordinate-legislation/
- PDPC advisory opinion on breach notification timing: https://www.pdpc.or.th/wp-content/uploads/2024/11/PDPC-consultation-46.pdf

The owner attaches any PDPC templates the lawyer asks for. We haven't copied them here, so the versions stay current.

## After the review

Privacy & Security turns each answer into a change in the notice, the record of processing or the code, through the usual decision cards. The answers are kept here under a dated heading.
