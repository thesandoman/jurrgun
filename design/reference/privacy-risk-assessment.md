# Privacy risk assessment (PDPA)

*Owner request, 16 Oct 2026. Written by the Branding chat from a full read of `origin/main` at 65696e1 (schema, routes, services, tests). It's a working assessment for the owner and the BMA, not legal advice. A Thai data protection lawyer should review it before the pilot. Line references are to `origin/main` on that date.*

## 1. What Jurrgun holds, and how sensitive it is

**Key:** **S26** means a special category under PDPA section 26 (sex life or orientation, health). **Context** means sensitive in this app even if the law doesn't name it (dating, gender, safety).

| Data | Where | Sensitivity | Who sees it today |
|---|---|---|---|
| Account: username, password hash, role, status, sign-up source | `identity_accounts` | Normal | The member; staff see basic columns (`admin/users.tsx:31-42`) |
| Email (hashed), login codes (hashed), hashed IP | `identity_email_links`, `identity_login_codes` | Normal | Nobody |
| Profile: nickname, district, languages, interests, photo, prompts, bio (job, education, hometown, diet, access needs) | `social_profiles` | Normal; diet and access needs are close to health | The member, anyone checked in at the same event, connections, the current buddy |
| Birth date | `social_profiles.birth_date` | Normal | Nobody (used for matching) |
| Relationship status | `social_profiles.relationship` | Context | Nobody; staff are blocked |
| Romance mode, gender identity, who they're open to, orientation | `social_profiles` romance columns, bio `datingDeck` | **S26** | Other romance-eligible members, only with `showDatingPrefs` on |
| Private gender for women-only spaces | `social_profiles.gender`, `women_only` | Context | Nobody, but it can be inferred from women-only table membership |
| Pronouns | `social_profiles.pronouns` | Context | Card and buddy deck, opt-in |
| Dating intents: mode, reasons, challenges, goals, kids, pace | `social_dating_intents` | **S26-adjacent** | Nobody; used for totals and matching |
| Bangkok Type quiz result | `social_vibes` | Normal | Card if visible; **buddy deck regardless** |
| Social links, contact shares | `social_profile_links`, `social_contact_shares` | Normal | Mutual connections (with consent), the other person in the connection |
| Connection choices (friend, activity, romance) | `social_connection_choices` | Context | Nobody; only mutual results become connections |
| Attendance, check-in, ETA, table group | `social_registrations` | Normal | The host sees nickname, status, check-in, group, ETA |
| Chat messages and photos | `social_chat_messages` | Normal, but free text can hold anything | Thread members; moderators only when reported |
| Buddy intents, matches, quests | `social_buddy_*` | Context | The pair; the deck shows strangers' basic profile |
| Reports, moderation actions, strikes, blocks | `social_reports`, `moderation_actions`, `strikes`, `social_blocks` | Context | Moderators, admins; the blocker |
| Feedback, meet feedback, "home safe?" answers | `social_feedback`, `meet_feedback`, `social_safe_arrivals` | Context | Totals; safety follow-up |
| City Pulse answers, wellbeing (UCLA-3 loneliness score) | `research_pulse_responses`, `research_wellbeing` | Pseudonymous; **wellbeing is health-adjacent** | BMA totals with at least 10 people |
| Audit log | `identity_audit_log` | Redacted | bma_admin |
| Location | District only, no GPS | Normal | — |

## 2. Safeguards already in place

- **Staff can't see dating, gender or relationship data.** `redactSensitive` runs on write and on display (`src/lib/records.ts:19-40`), and the staff-privacy tests check it.
- **Mutual only.** Contact shares need an active connection and are capped at 10 a day. Social links need a mutual connection plus the `profile_links` consent. Blocks hide everything at once (`services/profile-links.ts:42-92`, `people.tsx:1028-1066`).
- **Blocking** removes connections, ends a buddy pairing, hides chats, profiles and links, and keeps the pair apart at seating. Table conflicts are stored without recording who blocked whom.
- **Women-only rules** apply to tables, regular tables and buddies.
- **Chat limits:** 500 characters, 40 messages per thread and 120 per day, 10 photos per day, and a scam warning on money words.
- **Login:** PBKDF2-SHA256 with 100k iterations, constant-time compare, throttles. Email codes are HMAC-hashed with a 5-try limit. Google and LINE sign-in ask for `openid` only.
- **Retention job:** hourly. Deactivation deletes photos and sign-in links and cuts the research ID. Hard delete after 30 days. Chats and "home safe?" answers are deleted after 180 days.
- **Research:** City Pulse cells under 10 people are hidden, and free text is never shown word for word.
- **Romance mode** needs an explicit tick, and turning it off clears the profile fields.
- **Data export:** a JSON export of the member's data.

