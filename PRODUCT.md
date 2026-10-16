# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the Rebuilder.** Aged 23 to 32, new to Bangkok within the last two years, Thai (from another province) or foreign. They have a job or studies and a phone full of apps, but no circle in the city yet, and want real friends without swiping or scrolling.
- **Also:** Bangkok locals who want new friends outside work and school, including people back from abroad.
- **People who run it:** Table Hosts (members who lead a Regular Table), event hosts, partner organisations (cafés, clubs, organisers), and moderators. Jurrgun's own team and BMA staff moderate.

## Product Purpose

Jurrgun (เจอกัน, "see you") gets people off their phones and to a table. Members join small groups at real Bangkok places, a Table of 4 to 6, a Regular Table that keeps meeting, or a weekly Bangkok Buddy, and afterwards choose who they'd like to meet again. Only mutual choices connect.

Success is people meeting again in person. The north star is **Weekly Reconnected Members**. Staff also track friendships that work without the app (two people who swapped contacts and met at least twice); members see that moment as a friendship to celebrate, with a next step to meet again.

## Positioning

The human way to meet people in Bangkok: offline first, small groups, fair, and accountable. It is an alternative to swiping and scrolling, not a better dating app or a better events listing.

Jurrgun is an independent app run by its founder. The BMA is its main host, moderator and oversight admin: city places, the official calendar, district reach, and safety oversight. It is not presented as the BMA's product or as endorsed by it. Staff, including BMA staff, never see romance data or private choices.

## Operating Context

- Mostly on phones, often on the way to or at the venue: check-in by QR or a short code at the meeting point, the pass, directions, chat.
- Bilingual, Thai first; English for international members, with local words explained.
- Members onboard with a short Bangkok Type quiz (about 16 plain scenarios), basics and privacy consent; the about-you questions come after the first RSVP ("Help your table get to know you").
- After each event, a 72-hour window to choose who to meet again; thank-you notes; reflections that feed City Pulse (with consent).
- Moderators work a report queue (urgent first, overdue flagged, every action audited). Hosts run check-in, seating, waitlists and no-shows.

## Capabilities and Constraints

- **Names (D5):** one-off group โต๊ะ / Table; recurring group โต๊ะประจำ / Regular Table; leader เจ้าภาพโต๊ะ / Table Host; connections tab คนรู้จัก / My people; each Regular Table meetup is a Hangout. "Circle" is retired in copy.
- **Friends first (D4).** Dating is an opt-in, 💘 เปิดใจมากกว่าเพื่อน / Open to something more: private, only visible to others who also opted in, deleted when switched off, never the lead in any surface or film.
- **Seating mixes people (D28, D31):** shared language and a practical anchor first, then a deliberate mix of Bangkok Types. Never a compatibility percentage, "top matches", browsable tablemates, or any score a member can see.
- **The quiz is human, not a game (D26):** plain scenarios, a fixed curated set, "none of these" on every question, no cheering or badges, and the result is a starting point, never a fixed label.
- **Feature freeze:** quality-of-life work only; no new features without the owner.
- **Privacy:** PDPA consents; sensitive data (gender, relationship, romance) is private, never shown to staff; women-only options exist only for women and non-binary members.
- Sign-up area: Bangkok and surrounding provinces.
- Stack and hosting: Hono server-rendered JSX on SV Cloud (Cloudflare Workers, Postgres). See SVAGENTS.md.

## Brand Commitments

- Name **Jurrgun** (เจอกัน). Live at `jurrgun.apps.sv-academy.org`; `jurrgun.ktm` is planned and not yet bought, so it is never printed.
- Tagline: **กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ / Small groups. Real Bangkok places. See you there.**
- Owner-set identity constraints (D3, D18): the green, cream and mango palette; love red only on Open to something more moments, never coral or orange there; Sao Chingcha for headings and Anuphan for everything else. Details live in the code and, later, DESIGN.md.
- Thai voice per `design/reference/thai-voice.md`: spellings เดต, แชต, เช็กอิน; no polite particles. No em dashes or en dashes anywhere, in either language.

## Evidence on Hand

- A working prototype, live, with a pilot launch plan (`design/reference/pilot-launch-plan.md`).
- **No real members, events, partners, quotes or numbers yet.** Every member, chat, event, partner (for example "Soi Social Club"), figure and testimonial in demos, films and screenshots is fictional and must be labelled so. Never present invented testimonials, member counts, partners or press as real.
- The BMA must not appear as maker or endorser in any surface or demo meant for outside eyes.
- Research and strategy: `design/reference/` (PRD v1 to v3, brand positioning, customer profile, strategy and risks).

## Product Principles

1. **Get people to a table, then step back.** Every surface should move someone toward meeting in person, not toward more time in the app.
2. **Small and fair beats big and optimised.** Small groups, mixed seating, mutual choices only, no scores or rankings of people.
3. **Safe and accountable by default.** Real places, hosts, check-in, clear reporting; sensitive details stay private, staff included.
4. **Friends first, always.** Dating is welcome as an opt-in, never the headline.
5. **Thai first, everyone welcome.** Locals, people from the provinces and people from abroad all belong; nobody needs fluent Thai.

## Accessibility & Inclusion

- WCAG 2.2 AA as the floor, plus Jurrgun's own rules: tap targets at least 44px on member pages, no colour-only states, no sideways scroll at 320px, reduced motion respected.
- Inclusive by design: women and non-binary spaces, pronouns and a self-described gender in the member's own words, queer-friendly events, plain English for non-Thai readers, readable Thai text sizes for older and low-vision members.
