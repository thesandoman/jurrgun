# BKK Social \- Mobile Web Product Brief & Developer Requirements

## Draft MVP brief for Bangkok Metropolitan Administration (BMA) — v3

> **v3 changes (2026-10-09).**
> - **Inclusive by design** for LGBTQ+ people, expats and long-stayers, people who aren't interested in dating, and anyone new to the city (§3.4, §4.2, §4.4, §5.1).
> - Adds a **USP** (§0) and **VisitBangkok integration** (§7.3).
> - Replaces the civic City Values quiz with the **non-political Bangkok Vibe quiz**: 6 lifestyle categories with procedurally generated questions (§6.4; spec in `vibe-quiz-v3.md`).
> - Adds a **stable-matching clearinghouse** for small groups and optional 1:1 event buddies (§8.1, §10.5; results in `matching-experiment.md`).
> - Strategy, SWOT, stakeholder map and risk register are in `strategy-swot-stakeholders-risks.md`.
>
> v2 notes are kept below and still apply unless a v3 section replaces them.

> **v2 changes (2026-10-09).** Closes open decisions from the v1 review: check-in direction, "People I Met" scope, group timing, notifications, payments, host permissions, no-show policy, retention, privacy thresholds, compliance and KPI targets. Scope is re-cut into Pilot (P0) / MVP (P1) / Later (P2). The City Values quiz is explicitly excluded from matching, grouping and recommendations. New and changed material is in §§ 4.4, 5.1, 6.4, 8.1, 9.1, 10.1, 12.4–12.6, 13.0, 18.4, 19, 24 and 25. Values marked **[BMA to confirm]** are proposed defaults, not agreed policy.

Working concept: A BMA social-connection platform that helps people living in Bangkok meet new people safely through real-world city activities, while giving BMA anonymized insight into how Bangkok's spaces, mobility, safety, cost and services affect social connection.

Core positioning: We are not building Tinder for BMA. We are building a social layer for Bangkok. The product should feel like meeting friends-of-friends through something happening in the city. Romance can happen, but it is not the primary entry point.

MVP platform: Mobile web / PWA. Primary audience: 20-35, but open to all adults 18+ with age-based filters and event eligibility settings.

# 0\. USP (v3)

**Bangkok's own way to make friends. Small groups, real places, no swiping.** (TH: เพื่อนใหม่ในเมืองเดียวกัน — กลุ่มเล็ก สถานที่จริง ไม่ต้องปัดหา)

"The city is the host." Five things together set BKK Social apart from dating apps, friend apps and stranger-dinner services. The full competitive matrix is in `strategy-swot-stakeholders-risks.md`.

1. **The city's own places and calendar:** public venues, district reach, VisitBangkok routes and official festivals.  
2. **Fair small-group matching:** an exchange-stable clearinghouse. No two attendees would both rather swap tables, and the rule is published.  
3. **Never rejected, never exposed:** mutual consent only, no browsing, no cold DMs.  
4. **Inclusive by design:** gender-neutral one-sided matching, LGBTQ+ safe in every mode, Thai/English, and friends-only as a first-class choice.  
5. **Your night out improves the city:** City Pulse feedback goes straight to BMA.

# 1\. Product Objectives

• Help Bangkok residents meet people outside their existing work, school, family and home circles.  
• Make meeting new people feel safer and less awkward by using activities, small groups, hosts and mutual consent.  
• Encourage people to explore public and semi-public places in Bangkok.  
• Create an ongoing City Pulse dataset about where people feel safe, social, connected, comfortable, affordable and willing to spend time.  
• Help BMA identify urban pain points that make social connection difficult, such as transport, walkability, lighting, heat, lack of seating, cost, opening hours or lack of welcoming public spaces.  
• Test the hypothesis that a city can reduce social isolation by creating better conditions for people to meet \- not by directly matching people as a dating service.

# 2\. Product Principles

• Event-first, not profile-first: the home screen should show things to do, not a swipe deck of people.  
• Activity before attraction: users meet through a shared activity, table, walk, class, volunteer session, run, game, food experience or city exploration.  
• Small-group by design: events should deliberately place people into manageable groups rather than simply putting many strangers in one venue.  
• Mutual consent before connection: no one should know another person's private interest unless the interest is mutual.  
• No cold DM: users cannot randomly search Bangkok residents and message them.  
• Friends-first tone: the default intention is new friends, activity buddies and expanding one's social circle.  
• Romantic possibility is optional and secondary.  
• City insight must be privacy-conscious and separated from identity as much as technically possible.  
• BMA must be seen as creating safe social infrastructure, not selecting partners for citizens.

# 3\. Target Users, Eligibility and Age Filters

## 3.1 Eligibility

• Minimum age: 18+.  
• Primary product design target: ages 20-35.  
• Open to adults of other ages, subject to event-specific age rules and user age filters.  
• MVP eligibility: people who currently live in Bangkok, even if their official household registration is in another province.  
• User should select the Bangkok district or broad area where they currently live. Exact home address should not be required for the social profile.

## 3.2 Bangkok Registered Resident Status

The system should support a separate verification status for people whose official registered address is in Bangkok. This is not the same as simply living in Bangkok.

• Field example: bkk\_registered\_resident \= verified / not verified / not checked.  
• If BMA has an approved official verification method, integrate it later without exposing the actual registered address.  
• Verified users may receive an optional 'Bangkok Registered Resident' badge.  
• Admin should be able to create events with resident priority, resident-only quotas or special BMA benefits if policy requires.  
• Users may optionally filter relevant activities or post-event connections by verified resident status, but this should not be the default experience.

