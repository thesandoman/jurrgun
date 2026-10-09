# BKK Social: brief coverage

*Updated 2026-10-09.*

This document lists every feature in the original brief (`bkk-social-prd-v1.md`) and the quiz brief, with its status in the app:

- ✅ built
- 🔨 being built in this round
- ⏸️ deliberately deferred, with the reason
- 🔌 needs an outside service or BMA decision first

## Accounts, onboarding, eligibility

| Brief item | Status |
|---|---|
| Mobile web / PWA | ✅ Manifest. 🔨 Service worker with an offline page |
| Phone OTP sign-in | ⏸️ The owner chose username/password for the prototype. OTP needs an SMS provider 🔌 |
| ThaiD / BMA identity verification | 🔌 Needs BMA approval. Staff can set "verified" manually for now |
| 18+ age gate; currently living in Bangkok | ✅ |
| Bangkok Registered Resident status | ✅ Staff toggle and resident quotas/priority. 🔨 Optional badge on profiles |
| Private relationship status; romance only for Single users | ✅ |
| Inclusive gender identity / "open to" (v3) | ✅ |
| Fun onboarding, like a personality quiz | 🔨 Rebuilt as one question per screen, opening with the Bangkok Vibe quiz |
| City Values / Bangkok Type quiz with archetypes and match labels | 🔨 Non-political version: 6 categories, procedurally generated, 13 archetypes, Natural / Complementary / Interesting labels |
| Profile photo, short prompts, interests, social style | ✅ |

## Events

| Brief item | Status |
|---|---|
| Discover home: "What can I do this week?" | ✅ |
| Event card fields (§7.1) | ✅ 🔨 Cover photo upload |
| Filters (§7.2) | ✅ 🔨 Resident-priority filter. ⏸️ Distance filter (needs location permission) |
| RSVP, waitlist, 12h offers | ✅ |
| Bring a friend: +1 | ✅ By username. 🔨 Invite link |
| Small-group assignment | ✅ Exchange-stable clearinghouse (no two people would both rather swap tables), with host override |
| QR check-in by the host | ✅ Camera scanner and short code |
| Social signals | ✅ Physical stickers are an operations matter |
| Host prompts / icebreakers | ✅ |
| Event Buddy (v3) | ✅ |
| No-show and strike policy | ✅ |
| VisitBangkok City Quests | ✅ Admin presets |

## After the event

| Brief item | Status |
|---|---|
| People I Met (72h), private choices, mutual consent | ✅ |
| Unreturned romantic interest never disclosed | ✅ Tested |
| Contact exchange (LINE / Instagram) | ✅ |
| In-app chat | ⏸️ Phase 2 in the brief |
| Post-event feedback | ✅ |

## Safety, privacy, PDPA

| Brief item | Status |
|---|---|
| Report / block, moderation queue, warnings/suspensions/bans, audit trail | ✅ |
| Rate limiting and anti-spam | 🔨 Login and sign-up throttling |
| Duplicate-account detection | ⏸️ Needs phone/ID verification first |
| Privacy Center: consents, export, deactivate | ✅ |
| Separate identity / social / research stores | ✅ |
| Retention schedule (§12.4) | 🔨 Automatic cleanup (lazy, run from the admin dashboard) |
| k ≥ 10 thresholds on research data | ✅ |
| DPIA, named DPO | 🔌 BMA |

## BMA dashboard

| Brief item | Status |
|---|---|
| Event management, waitlist, QR, groups, notices | ✅ |
| User and safety management (role-based, logged) | ✅ |
| City Pulse survey manager (no deploy needed) | ✅ |
| City Insight dashboard and KPIs against targets | ✅ |
| Partners and roles | ✅ |

## Notifications

| Brief item | Status |
|---|---|
| In-app notifications | ✅ |
| LINE Official Account / SMS / web push | 🔌 Needs a LINE OA and an SMS provider with credentials |

## Content (added after the brief)

| Item | Status |
|---|---|
| FAQ (home page and /faq) | ✅ |
| Learn: dating in Bangkok, consent, sexual health, dating responsibly, with sources and helplines | ✅ |

## Phase 2 / later (per the brief, not in scope)

These are deferred:
- AI event recommendations
- citizen-created events
- a community host programme
- a friend-of-friend graph
- city rewards
- a public Social City Map
- longitudinal research