## 3. Risks, scored

**Scores:** likelihood (L) and impact (I) are each rated 1 to 3, and score = L × I. **High** is 6 to 9 and is fixed before the pilot. **Medium** is 3 to 4 and is fixed during the pilot. **Low** is 1 to 2.

| # | Risk | L | I | Score | What fixes it | Owner |
|---|---|---|---|---|---|---|
| R1 | **Dating intents are collected before any consent.** `/onboarding/welcome` and `/onboarding/dating` save mode, reasons, challenges and prefs (including kids) before the consent screen, with no `romance_data` consent (`onboarding.tsx:186-189, 260-263`). That's S26-adjacent data collected without explicit consent. | 3 | 3 | **9** | Ask for the `romance_data` consent before the first dating question, or keep the answers in the session until consent is given. Never save dating intents without a consent row. | UI/UX |
| R2 | **Turning romance off or withdrawing consent doesn't delete dating intents** (`settings.tsx:1276-1288, 1458-1461`). The notice promises they are deleted at once. | 3 | 3 | **9** | Delete `social_dating_intents` and the bio dating fields on romance off and on `romance_data` withdrawal, and add a test. | UI/UX |
| R3 | **Relationship status and private gender are saved with no consent row** (`onboarding.tsx:821-827`). The notice says "only with your explicit consent". | 2 | 3 | **6** | Record a consent when these are given, or say plainly in the notice that they are needed for women-only spaces and seating, and kept private. | UI/UX |
| R4 | **The privacy notice promises more than the code does:** "nobody can browse you" (the buddy deck shows strangers), "never pass your data to partners" (partner hosts see attendees), an incomplete retention list, no contact for privacy requests, and an export that's missing chats, dating intents, buddy data and feedback. | 3 | 2 | **6** | Either make the code match each line or reword each line to the truth (owner decides). Complete the export. Name a privacy contact. | UI/UX + owner |
| R5 | **Data is kept after account deletion:** registrations, blocks, buddy matches and quests, meet feedback (including the comment about another member), thanks, plan pitches, hosted regular tables and their memberships, invites, chat votes (`retention.ts:194-232`). | 2 | 3 | **6** | Add these to the deletion list, or anonymise them (cut the account ID) where totals are needed. Add a test. | UI/UX |
| R6 | **Records with no retention limit:** audit log, reports, moderation actions, strikes, notifications of active accounts, exit reasons. | 2 | 2 | 4 | Set periods: for example 2 years for reports and strikes (safety), 1 year for the audit log, 90 days for read notifications. Add them to the retention job and the notice. | UI/UX + owner |
| R7 | **Consents that are recorded but not honoured:** `personalization` is never checked; `notifications` treats no row as yes, and turning push off doesn't revoke it; withdrawing `research` doesn't delete past answers; every account gets a `research_id` with or without consent. | 3 | 2 | **6** | Honour or remove `personalization`. Make no row mean no, and revoke on push off. Delete or anonymise past research rows on withdrawal (owner decides). Only issue a `research_id` with consent. | UI/UX |
| R8 | **The buddy deck shows strangers' profile and quiz type**, even when the type is set to hidden (`buddy.tsx:1012-1048`). | 2 | 2 | 4 | Respect the type `visible` setting in the deck, and say in the notice that buddy opt-ins see a short card. | UI/UX |
| R9 | **The audit log records who blocked or removed whom** (`people.tsx:1092, 1319`), and bma_admin can read it. That could reveal a block to staff. | 1 | 3 | 3 | Log the action without the other party, or redact it the way `redactSensitive` does. | UI/UX |
| R10 | **Unsalted SHA-256 IP hashes** can be reversed by brute force (`auth.tsx:47`). | 1 | 2 | 2 | Use HMAC with a secret salt, as for email. | UI/UX |
| R11 | **The login-attempt table keeps the raw username for 24 hours.** | 1 | 1 | 1 | Hash it, or accept the risk (low). | — |
| R12 | **Third parties aren't named in the notice:** Google and LINE sign-in, Resend or Postmark (email), push services (Google, Mozilla, Apple, Microsoft), Esri map tiles (they see the IP), Google Maps links, hosting and storage, and the cookies (only `jg_src` is listed). | 3 | 1 | 3 | One short "Who else is involved" list in the notice, plus a cookie list. | UI/UX |
| R13 | **Profiles are visible to everyone checked in at the same event,** not just table mates. | 2 | 1 | 2 | Owner decides: limit to table mates, or say so in the notice. | Owner |
| R14 | **No cross-border transfer statement.** Hosting, email and push may process data outside Thailand (PDPA section 28). | 2 | 2 | 4 | Name the countries or regions and the safeguard (the providers' standard terms) in the notice. | Owner + lawyer |
| R15 | **No breach plan.** PDPA requires notifying the PDPC within 72 hours of a breach that's a risk to people. | 1 | 3 | 3 | A one-page breach runbook: who decides, who tells the PDPC and the members, a contact template. | Owner + BMA |
| R16 | **No named data protection contact.** A DPO may be required at scale, and members need someone to contact. | 2 | 2 | 4 | Name a privacy contact now (an email in the notice), and decide on a DPO with the BMA before scaling. | Owner + BMA |

## 4. Before the pilot (must)

1. R1 and R2: dating data only with consent, and deleted when withdrawn. Tests for both.
2. R3: consent rows or honest wording for relationship status and private gender.
3. R4: make the notice and the code match, line by line, and complete the export.
4. R5: the deletion list covers every table that holds an account ID.
5. R7: honour every consent that's offered, or remove it.
6. The **consent centre**: one page listing every consent, including `profile_links`, which is missing from the Privacy Center today.
7. **Terms of service**: a real page (section 6), replacing the four-line prototype draft.
8. R16: a named privacy contact in the notice.

## 5. During the pilot (should)

R6 retention periods, R8 buddy deck, R9 audit wording, R10 IP hashing, R12 third parties and cookies, R14 transfers, R15 breach runbook, and a lawyer's review of the notice and Terms.

## 6. What the Terms of service must cover

They're plain words, Thai first, matching the privacy notice's tone:
- who runs Jurrgun (an independent app) and the BMA's role (host, moderator and oversight);
- that it's a prototype or pilot, with what that means;
- 18 and over;
- the safety rules: mutual consent, no cold DMs, meeting in public places, the code of conduct (linked), and no harassment, hate, scams or selling;
- what happens on a breach: strikes, suspension, bans, and how to appeal;
- blocking and reporting;
- members' content (profile, chat, photos): they own it and give Jurrgun permission to show it to the people they choose;
- paid events are paid to the host, off-platform, and Jurrgun isn't a party to that;
- meeting in person is at each member's own risk, with Jurrgun's safety tools listed;
- closing an account (the member's own, or by Jurrgun) and what's deleted;
- changes to the terms, with notice;
- governing law (Thailand) and a contact.

## 7. Owner decision (16 Oct): fix every contradiction

The owner asked for every contradiction and irregularity in the Terms and the privacy notice to be fixed. The rule, so every fix goes the same way:
- **Where the notice promises more protection than the code gives, the code changes to keep the promise:** R1, R2, R3 (consent rows), R5, R7, the R4 export, and the "delete at once" promises.
- **Where the code does something reasonable the notice leaves out, the notice says it plainly:**
  - partner hosts see attendees' nicknames, check-ins and ETAs;
  - buddy opt-ins see a short card;
  - profiles are visible to people checked in at the same event (R13);
  - third parties and cookies (R12);
  - retention periods (R6);
  - cross-border transfers (R14).
- **Everything else in sections 4 and 5 is done now, not later:**
  - R8 respects the type `visible` setting;
  - R9 redacts the other party;
  - R10 uses HMAC for IP hashes;
  - R11 hashes the username;
  - R16 names a privacy contact (an address the owner confirms; the placeholder is clearly marked until then).
- **The Terms are rewritten to section 6,** Thai first, and every claim in the Terms and the notice is checked against the code with a test where it can be.

## 8. Change log

- 16 Oct 2026: first version, from a code read of 65696e1.