## 3.4 Inclusion Commitments (v3)

BKK Social is for **everyone who lives in Bangkok**: Thai or foreign, any gender identity or sexual orientation, single or not, looking for dates or definitely not.

**LGBTQ+ people**

• All matching (groups, buddies, People I Met) is one-sided and gender-neutral. Gender is never an input to friend, buddy or group matching.  
• Gender identity is **optional and self-described**: woman, man, non-binary, a self-described option, or prefer not to say. Pronouns are optional and shown only if the user chooses.  
• The romance layer (§4.2) works for any combination of identities. It uses a private "open to meeting" setting and only ever reveals a mutual match.  
• Identity and "open to" settings are PDPA s.26 sensitive data. They need explicit consent, are stored encrypted, are visible to **no** staff role (§13.0), and are deleted the moment romance mode is turned off.  
• Events can carry a **"Queer-friendly"** tag, and selected events can be **LGBTQ+ community events** co-hosted with vetted LGBTQ+ partner organisations. Eligibility is by self-identification, and these events never require users to show identity data on their profile.  
• Discrimination, misgendering and outing are explicit report reasons with zero tolerance.

**Expats, long-stayers and people from other provinces**

• Thai and English UI from P0. Every event shows its language(s), and there's an "English-friendly" tag.  
• Sign-up with a **Thai mobile number or email OTP** in P0. No Thai ID is required. ThaiD stays an optional extra trust badge.  
• Eligibility means *currently living in Bangkok*: Thai nationals with household registration elsewhere and foreign residents are equally eligible (§3.1).  
• A **"New to Bangkok"** onboarding path offers VisitBangkok tips, transport basics and newcomer events.  
• **Language-exchange tables** (Thai ↔ English, plus other languages on demand) are a standard event type. The group clearinghouse guarantees that everyone at a table shares at least one language with someone else there.

**People who aren't interested in dating**

• **Friends-only is the default**, and it is a first-class mode, not a fallback. A friends-only user never sees romance options, signals or wording anywhere in the app.  
• Romance features are hidden until a Single user deliberately turns on "Open to something more".  
• Events are labelled *Friends & activities*. The app never shows any event as a "singles" event unless the host deliberately creates one, and even then it must be opt-in.

**Everyone else**

• **Older adults:** daytime events and a simple large-text mode.  
• **Disabled users:** step-free and accessible-venue tags, WCAG 2.1 AA.  
• **Lower-income users:** free events are the majority and can be filtered for.

## 3.3 Age Preference

• Users can set a preferred age range for people they are open to connecting with after an event.  
• The preference should be private.  
• Post-event connection suggestions should appear only when both users fall within each other's allowed age ranges.  
• Events themselves may be 'all adults' or have a defined age range set by the organizer.

# 4\. Relationship Status and Connection Modes

The product should allow people in relationships or married people to join general community activities, because the platform is primarily about friendship and city connection. However, romantic-intent functions must be restricted so the platform is not used as a hidden dating channel.

## 4.1 Required Private Relationship Declaration

During onboarding, ask for a private relationship status. Suggested options:

• Single  
• In a relationship  
• Married  
• Prefer not to say

This field should not be shown publicly by default. It is used to determine which connection modes the user can access.

## 4.2 Connection Modes

Default connection modes available to everyone:

• New friends  
• Activity buddies  
• Expand my Bangkok circle

Optional mode available only to users who declare themselves Single:

• Open to something more

**(v3)** Friends-only is the default for every user. Turning on "Open to something more" also asks for two private, optional settings: the user's own gender identity, and who they're open to meeting (any identities, or everyone). These settings are used **only** to decide whether two people who have both chosen "Open to something more" for each other after an event are mutually compatible. They are never used to pick groups or buddies.

Users who select In a relationship, Married or Prefer not to say may join events and make friend/activity connections, but the romantic 'Open to something more' signal and romantic mutual-connect outcome must be disabled.

## 4.3 Misrepresentation and Safety

• Include a Code of Conduct stating that users must represent their relationship status truthfully if using romantic-intent features.  
• Add a report reason such as 'Misrepresented relationship status / inappropriate romantic behavior'.  
• Repeated or substantiated misuse can lead to warning, suspension or ban.  
• Do not automatically verify marital status against government registries in MVP. That would require separate legal, privacy and policy review.

## 4.4 Changing Relationship Status (v2)

• Users can change their relationship status at any time in Settings.  
• Changing from Single to any other status immediately disables 'Open to something more' and the 'Open to a spark' signal, and withdraws any pending romantic choices that haven't been resolved yet. Romantic connections that were already mutual stay as they are.  
• Changing to Single re-enables romantic features from the user's **next** event onward. It does not reopen 'People I Met' windows that have already closed.  
• To reduce abuse, a user can switch to Single at most once every 30 days **[BMA to confirm]**.  
• **(v3, replaces the v2 note):** gender identity and "open to meeting" are collected only when a Single user turns on romance mode (§4.2, §3.4). They are optional, private and encrypted, and are deleted when romance mode is turned off. They are never shown publicly and never used outside the romance mutual-consent check.

# 5\. Registration, Verification and Onboarding

## 5.1 Account Creation

