# BKK Social \- Mobile Web Product Brief & Developer Requirements

## Draft MVP brief for Bangkok Metropolitan Administration (BMA)

Working concept: A BMA social-connection platform that helps people living in Bangkok meet new people safely through real-world city activities, while giving BMA anonymized insight into how Bangkok's spaces, mobility, safety, cost and services affect social connection.

Core positioning: We are not building Tinder for BMA. We are building a social layer for Bangkok. The product should feel like meeting friends-of-friends through something happening in the city. Romance can happen, but it is not the primary entry point.

MVP platform: Mobile web / PWA. Primary audience: 20-35, but open to all adults 18+ with age-based filters and event eligibility settings.

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

Users who select In a relationship, Married or Prefer not to say may join events and make friend/activity connections, but the romantic 'Open to something more' signal and romantic mutual-connect outcome must be disabled.

## 4.3 Misrepresentation and Safety

• Include a Code of Conduct stating that users must represent their relationship status truthfully if using romantic-intent features.  
• Add a report reason such as 'Misrepresented relationship status / inappropriate romantic behavior'.  
• Repeated or substantiated misuse can lead to warning, suspension or ban.  
• Do not automatically verify marital status against government registries in MVP. That would require separate legal, privacy and policy review.

# 5\. Registration, Verification and Onboarding

## 5.1 Account Creation

• Mobile number \+ OTP should be the default MVP login.  
• Email may be optional.  
• The architecture should allow future integration with ThaiD or another BMA-approved identity verification service.  
• Verification should establish trust without displaying legal identity publicly.

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
• Cost / free.  
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

# 8\. Event Structure and Group Formation

The event format is part of the product. A 100-person event without structure will not solve the social problem.

## 8.1 Small-Group Assignment

• Default target group size: 4-8 people.  
• For a larger event, the system should automatically assign users into tables / teams / circles.  
• Group logic may use interests, social style, age comfort, language and diversity of interests.  
• Do not use political views, religion or other sensitive traits for group formation.  
• Users attending with a friend may request to stay together, but the system should still mix them with new people.

## 8.2 Bring-a-Friend / Friend-of-Friend Feel

• Selected events can allow each user to invite one friend.  
• The invited friend registers through a referral link or event pass.  
• The app should show 'Going alone' or 'Bringing a friend'.  
• The event group algorithm should mix pairs and solo attendees so the atmosphere feels like friends bringing friends rather than a formal blind date.  
• Do not import users' phone contacts in MVP.

# 9\. Onsite Social Features

## 9.1 QR Check-in

• Each event has a unique QR check-in code.  
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

• After the event, show only people from the same event or assigned small group.  
• Only checked-in attendees are eligible.  
• The list should be available for a limited time, e.g. 48-72 hours.  
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

# 13\. BMA / Admin Web Dashboard

## 13.1 Event Management

• Create / edit / cancel event.  
• Set age range, capacity, district, venue, host, cost and tags.  
• Set bring-a-friend rule.  
• Set resident priority / quota.  
• Manage waitlist.  
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

# 19\. Recommended MVP Scope vs Later Phases

## MVP

• Mobile web / PWA.  
• OTP registration.  
• Eligibility and private relationship declaration.  
• Basic verification status.  
• Bangkok current-resident profile.  
• Optional official BKK registered-resident verification status.  
• Fun onboarding.  
• City Pulse.  
• BMA / approved-partner events.  
• Event filters.  
• Bring-a-friend.  
• Small-group assignment.  
• QR check-in.  
• Social signals.  
• Post-event mutual connection.  
• Optional contact exchange.  
• Report / block.  
• Admin dashboard.  
• Aggregated city insights.

## Phase 2 / Later

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