• Mobile number \+ OTP should be the default MVP login.  
• Email may be optional.  
• The architecture should allow future integration with ThaiD or another BMA-approved identity verification service.  
• Verification should establish trust without displaying legal identity publicly.  
• **(v2) OTP delivery:** OTP is sent by SMS through a provider kept behind a swappable interface. LINE Login can serve as a secondary sign-in option in P1.  
• **(v3, replaces v2):** P0 supports **Thai mobile OTP or email OTP**, so residents without a Thai SIM can join from day one. LINE Login follows in P1. Each email account gets the same rate limits plus a disposable-domain blocklist.  
• **(v2) Rate limits:** at most 5 OTP sends per number per hour and 10 per device/IP per hour. An OTP is valid for 5 minutes, and after 5 failed attempts it is locked for 15 minutes.

## 5.2 Basic Required Fields

• Nickname / display name.  
• Date of birth.  
• Current Bangkok district / broad area.  
• Relationship status (private).  
• Languages.  
• Interest categories.  
• Preferred event style.  
• Preferred age range for post-event connection.  
• Consent and privacy settings.

## 5.3 Optional Profile Fields

• Profile photo.  
• Short prompt answers rather than a long dating bio.  
• Interests: food, running, art, music, pets, books, volunteering, city exploration, games, sports, culture, nightlife, etc.  
• Social style: small group, big group, doing an activity together, coffee and talk, bring-a-friend.  
• What I am here for: friends / activity buddies / explore Bangkok / expand my circle / open to something more if eligible.

## 5.4 Onboarding Tone

Onboarding should feel like a light personality quiz, not a government form. Use short cards, playful copy, progress indicators, illustrations and conversational questions. Example: 'Bangkok is huge. Where do you normally spend most of your week?'

# 6\. City Pulse \- Civic and Urban Insight Layer

A major BMA value proposition is learning what makes Bangkok easier or harder for people to meet, socialize and spend time in the city. Questions should be fun enough to answer but structured enough to become policy data.

## 6.1 What to Collect

• Perceived safety by area and time of day.  
• Walkability and sidewalk comfort.  
• Ease of public transport and first/last-mile connection.  
• Affordability of social activities.  
• Availability of comfortable public seating and public space.  
• Heat, shade and weather comfort.  
• Lighting and nighttime comfort.  
• Opening hours and late-night mobility.  
• Which districts feel easiest or hardest to meet people in.  
• Which city improvements would make users go out and socialize more.  
• Demand for activities by district, day and time.

## 6.2 Example Fun Questions

• 'If you had to take someone to one Bangkok district tonight, where would you go?'  
• 'What makes meeting someone in Bangkok the most exhausting?' Traffic / cost / heat / sidewalks / safety / no place to sit / transport / I just do not know where to meet people.  
• 'After work, how comfortable are you walking alone in this area?' 1-5.  
• 'If BMA could fix one thing to make people go out and meet more, what would you pick?'  
• 'Which area feels easiest for a first meet-up: Ari, Song Wat, Siam, Sathorn, Talat Noi, Thonburi, other?'  
• 'What kind of city activity would actually make you leave home this weekend?'

## 6.3 Political / Civic Opinion Guardrail

MVP should focus on civic priorities, service perceptions and city experience rather than political-party preference, vote choice or ideology. Political opinions are sensitive personal data and should not be mixed into social matching. If BMA later wants direct political-opinion research, it should be a separate optional research module with explicit consent, legal/DPO review, separate storage/access rules and no use in matching or public profile features.

## 6.4 Bangkok Vibe Quiz — Non-Political Matching Input (v3, replaces v2 §6.4)

The v2 civic "City Values" quiz is **retired**. Its questions on rules, development, who decides and public money could reveal political opinion, so it can't safely be used to match people. It is replaced by the **Bangkok Vibe quiz** (spec: `vibe-quiz-v3.md`; code: `src/vibe/`).

• **6 non-political lifestyle categories:** Social energy (Buzz ↔ Chill), Exploring (Discover ↔ Familiar), Daily rhythm (Night owl ↔ Early bird), Activity style (Move ↔ Savour), Planning style (Spontaneous ↔ Planner), Culture taste (Creative ↔ Old-town).  
• **Procedurally generated:** each session is assembled from templates plus a content bank of activities, VisitBangkok places, times of day and companions. No two users see the same quiz, retakes avoid questions the user has seen, and a seed recreates any session for scoring.  
• Content rule: questions describe only how someone likes to spend time in the city. There is nothing on policy, rules, public money, religion, politics, income or identity, and a test enforces this.  
• **May be used for matching** (group clearinghouse and buddy pairing), because it holds no sensitive data. Users are told this plainly: "Your vibe helps us seat you with people you'll click with."  
• The result is a playful name (e.g. "Curious Night Owl"). Showing it on the profile is optional.  
• Civic and service questions stay in **City Pulse** (§6.1–6.3). They are never used for matching and are always shown aggregated.

# 7\. Event Discovery \- Core Home Experience

The home screen should answer: 'What can I do in Bangkok this week?' rather than 'Who can I swipe?'

## 7.1 Event Card Requirements

• Event name.  
• Cover image.  
• Date and time.  
• Venue and map.  
• District.  
• Capacity and remaining slots.  
• Event age range or 'all adults'.  
• Language.  
• Cost / free. (v2: in P0/P1, payment for paid events happens off-platform, at the venue or partner. The app only shows the price and payment instructions. In-app payment is P2.)  
• Host identity.  
• Social intensity: Chill / Social / Very Social.  
• Group size.  
• Bring-a-friend allowed: yes/no.  
• Accessibility information.  
• Safety / meeting-point information.  
• Tags: food, run, culture, volunteer, board game, walk, art, etc.

## 7.2 Event Filters

• Date.  
• District / area.  
• Distance or travel zone if location permission is later enabled.  
• Age range.  
• Interest category.  
• Free / paid.  
• Group size.  
• Language.  
• Going alone / bring a friend.  
• Bangkok registered resident priority if applicable.

## 7.3 Recommended MVP Event Types

• After-work walks.  
• Small-group coffee roulette.  
• Running / walking \+ breakfast.  
• Bangkok food quests.  
• Museum / gallery visits.  
• Board game evenings.  
• Volunteer sessions.  
• Neighborhood exploration.  
• Public-space picnics.  
• Mini workshops.  
• Pet walks.  
• Conversation tables at public or partner venues.  
• **(v3) Language-exchange tables:** Thai ↔ English and others on demand.  
• **(v3) Newcomer meet-ups:** "New to Bangkok", for expats and people from other provinces.  
• **(v3) Queer-friendly socials:** co-hosted with vetted LGBTQ+ partners.  
• **(v3) City Quests from VisitBangkok routes:** 2–3 hour host-led small-group walks on the official routes (Rattanakosin classic, Little India / Phahurat, Charoenkrung–Talat Noi creative route, Khlong Bang Luang artists' house, Yaowarat food). The admin event form can import a route and its places directly from the VisitBangkok directory.  
• **(v3) Festival go-togethers:** small groups attached to official calendar events (Loy Krathong, Bangkok Design Week, Pride, Songkran).

# 8\. Event Structure and Group Formation

The event format is part of the product. A 100-person event without structure will not solve the social problem.

## 8.1 Small-Group Assignment

• Default target group size: 4-8 people.  
• For a larger event, the system should automatically assign users into tables / teams / circles.  
• Group logic may use interests, social style, age comfort, language and diversity of interests.  
• Do not use political views, religion or other sensitive traits for group formation. This explicitly includes City Pulse answers. (v3: the non-political Bangkok Vibe quiz *is* allowed as an input; see §6.4.)  
• Users attending with a friend may request to stay together, but the system should still mix them with new people.

**(v2) Timing and late arrivals:**

• Groups are formed from **checked-in** attendees, not from the RSVP list, so no-shows never leave holes in a group.  
• In P0, the host assigns groups by hand in the host view. At the event start time the host view offers a suggested split by round-robin, keeping +1 pairs together. The host confirms it or drags people between groups.  
• Late arrivals go to the smallest open group. The host can override this.  
• In P1, automatic assignment uses interests, social style, language and the age-comfort rules in §8.1. The host can always override it.

**(v3) Group clearinghouse (replaces the P0 round-robin suggestion):**

• Inputs are the Bangkok Vibe vector, interest tags, languages, +1 pairs and blocks. **Not** gender, orientation, relationship status, religion or any civic or political data.  
• Steps:  
  1. Size the tables to 4–6, as even as possible.  
  2. Make a greedy first split.  
  3. Swap people between tables until the split is **exchange-stable**: no two people at different tables would both be happier swapping places.  
• Hard rules: +1 pairs stay together, blocked pairs are never seated together, and **nobody is seated without at least one person who shares a language**. A swap that would strand a bystander is not allowed.  
• A small "novelty" bonus makes "mostly alike, with one thing to talk about" score higher than identical profiles, to avoid echo chambers.  
• In simulation (`matching-experiment.md`), versus a greedy split: about 3–5% higher average happiness, a 5–26% better-off worst-placed attendee (the gain grows with event size), zero remaining blocking swaps, and under 100 ms for 96 attendees. This is fast enough to run live at check-in close.  
• The host sees the suggested tables and can drag people between them. Overrides are logged.

## 8.2 Bring-a-Friend / Friend-of-Friend Feel

• Selected events can allow each user to invite one friend.  
• The invited friend registers through a referral link or event pass.  
• The app should show 'Going alone' or 'Bringing a friend'.  
• The event group algorithm should mix pairs and solo attendees so the atmosphere feels like friends bringing friends rather than a formal blind date.  
• Do not import users' phone contacts in MVP.

# 9\. Onsite Social Features

## 9.1 QR Check-in

• **(v2) Direction: the host scans the attendee.** Each confirmed registration gets a personal event pass: a QR code with a signed, single-use token tied to that user and that event. The host or staff scans it on arrival with the host view on their phone.  
• The reverse flow, where an attendee scans a QR code posted at the venue, is **not used**. A static code can be screenshotted and shared, which would let people "check in" remotely and unlock People I Met.  
• Fallback: the host can check someone in manually by nickname plus the last 4 digits of their pass code. Every manual check-in is logged.  
• Check-in opens 30 minutes before the event starts and closes 60 minutes after it starts **[BMA to confirm]**.  
• Attendance is recorded only after check-in.  
• Only checked-in users should appear in post-event connection options.  
• Host dashboard shows expected / checked-in / no-show participants.

## 9.2 Social Signal / Sticker System

At check-in, users may choose a social signal in the app and optionally receive a matching physical sticker, wristband or card. Suggested examples:

• Say hi \- ทักได้เลย  
• Here for new friends  
• Small group please  
• Talk to me about: food / travel / music / Bangkok / etc.  
• I came with a friend  
• Open to a spark \- optional and only available to eligible Single users.

The social signal should reduce the uncertainty of approaching a stranger. It must always be optional and easy to change.

## 9.3 Conversation / Activity Prompts

• Host can launch short icebreakers or missions from the admin/event page.  
• Prompts should be activity-based and city-based, not forced romantic questions.  
• Examples: 'Find someone who lives across the river from you', 'Pick one place in Bangkok everyone in your group would revisit', 'Choose one city problem your table would fix first'.

# 10\. Post-Event Connection Flow

This replaces swipe-based matching.

## 10.1 People I Met

• **(v2) Scope: the user's assigned small group only.** If an event has no groups (for example a 6-person walk), the whole event counts as one group. Showing every attendee of a large event would bring back a browse-and-pick dynamic.  
• Only checked-in attendees are eligible.  
• Both users must fall inside each other's private age preference (§3.3). If they don't, each is quietly left off the other's list. This is never shown as a rejection.  
• Blocked users never appear, in either direction.  
• **(v2) Window:** the list opens when the event ends and closes **72 hours** later. Choices that aren't mutual by then expire silently.  
• Users should not be able to search the full member database.

## 10.2 Private Connection Choice

For each person, allow private choices such as:

• Would like to be friends.  
• Activity buddy.  
• Open to meeting again.  
• Open to something more \- only for eligible Single users.  
• No action.

## 10.3 Mutual-Consent Logic

• No private choice is revealed unless there is a mutual compatible choice.  
• Friend \+ Friend \= friend connection.  
• Activity Buddy \+ Activity Buddy \= activity connection.  
• Open to something more \+ Open to something more \= romantic-interest connection.  
• If one person selects romantic interest and the other selects friendship, connect only at the friendship level and do not reveal the unreturned romantic interest.  
• If there is no mutual interest, neither user receives a rejection notification.

## 10.5 Event Buddy (optional, v3)

For people who don't want to arrive alone:

• When RSVPing, a user can tick **"Find me a buddy for this event"**.  
• 48h before the event, a clearinghouse round pairs everyone who ticked it, using **Irving's stable-roommates algorithm**. It is one-sided and gender-neutral, so anyone can be paired with anyone.  
• Hard rules: the pair shares a language, each is inside the other's age preference, neither has blocked the other, and both have a non-romance intent. Buddy pairing is **never** romantic.  
• If no stable pairing exists (3–10% of rounds in simulation), the system falls back to the highest-scoring mutual pairs. If the number of people is odd, one buddy group of 3 is formed.  
• Buddies see each other's nickname and a meeting point 24h before the event. They are not given each other's contact details: those are only exchanged through the normal post-event mutual consent.

## 10.4 Contact Exchange for MVP

Recommended MVP: do not build a full open chat system initially. After a mutual connection, both users can choose to reveal a contact method such as LINE or Instagram. This reduces moderation complexity. A lightweight in-app chat can be considered in Phase 2\.

# 11\. Safety, Trust and Moderation

• Verified account status.  
• Clear community code of conduct.  
• Report user.  
• Block user.  
• Report event / host.  
• Report categories: harassment, inappropriate romantic behavior, misrepresented relationship status, impersonation, spam/scam, unsafe behavior, discrimination, other.  
• Admin moderation queue.  
• Warning / temporary suspension / permanent ban.  
• Audit trail for moderation actions.  
• Rate limiting and anti-spam controls.  
• Duplicate-account detection where legally and technically appropriate.  
• Event host emergency contact.  
• Venue / safety information on event page.  
• No continuous GPS tracking required for MVP.  
• MVP BMA events should primarily use public or semi-public venues rather than private homes.

# 12\. Privacy and PDPA Requirements

## 12.1 Privacy by Design

• Collect only data needed for the defined service or research purpose.  
• Separate identity/verification data from social profile data and city research data.  
• Use pseudonymous internal user IDs between systems.  
• Do not expose legal name, ID number, exact home address or official registered address on public profiles.  
• City-policy teams should primarily see aggregated data, not individual profiles.

## 12.2 Consent / Privacy Center

The mobile web app should include a clear privacy center with separate categories where appropriate:

• Required for account and event service.  
• Identity / verification.  
• Safety and moderation.  
• Optional personalization.  
• Optional city research / City Pulse.  
• Optional notifications / marketing.

• Users should be able to view/update relevant profile data.  
• Users should be able to withdraw optional consent where applicable.  
• Users should be able to deactivate their account.  
• Provide a workflow for access/deletion requests where legally applicable.  
• Privacy notice and terms must remain accessible from Settings.

## 12.3 Recommended Data Separation

A. Identity / Verification Store

• Legal verification reference.  
• Mobile number / email.  
• Verification status.  
• Official Bangkok registration verification status if implemented.

B. Social App Store

• Nickname, photo, interests, social style, events, attendance, connection preferences.

C. City Research Store

• District ratings, safety perception, mobility issues, public-space perception, affordability, city priorities and activity demand.

Research analytics should use pseudonymous or aggregated identifiers wherever possible.

• **(v2) Implementation:** use one Postgres database with three schemas: `identity`, `social` and `research`. Each schema is reached through its own database role. The app's social code paths cannot read `identity` beyond verification status. Research rows are keyed by a `research_id`, and the only link between `research_id` and `user_id` is a mapping table inside `identity`.

## 12.4 Data Retention (v2) [BMA to confirm]

| Data | Retention |
|---|---|
| OTP codes | 5 minutes |
| Pending (non-mutual) connection choices | Deleted when the 72h window closes |
| Mutual connections, shared contact methods | Until either user removes the connection or deletes their account |
| Social signals | Deleted 7 days after the event |
| (v3) Bangkok Vibe quiz | Raw answers deleted once scored; the 6-number vibe vector is kept until the user retakes the quiz or deletes their account |
| (v3) Romance identity / "open to" settings | Deleted as soon as romance mode is turned off |
| Check-in and group records | 12 months; aggregated after that |
| Moderation cases and evidence | 24 months after case closure, or longer if a legal hold applies |
| Audit logs | 24 months |
| City Pulse raw answers | 24 months under research_id. The research_id link is cut when the account is deleted, so remaining rows are anonymous. |
| Deactivated accounts | Social profile hidden at once and hard-deleted after 30 days, unless a moderation hold applies |

## 12.5 Re-identification Thresholds (v2)

• No aggregate cell is shown or exported unless it has **k ≥ 10** distinct respondents **[BMA to confirm]**. This applies to every cross of district × age band × time slot × any other dimension.  
• Cells below the threshold are shown as "fewer than 10" and are never displayed as zero.  
• Free-text answers are never shown verbatim in the dashboard in P0.

## 12.6 Compliance (v2)

• A Data Protection Impact Assessment (DPIA) must be completed and approved by the BMA DPO before the pilot launches, and again before any new sensitive-data feature launches (e.g. the romance identity / "open to" settings in §3.4).  
• A named Data Protection Officer contact must appear in the Privacy Center.  
• The PDPA s.26 analysis must cover City Pulse data and the romance identity / "open to" settings.  
• The user-facing app must meet WCAG 2.1 AA, including Thai-script legibility at the default font size.

# 13\. BMA / Admin Web Dashboard

## 13.0 Roles and Permissions (v2)

| Capability | BMA Admin | Moderator | Partner Org Admin | Event Host | City Insight Viewer |
|---|---|---|---|---|---|
| Create / edit events | All | — | Own org | — | — |
| See attendee nicknames for an event | All | For a case | Own org's events | Assigned events | — |
| Check in attendees / assign groups | All | — | Own org's events | Assigned events | — |
| See relationship status, age preference, connection choices | **Never** | **Never** | **Never** | **Never** | **Never** |
| See phone number / verification data | For a case, logged | For a case, logged | — | — | — |
| Review reports, warn / suspend / ban | Yes | Yes | — | Can file reports | — |
| View aggregated City Pulse | Yes | — | — | — | Yes (k-threshold) |
| Create City Pulse questions | Yes | — | — | — | — |

• Nobody, including admins, can see who chose whom in People I Met. The system only records the mutual outcomes.  
• Event hosts must complete a short briefing before their first event. It covers the code of conduct, how to escalate incidents, and the check-in flow.  
• **Incident escalation:** the host files an in-app incident report during or after the event. A BMA moderator is notified, and the target response time is 24h for standard reports and 1h for safety-critical ones **[BMA to confirm]**. For emergencies, the host contacts emergency services (191 / 1669) first.

## 13.1 Event Management

• Create / edit / cancel event.  
• Set age range, capacity, district, venue, host, cost and tags.  
• Set bring-a-friend rule.  
• Set resident priority / quota.  
• Manage waitlist. (v2: when a confirmed attendee cancels, the first person on the waitlist is promoted automatically and notified. They have 12h to confirm before the spot moves to the next person.)  
• Generate QR check-in.  
• Auto-create / manually adjust small groups.  
• View check-in and no-show status.  
• Send event notices.

## 13.2 User and Safety Management

• Search user by internal ID / verified account information with restricted staff permission.  
• Review reports.  
• Record evidence and moderator notes.  
• Issue warning / suspension / ban.  
• View event participation history when necessary for safety investigation.  
• All sensitive admin access should be role-based and logged.

## 13.3 City Pulse Survey Manager

• Create question.  
• Set answer type: multiple choice / scale / short text / area selection.  
• Set target segment and active dates.  
• Preview mobile card.  
• Pause / archive question.  
• Export aggregated results.  
• Questions should be configurable without requiring a new software release.

## 13.4 City Insight Dashboard

• Social friendliness by district.  
• Perceived safety by district / time.  
• Walkability perception.  
• Transport convenience.  
• Affordability.  
• Demand for events.  
• Top barriers to going out.  
• Top requested city improvements.  
• Event participation and repeat rate by district.  
• Minimum sample-size rules before displaying small demographic segments to reduce re-identification risk.

# 14\. Core User Screens for MVP

• 1\. Landing / product explanation.  
• 2\. Mobile OTP login.  
• 3\. Eligibility / age gate.  
• 4\. Verification status.  
• 5\. Privacy and consent.  
• 6\. Fun onboarding quiz.  
• 7\. Social profile.  
• 8\. City Pulse questions.  
• 9\. Home / Discover events.  
• 10\. Filters.  
• 11\. Event detail.  
• 12\. RSVP / waitlist.  
• 13\. Invite a friend.  
• 14\. My Events.  
• 15\. QR check-in.  
• 16\. Group / table assignment.  
• 17\. Social signal selector.  
• 18\. Event prompts / activity cards.  
• 19\. Post-event feedback.  
• 20\. People I Met.  
• 21\. Mutual connection result.  
• 22\. Contact exchange.  
• 23\. Report / Block.  
• 24\. Notifications.  
• 25\. Settings / Privacy Center.  
• 26\. BMA Admin Dashboard.

# 15\. High-Level Data Objects

• User.  
• Identity Verification.  
• Bangkok Resident Verification.  
• User Profile.  
• Relationship Status / Connection Eligibility.  
• Interest.  
• Age Preference.  
• City Pulse Question.  
• City Pulse Response.  
• Event.  
• Event Host.  
• Event Registration.  
• Friend Invitation.  
• Check-in.  
• Small Group / Table.  
• Social Signal.  
• Post-Event Connection Choice.  
• Mutual Connection.  
• Shared Contact Method.  
• Report / Moderation Case.  
• Notification.  
• Consent Record.  
• Audit Log.

# 16\. Mobile Web / PWA Technical Requirements

• Responsive mobile-first web app optimized for iPhone and Android browsers.  
• PWA-capable so users can add it to the home screen.  
• Thai-first UX with architecture ready for English localization.  
• Fast initial load on mobile networks.  
• Accessible typography, tap targets and contrast.  
• Secure HTTPS only.  
• Encryption in transit and at rest.  
• Role-based access control for BMA/admin users.  
• Server-side validation for all eligibility and consent rules.  
• Audit logging for admin and moderation actions.  
• Configurable feature flags for pilot testing.  
• No dependency on App Store / Play Store approval for MVP.  
• **(v2) Notifications:** iOS web push only works after the user adds the app to their Home Screen, so web push can't be the main channel. P0 uses in-app notifications plus SMS for critical messages only: waitlist promotion, event changes or cancellations, and a reminder 24h before. P1 adds a BMA LINE Official Account, linked by the user's opt-in, as the main reminder channel. Web push stays an optional extra.  
• QR-code support for event check-in and friend invitation.  
• Analytics events must use internal IDs and avoid sending unnecessary personal data to third-party analytics.  
• Architecture should allow future API integrations with BMA systems, ThaiD, maps, payment or city rewards without requiring a complete rebuild.

# 17\. MVP Functional Acceptance Criteria

• An eligible adult living in Bangkok can register on mobile web using OTP.  
• User can complete a fun onboarding flow and save interests, social style, relationship status and age preference.  
• System correctly disables romantic-intent features for users who are not Single.  
• User can discover and filter BMA/partner events.  
• User can RSVP, join a waitlist and invite a friend when enabled.  
• Host can check users in via QR.  
• System can assign checked-in attendees to small groups.  
• User can choose an onsite social signal.  
• After an event, user can see only eligible people they actually attended with.  
• User can make private connection choices.  
• A connection is created only after mutual compatible consent.  
• Unreturned romantic interest is never disclosed.  
• User can report or block another user.  
• BMA staff can create events, manage attendees and review moderation cases.  
• BMA staff can create City Pulse questions without developer deployment.  
• City Pulse responses can be viewed as aggregated dashboard data by district / segment with privacy thresholds.  
• User consent records and key admin actions are auditable.

# 18\. MVP KPIs

## 18.1 Product KPIs

• Registration to first-event conversion.  
• Event RSVP to attendance rate.  
• No-show rate.  
• Repeat event attendance.  
• Average events attended per active user.  
• Bring-a-friend rate.  
• Post-event feedback completion.  
• Mutual connection rate.

## 18.2 Social Impact KPIs

• Percentage who met at least one new person.  
• Percentage who would meet someone from the event again.  
• Percentage reporting a larger or more diverse social circle.  
• Percentage comfortable attending alone.  
• Perceived safety score.  
• Percentage who return to another city activity.

## 18.3 City Insight KPIs

• Districts perceived as easiest / hardest to socialize in.  
• Main barriers to meeting people.  
• Perceived nighttime safety.  
• Walkability / transport / affordability scores.  
• Activity demand by district and time.  
• Changes in city perception after attending activities.

## 18.4 Pilot Targets and Measurement (v2) [BMA to confirm — placeholders]

| KPI | Pilot target |
|---|---|
| Registration → first RSVP | ≥ 40% |
| RSVP → check-in (attendance rate) | ≥ 70% |
| Checked-in users who make ≥ 1 mutual connection | ≥ 50% |
| Attended ≥ 2 events within 60 days | ≥ 30% |
| "I met at least one new person I'd see again" | ≥ 60% |
| "I felt safe at this event" (4–5 on a 5-point scale) | ≥ 90% |
| Harassment reports per 100 attendees | < 1 |

**Baseline for social-impact claims:** at onboarding, ask the 3-item UCLA Loneliness Scale (short form) as optional research questions with consent. Ask the same items again after the user's 3rd attended event, or 60 days after registration, whichever comes first. Without this baseline the product cannot back up a claim to reduce isolation.

# 19\. Recommended MVP Scope vs Later Phases

(v2) The v1 MVP list (26 screens plus a full dashboard) was too large for a first pilot, so scope is now split into three phases.

## P0 — Pilot (target: 3–5 BMA events, 100–300 users)

• Mobile web / PWA, Thai-first.  
• Phone OTP registration, age gate (18+), current-district eligibility.  
• Private relationship declaration and connection-mode gating.  
• Light onboarding: interests, social style, languages, age preference.  
• BMA-created events only. Event list with date, district and interest filters.  
• RSVP, a capacity-limited waitlist with automatic promotion, and a simple "+1" option (the friend registers with their own account and the host links the pair).  
• Personal event pass, with check-in by host scan.  
• Small groups suggested by the **exchange-stable clearinghouse** (§8.1, v3), editable in the host view.  
• Thai mobile **or email** OTP; Thai/English UI; friends-only default; optional identity and "open to" settings for romance mode (§3.4).  
• Bangkok Vibe quiz (procedurally generated, non-political) as an onboarding step that can be skipped.  
• Social signal selector.  
• Post-event feedback, with the loneliness baseline/follow-up items from §18.4.  
• People I Met (assigned group only, 72h), private choices, mutual-consent resolution.  
• Contact reveal (LINE ID / Instagram) after a mutual connection.  
• Report / block, plus a basic moderation queue.  
• 5–8 fixed City Pulse questions, seeded by admin. Aggregated view with k-threshold.  
• Privacy Center: consents, data view, deactivate account.  
• Audit log for admin actions.

## P1 — MVP

• Partner-organization accounts and the host role.  
• Automatic small-group assignment, with host override.  
• City Pulse question manager (no-code).  
• City Insight dashboard by district and segment.  
• Bring-a-friend referral link / event pass.  
• Bangkok registered-resident verification status and resident quotas, once an approved method exists.  
• LINE OA notifications and LINE Login. Email OTP for non-Thai-SIM residents.  
• Event Buddy pairing (§10.5).  
• Queer-friendly and LGBTQ+ community events with partner co-hosts.  
• VisitBangkok route import into the admin event form.  

## P2 — Later

• In-app chat.  
• AI event recommendations.  
• Citizen-created events with host verification.  
• Community host program.  
• More advanced friend-of-friend graph.  
• City rewards / partner benefits.  
• Public Bangkok Social City Map.  
• Longitudinal social-connection research.  
• More advanced compatibility logic only if user research demonstrates a clear need.

# 20\. MVP Assumption on Who Can Create Events

Because event-host policy was not yet specified, this brief assumes that MVP events can be created only by BMA and approved partner organizations through the admin dashboard. General citizen-created events should not be enabled in V1. This keeps safety, venue quality, moderation and brand responsibility manageable during the pilot.

# 21\. Suggested Main User Journey

Register \-\> OTP \-\> age/eligibility \-\> privacy \-\> fun onboarding \-\> interests \+ social style \-\> relationship eligibility \-\> City Pulse \-\> discover event \-\> RSVP \-\> invite a friend or go solo \-\> QR check-in \-\> receive small-group assignment \-\> choose social signal \-\> join activity \-\> post-event feedback \-\> choose people to keep in your Bangkok circle \-\> mutual connection \-\> optional contact exchange.

# 22\. North-Star Product Rule

People should open BKK Social thinking: 'What can I do in Bangkok this weekend?' \- not 'Who can I swipe today?'

The platform succeeds when strangers safely become acquaintances, acquaintances become friends, and sometimes friendship becomes something more.

# 23\. Reference Inspiration

• BBC reference provided in the project brief: https\://www\.bbc.com/news/articles/cqzjzr893yv4o  
• Urban Creature \- Bangkok / single-life and city context: https\://urbancreature.co/bkk-single/  
• Instagram reference provided in the project brief: https\://www\.instagram.com/p/DadAI1qCBVO/  
• Initial stakeholder idea: emphasize relationships within the city, create opportunities to meet beyond work/school/home, use real-world spaces such as Skywalks, parks, cafes, supermarkets and transit areas, and use simple onsite social signals or stickers to make approaching others easier.


# 24\. No-Show and Cancellation Policy (v2) [BMA to confirm]

• Users can cancel up to 24h before an event start with no penalty.  
• A late cancellation (under 24h) or a no-show counts as 1 strike. A strike expires 90 days after it was given.  
• At 2 active strikes, the user loses waitlist priority and can hold only 1 upcoming RSVP at a time.  
• At 3 active strikes, the user can't RSVP for 30 days.  
• Strikes are shown privately to the user in My Events, never to hosts or other users.  
• Hosts can waive a strike for a documented reason, such as illness or the event moving.

# 25\. v2 Decisions Log

| # | Open question in v1 | v2 decision | Section |
|---|---|---|---|
| 1 | City Values quiz used for matching | Never used for matching, grouping or recommendations. Opt-in module, separate consent, P1 after DPIA. *(Superseded by #18: the quiz is retired.)* | 6.4, 8.1 |
| 2 | Check-in direction | Host scans the attendee's personal signed pass | 9.1 |
| 3 | People I Met: event or group | Assigned small group only; 72h window | 10.1 |
| 4 | Group timing | Formed from checked-in attendees; manual in P0, automatic in P1 | 8.1 |
| 5 | Notifications | In-app + SMS (critical only) in P0; LINE OA in P1 | 16 |
| 6 | Paid events | Paid off-platform; app shows price only | 7.1 |
| 7 | Host / partner permissions | Role matrix; no one sees relationship status or individual choices | 13.0 |
| 8 | No-shows | Strike system | 24 |
| 9 | Retention | Retention table | 12.4 |
| 10 | Privacy threshold | k ≥ 10 on all aggregate cells | 12.5 |
| 11 | Non-Thai-SIM residents | Excluded in P0 (stated limitation); email OTP / LINE Login in P1 | 5.1 |
| 12 | Compliance | DPIA, named DPO, PDPA s.26 analysis, WCAG 2.1 AA | 12.6 |
| 13 | KPI targets / baseline | Placeholder targets; UCLA-3 pre/post | 18.4 |
| 14 | MVP scope too large | Re-cut into P0 / P1 / P2 | 19 |
| 15 | Relationship status changes | Rules for switching status | 4.4 |
| 16 | (v3) Inclusion | LGBTQ+, expat, friends-only and accessibility commitments | 3.4, 4.2 |
| 17 | (v3) Expat sign-up | Email OTP in P0 (moved up from P1) | 5.1 |
| 18 | (v3) Matching input | Civic quiz retired; non-political, procedurally generated Vibe quiz | 6.4 |
| 19 | (v3) Matching method | Exchange-stable group clearinghouse; Irving stable roommates for buddies | 8.1, 10.5 |
| 20 | (v3) USP | "The city is the host" | 0 |

## Still Open (needs BMA input)

• Every value marked **[BMA to confirm]**.  
• SMS OTP provider and budget.  
• Which BMA unit owns moderation, and what its staffing hours are.  
• Whether the pilot is limited to particular districts.  
• Who is the DPO of record, and when the DPIA is scheduled.
