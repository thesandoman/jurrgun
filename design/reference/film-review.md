# Jurrgun films: strategist's review and revision plan

*2026-10-15. A read-and-report review of the five marketing films, checked against the brand and product as pushed to `main` today. Skills applied: brand-launch (frame), brand-voice, brand-messaging, brand-positioning, target-audience, competitor-branding, ugc-strategy, influencer-marketing, product-film (true-claims and current-UI rules).*

## What was reviewed

| Film | File | Length | Aspect | Audio |
|---|---|---|---|---|
| 01 Bangkok Together | `jurrgun-01-bangkok-together.mp4` | 2:32 | 16:9, 1920×1080, letterboxed | Generated music bed, no voice-over. Peaks hit 0.0 dB (clipping risk) |
| 02 Dating | `jurrgun-02-dating.mp4` | 2:03 | 16:9 | Music bed only |
| 03 Circles | `jurrgun-03-circles.mp4` | 1:52 | 16:9 | Music bed only |
| 04 Reel | `jurrgun-04-reel-9x16.mp4` | 1:00 | 9:16, 1080×1920 | Music bed only |
| 05 Promo | `jurrgun-05-promo.mp4` | 0:30 | 16:9, letterboxed | Music bed only |

**Version note.** The owner's "latest edition" (`exports/jurrgun-films-part1/2/3.zip`) is byte-identical (same MD5) to `exports/jurrgun-films.zip`: renders from 17:14 to 17:31. The older unpacked folder `exports/jurrgun-films/` (16:51) is an earlier cut set in Inter. The film sources live in `~/jurgun-films/` (HyperFrames, `tools/build.py` per film plus `lib/kit.py`). The source already has the new tagline on the end card and the "Quiz" session was re-rendering film 01 at 17:42. So some fixes below may already be in progress there. **This review judges the rendered films the owner holds now**, and quotes the source where it explains a problem.

Method: one frame every 2.5 s (2 s for the reel) as contact sheets, full-size stills at key beats, the build scripts for exact copy and timings, a loudness check, and a grep of `src/` for every product claim.

---

## Summary

| Film | Verdict | Biggest problem | Best asset to keep |
|---|---|---|---|
| **01 Bangkok Together** (BMA executives) | **Revise** (high value) | Ends on the old tagline "Jurrgun: more fun, one fan (แฟน)". That's a dating pun in the film made for the Governor's team. No endorsement line, and "Singles" is one of four audience cards | The city-first argument: 50 districts, the WHO fact, "แอปที่ไม่ได้จบแค่บนจอ", "What Bangkok gets" |
| **02 Dating** | **Cut as a launch film.** Rework later as an in-app explainer for the opt-in | A whole film that leads with dating, in rose pink, under the label "Dating mode", which no longer exists. It ends "From a match, to someone you love" | The slow-burn idea, the chat craft, the safety beat, "เจอกันก่อน แล้วค่อยเป็นค่อยไป" |
| **03 Circles** | **Keep, light revision** | English-led type, the old end card, one false claim ("photos gone when the chat is cleared") | The best product story of the five: strangers to a Sunday crew, all real features |
| **04 Reel 9:16** | **Revise heavily** (cut the last 16 s) | 44 to 60 s is all romance: "Maybe leave with a แฟน 💘", "More fun, one fan", "เจอกัน แล้วเจอแฟน". It's the film most likely to be clipped and quoted | The quiz hook, the ไม่เท pun, five fast real-screen beats |
| **05 Promo 30 s** | **Revise** | The feature line names "Dating, slowly", and the end card carries the old tagline | The cold open ("กรุงเทพฯ ไม่เคยหลับ / แล้วทำไมเรายังเหงา?"), the Show up / Meet / Come back triad |

### Issues that run through all five

1. **Old end card everywhere.** "Jurrgun: more fun, one fan (แฟน)" in coral, `jurrgun.apps.sv-academy.org`, "Made with SV Motion". There's no current tagline, no BMA endorsement and no planned `jurrgun.ktm`. One fix in `lib/kit.py` `endcard()` repairs all five.
2. **The mark is the old green.** `assets/brand/mark-close.svg` fills `#16a34a`. Since today the brand uses `#137f45` (`src/ui/brand.tsx`). It's visible on every end card and title.
3. **The type is not today's system.** Film 01 sets Thai headings in Sao Chingcha but the English and small print look like IBM Plex Sans and the light Thai body like Sarabun. Films 02 to 05 run English headlines in an Inter-style heavy grotesque. Today's rule is Sao Chingcha for headings and Anuphan for everything else, with no Inter, IBM Plex or TH Sarabun New. The `fonts/` folders still ship `inter.woff2`, `plex-thai-*` and `sarabun-*`.
4. **English first, Thai second.** In films 02 to 05 the big line is English and the Thai is a small coloured kicker above it. The brand is Thai-first bilingual. Swap the hierarchy: Thai big, English under it.
5. **The screens are out of date.** The landing screen in films 01 and 05 shows the old hero "เจอเพื่อนใหม่ ในเมืองที่คุณรัก". Today it's the tagline plus "🏛️ ร่วมกับกรุงเทพมหานคร". Most product screens carry the orange prototype banner ("เวอร์ชันทดลอง อย่าใส่ข้อมูลจริง"). That's fine for an internal BMA viewing but not for public ads. None of the screens show the Bangkok Type quiz, the passport, City Pulse or the endorsement.
6. **No people.** Every frame is drawn skyline, UI or text. For a brand whose whole promise is "a real table with real people", the films never show a human face, a table or a laugh. That's the biggest creative gap, and pilot footage and UGC fix it (see the launch plan).
7. **Pacing.** The 16:9 films hold each card for 7 to 9 s with little change, often 3 to 4 identical frames in a row on the contact sheets. Fine for a boardroom, slow for social. Small grey third lines (about 30 px on 1080p) are unreadable on a phone.

---

## Brand truth used as the yardstick

- **Positioning:** independent, human-first, run by the founder, made with the BMA as main client and endorser. Not a dating app, not a government service (`design/reference/brand-positioning.md`).
- **Tagline:** TH "กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ" / EN "Small groups. Real Bangkok places. See you there."
- **Endorsement** (wording pending BMA approval): "ร่วมกับกรุงเทพมหานคร" / "Made with the Bangkok Metropolitan Administration".
- **Name and URL:** Jurrgun (double r), say "jer-gun", planned `jurrgun.ktm`. The app runs at `jurrgun.apps.sv-academy.org` until then.
- **Colour:** green `#137f45`, cream `#fff9f0`, mango `#ffb443`, coral `#ff7a5c`. No rose or pink accent.
- **Type:** Sao Chingcha headings, Anuphan for everything else.
- **Voice:** warm, plain, playful, never cringe. Thai-first. No em or en dashes. Short sentences.
- **Romance:** only through the opt-in "Open to something more" / "เปิดใจมากกว่าเพื่อน" (Single members only, revealed only when both choose it). Never the front door. Red flag to avoid: "taxpayer-funded dating app".

### Product claims checked against `src/`

| Claim in a film | Status | Source |
|---|---|---|
| Two picks a week, from your profile, no feed | ✅ True | `schema.ts` weekly plan, `domain/plan.ts` |
| Tables of 4 to 6 | ✅ True | landing tile, seating |
| "Daytime. Public places." as a default for tables | ⚠️ Half true. "Daytime" is an event tag, not a default, and the film shows it over an 18:00 Yaowarat night food crawl | `lib/constants.ts` tags |
| Thai or English tables | ✅ Seating uses languages | `routes/onboarding.tsx` |
| One buddy, weekly quest, passport stamp, 50 districts | ✅ True. Rounds are daily, with at most one new buddy a week | `domain/buddy.ts`, `docs/BANGKOK-BUDDY.md` |
| "Dating mode" | ❌ Retired name. Now "Open to something more" / "เปิดใจมากกว่าเพื่อน" | `routes/settings.tsx`, `lib/constants.ts` |
| Deck "Flick through people" (film 02 screen) | ✅ Exists (15 a day, no photos, a preference only), but a keen/pass card UI on screen reads as swiping | `routes/buddy.tsx` deck |
| Before you meet: no links or handles, 25 messages each | ✅ True | `domain/chat.ts`, `routes/chat.tsx` |
| Mutual "open to something more" reveal, never one-sided | ✅ True | `ui/profile-card.tsx`, `routes/buddy.tsx` |
| Graduation: "You two don't need us anymore" | ✅ True | `schema.ts` `social_graduations` |
| Circle head request checked by a real person | ✅ True | `social_circle_head_requests`, admin review |
| Circle chat photos and polls | ✅ True (circle chats only) | `schema.ts` chat kinds |
| Circle photos "gone when the chat is cleared" | ❌ No chat clearing or photo expiry exists | `routes/chat.tsx`, `services/retention.ts` |
| Phones down at check-in, three things to talk about | ✅ True | `routes/events.tsx` "Phone down, people up" |
| City Pulse: totals only, 10 or more people | ✅ True, but the film omits that totals go to the BMA, which is now in the product copy | `routes/public.tsx`, `onboarding.tsx` |
| Safety: Thai helplines, home-safe check, shareable date plan | ✅ True | `content/learn.ts`, `schema.ts` home-safe |
| WHO Commission on Social Connection, 2023 | ✅ Real (launched November 2023) | public record |
| Bangkok Type quiz, 16 types | Exists but never shown (only a "16" tile) | `routes/quiz.tsx` |

---

## Film 01: Bangkok Together (2:32, for BMA executives)

**Job:** win the BMA executives (and later district offices). It's the film the endorsement rests on. **Verdict: revise. It's worth the most effort of the five.**

### What works
- The argument flows well: the city, then the need, then the answer, who it's for, how it works and what Bangkok gets. That's the right order for a civic audience.
- Thai lines are natural and short: "50 เขต 50 เรื่องราว", "เมืองที่มีคนเป็นล้าน แต่หลายคนยังกินข้าวคนเดียว", "ความเหงา ทำร้ายเราได้จริง", "แอปส่วนใหญ่ทำให้เราเลื่อนจอ ไม่ได้ทำให้เราเจอกัน", "แอปที่ไม่ได้จบแค่บนจอ".
- One sourced fact (WHO 2023) and no invented numbers.
- "What Bangkok gets" is exactly what an executive wants: parks, all 50 districts, safe by default, City Pulse, real meetups over screen time.

### What's wrong
| Time | Issue | Type |
|---|---|---|
| 0:00 to 0:08 | The skyline's tallest tower is a generic supertall spire that reads more as Dubai than Bangkok. The "prang" is a plain triangle | Visual accuracy |
| 0:08 to 0:30 | Glass cards sit on the left third with small type. The grey third line ("To study. To work. To start again.") is unreadable | Legibility |
| 0:37 | The WHO source line is about 30 px grey on black | Legibility |
| 0:51 to 1:00 | White "Jurrgun" and Thai line over a peach dusk sky: low contrast, the wordmark almost disappears. The phone shows the **old landing hero** and the prototype banner | Legibility, outdated UI |
| 1:00 to 1:12 | One of four audience cards is **"คนโสด / Singles: Friends first. Slow and mutual."** with 💘. To a BMA audience, a quarter of the target market reads as dating | **Risky** |
| 1:22 to 1:31 | "Four to six people. **Daytime.** Public places." over an 18:00 night food crawl screen | Inaccurate |
| 1:59 to 2:15 | "City Pulse ไม่ระบุตัวตน / Totals only, from 10 or more people. Never names." It doesn't say the totals go to the BMA, which is the whole point for this audience | Missed proof |
| 2:15 to 2:25 | "เมืองแห่งเทวดา ไม่ควรมีใครต้องเหงา" then "กรุงเทพฯ เจอกัน · Bangkok, together." That's a third line competing with the tagline | Messaging |
| 2:25 to 2:32 | **End card: "Jurrgun: more fun, one fan (แฟน)"**, the sv-academy URL, "Made with SV Motion", the old green mark, no endorsement | **Off-brand and risky** |
| Whole film | Never says who runs Jurrgun. No BMA endorsement, no founder, no pilot ask | Positioning |
| Whole film | Pacing: each card holds 7 to 9 s. 2:32 is long for executives watching on a phone in LINE | Pacing |

### Scene-by-scene fix (target 1:45 to 2:00)
1. **Open (0:00 to 0:07).** Keep the water-reflection "กรุงเทพมหานคร" title. Redraw the skyline with a recognisable Wat Arun prang, Mahanakhon and the Rama VIII bridge instead of the generic spire.
2. **The city (0:07 to 0:25).** Merge u1 to u3 into two cards and make the type bigger:
   - TH "50 เขต 50 เรื่องราว / คนจากทุกจังหวัดและทั่วโลก มาเริ่มต้นที่นี่"
   - EN "Fifty districts. People from every province and every country start here."
3. **The need (0:25 to 0:45).** Keep n1 to n3. Set the WHO source at 36 px or larger at 80% white.
4. **The answer (0:45 to 0:55).** Keep "แอปที่ไม่ได้จบแค่บนจอ / An app that ends with a real hello." Put a dark scrim behind the type, or move this beat to the night plate. Re-capture the landing screen from today's build (tagline plus endorsement) with the prototype banner hidden.
5. **Who it's for (0:55 to 1:05).** Replace the "Singles" card with **"เพิ่งเรียนจบ / New grads: Friends moved away. Start again here."** Or use LGBTQ+ ("พื้นที่ปลอดภัยของทุกคน / A safe table for everyone"), which the strategy pack names. Romance stays out of this film.
6. **How it works (1:05 to 1:40).** Keep the plan, table, buddy and circle beats at about 7 s each. Fix the table line:
   - TH "โต๊ะละ 4 ถึง 6 คน ที่สาธารณะ มีโฮสต์ดูแล"
   - EN "Four to six people. Public places. A host who looks after you."
   Add one new 5 s beat for the **Bangkok Type quiz** (16 types). It's the most shareable thing in the product and executives haven't seen it.
7. **What Bangkok gets (1:40 to 1:52).** Change the City Pulse row:
   - TH "City Pulse: ภาพรวมไม่ระบุตัวตน ส่งให้กรุงเทพมหานคร"
   - EN "City Pulse: anonymous totals, from 10 or more people, go to the BMA."
   Add a pilot line: TH "นำร่อง 3 ถึง 5 เขต" / EN "Pilot: 3 to 5 districts."
8. **Close (1:52 to 2:00).** Keep "เมืองแห่งเทวดา ไม่ควรมีใครต้องเหงา / In the City of Angels, no one should be alone." Drop "Bangkok, together".
9. **End card (new standard, all films):**
   - Mark in `#137f45`
   - Jurrgun เจอกัน (say "jer-gun")
   - กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ
   - Small groups. Real Bangkok places. See you there.
   - 🏛️ ร่วมกับกรุงเทพมหานคร · Made with the Bangkok Metropolitan Administration
   - jurrgun.ktm (or the live URL until the domain is live)
   - Drop "Made with SV Motion" from client-facing cuts, or move it to the description.
10. **Audio.** Normalise to -14 LUFS with -1 dB true peak. The current peak hits 0.0 dB. For a presentation version, add a Thai voice-over by the founder (60 to 90 words) so it plays well in a meeting room without anyone reading.

---

## Film 02: Dating (2:03)

**Verdict: don't use it in the launch. Re-cut later as a 45 to 60 s in-app explainer for people who have already switched on "Open to something more".**

### Why
- A whole film that leads with dating breaks the first "refuse" in the positioning ("not a dating app; dating partners plug in as a lane you opt into, never as the front door"). It hands a journalist the "taxpayer-funded dating app" headline.
- **Rose and pink accent** (`#b8305f`, `#e0507f`) instead of the brand palette. The "💘 Dating mode" pill is in every frame of the 70 s chat scene, and the product no longer uses that name.
- "Three ways to meet someone": Dating mode, a Bangkok Buddy, a circle hangout. That frames buddy and circles as dating routes. Friends-only members would be right to feel uneasy, and it contradicts "friends-only members never see it".
- The deck screen ("Flick through people", keen/pass) under the caption "Matched" reads as swiping on screen, whatever the rules behind it.
- "Six months later… From a match, to someone you love." is a promise of love: overclaim, and the wrong success metric.
- It's English-only in the chat and the big lines. Thai appears only as small pink kickers.

### What to keep for the later explainer
- The structure: meet first, buddy quests, a group hangout, a mutual reveal, then hand over to LINE. It shows real rules: no handles before meeting, a 25-message cap, mutual-only reveal, graduation.
- Lines: "เราไม่ได้ขาดแชต เราขาดเหตุผลที่จะได้เจอกัน / We don't need another chat. We need a reason to meet." and "เจอกันก่อน แล้วค่อยเป็นค่อยไป / Meet first. Let it grow slowly." Both also work as friendship lines and could move to film 05 or 04.
- The safety beat (helplines, home-safe check, date plan).

### If re-cut as the opt-in explainer (in-app only, never paid or BMA channels)
1. Rename every instance: "💘 เปิดใจมากกว่าเพื่อน / Open to something more". Use green and coral. Drop the rose.
2. Open from the Me screen's quick switch: TH "เปิดได้เฉพาะคนโสด เป็นความลับ จะรู้ก็ต่อเมื่อเลือกตรงกัน" / EN "Single members only. Private. You only find out when you both chose it."
3. Remove the "three ways" scene. Show one path: a buddy who is also open to more, after finished quests.
4. Replace the deck shot with the buddy card or quest screen.
5. Write the chat in Thai with English subtitles (Fern and Jay can stay).
6. End on the mutual reveal and graduation, not "six months later":
   - TH "ไม่มีใครรู้จนกว่าจะเลือกตรงกัน"
   - EN "Nobody knows until you both choose it."
7. End card as standard, without the endorsement line. The BMA should not be attached to the romance lane.

---

## Film 03: Circles (1:52)

**Verdict: keep with light revisions. It's the clearest, most accurate product story and the best fit for the friends-first brand.**

### What works
- One story, told with real features in order: a table of strangers, private mutual picks, a circle head (with human review), a private hangout, the invite, the group chat with the head badge, a poll, phones-down day, photos and the next meetup.
- Lines: "ทุกวง เริ่มจากโต๊ะเดียว / Every circle starts with one table." and "จากคนแปลกหน้า สู่แก๊งวันอาทิตย์ / Strangers at one table. Now, a Sunday crew."
- Real Bangkok places: Yaowarat, Benjakitti Park, Lumphini, Chatuchak, Ari.

### Fixes
| Time | Fix |
|---|---|
| Whole film | Make the Thai line the headline (Sao Chingcha) and the English the subline (Anuphan). Today it's the reverse, in an Inter-style face |
| Whole film | The left "rail" of ten steps sits at about 20 px and is unreadable. Show only the current step large, or drop the rail |
| 0:00 to 0:10 | Cut o2 ("This is how one circle found each other"). Open straight on "ทุกวง เริ่มจากโต๊ะเดียว". Saves 5 s |
| 0:10 to 0:19 | Add the table size: TH "หกคน โต๊ะเดียว จัดที่นั่งตามสิ่งที่ชอบ" / EN "Six strangers, one table, seated by what they love." (Keep "not by photos": it's a good contrast.) |
| 1:22 to 1:31 | **Remove** "Gone when the chat is cleared". No such feature exists. Replace with TH "รูปอยู่ในวงเท่านั้น สมาชิกเห็นกันเอง" / EN "Members only. The photos stay in the circle." |
| 1:22 | The "photos from the day" are drawn illustrations. Replace them with two real (consented) pilot photos as soon as the first circle meets |
| 1:40 to 1:52 | Standard end card |
| Screens | Re-capture in Thai UI (the film shows English UI screens) with the prototype banner hidden |
| Length | Target 1:30. Cut each step from 9 s to 7 s; the poll and the invite can share one beat |

---

## Film 04: Reel 9:16 (1:00)

**Job:** the shareable top-of-funnel piece for TikTok, Reels and LINE VOOM. **Verdict: revise heavily. The first 44 s are good; the last 16 s must go.**

### What works
- 0:00 to 0:06 hook: "มีเพื่อนใหม่ครั้งล่าสุดเมื่อไหร่? / When did you last make a new friend?" with A/B/C answers. It's interactive, relatable and stops the scroll.
- 0:06 to 0:15: the "กรุงเทพฯ ไม่เท!" pun (เท = to ditch someone) is clever and very Thai.
- 0:18 to 0:38: five fast real-screen beats with confetti on "Tap. You're in."

### What's wrong
| Time | Issue | Type |
|---|---|---|
| 0:38 to 0:44 | "ช้า ๆ แต่ชัวร์ / Slow burn. Real spark." in pink, with a chat that ends on "You both chose 'open to something more' 💘" and "Want to swap LINE?" | Leads with romance |
| 0:44 to 0:56 | "Come for the fun. / Maybe leave with a **แฟน** 💘 / (fan = partner, in Thai) / More fun, one fan. / **เจอกัน แล้วเจอแฟน**" with floating hearts | **Off-brand, the old tagline, the riskiest 12 s of all five films** |
| 0:56 to 1:00 | End card with the old tagline. The CTA "แท็กเพื่อนที่จะชวนไป 👇 Tag a friend" is good but shares the screen with it | Outdated |
| 0:06 to 0:15 | The pun covers the พ of the city's name with a stamp. Great on TikTok, but don't post this version on BMA channels: defacing the capital's name sits badly next to its endorsement | Channel risk |
| Whole reel | English is the big line in every beat; the reel's audience is Thai | Thai-first |
| Whole reel | No captions burned in for sound-off viewing (the text carries it, but there's no spoken hook) | Format |

### Rewrite (0:00 to 0:45, about 45 s)
1. **0:00 to 0:05, hook.** Keep the quiz question, Thai large:
   - "มีเพื่อนใหม่ครั้งล่าสุดเมื่อไหร่?"
   - ก "สัปดาห์นี้ 🙌" / ข "ปีนี้ 🤔" / ค "จำไม่ได้แล้ว 😅"
   Small EN under it.
2. **0:05 to 0:12, the pun.** Keep "กรุงเทพฯ ไม่เท!" with EN "In the City of Angels, nobody gets ditched." Make a second, plain version for BMA channels that skips the pun and opens on the quiz.
3. **0:12 to 0:15, the name.** Mark in `#137f45`. "Jurrgun เจอกัน · say jer-gun · แล้วเจอกันนะ".
4. **0:15 to 0:35, five beats (4 s each), Thai first:**
   - "แผนสัปดาห์นี้ เลือกให้แล้ว / 2 picks a week. Zero scrolling."
   - "แตะเดียว ได้ที่แล้ว / Tap. You're in."
   - **New:** "คุณเป็นคนกรุงเทพฯ แบบไหน? 16 ไทป์ / Which Bangkok are you? 16 types." (quiz result screen)
   - "บัดดี้หนึ่งคน ห้าสิบเขต / One buddy. 50 districts." (with the passport)
   - "รูปจากวันนี้ อยู่ในวงเท่านั้น / Photos stay in the circle."
5. **0:35 to 0:40, payoff (replaces the romance section), friendship only:**
   - "มาคนเดียว กลับมาพร้อมแก๊ง / Come alone. Leave with a crew."
6. **0:40 to 0:45, end card and CTA:**
   - "กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ"
   - "แท็กเพื่อนที่จะชวนไป 👇 / Tag who you're bringing"
   - URL
   - Endorsement line only on the BMA-channel version.

Make a 15 s cut too (hook, three beats, end card) for paid placements.

---

## Film 05: Promo 30 s (16:9)

**Job:** pre-roll on YouTube, event screens, the landing page header. **Verdict: revise. The structure is strong; two lines and the end card are wrong.**

### What works
- Cold open on black: "กรุงเทพฯ ไม่เคยหลับ / Bangkok never sleeps." then "แล้วทำไมเรายังเหงา? / So why do we still feel alone?" A strong hook.
- The water-reflection "เจอกัน" title, then "แอปที่ไม่ได้จบแค่บนจอ".
- The triad "ไปให้ถึง / เจอกัน / แล้วเจอกันอีก, Show up. Meet. Come back." is simple and memorable, and it maps onto the product's real loop.

### Fixes
| Time | Fix |
|---|---|
| 0:09 to 0:14 | Low contrast white on dusk (same as film 01). Add a scrim. Re-capture the plan screen without the prototype banner |
| 0:14 to 0:19 | Change "โต๊ะเล็ก บัดดี้ วงเพื่อน และเดตแบบช้า ๆ / Small tables. A buddy. Circles. Dating, slowly." to TH **"โต๊ะเล็ก บัดดี้ วงเพื่อน ทั้ง 50 เขต"** / EN **"Small tables. A buddy. Circles. All 50 districts."** Swap the `profile.jpg` tile (the romance profile) for the quiz result |
| 0:23 to 0:26 | The closing line blurs in and out too fast to read (about 2 s). Give it 3 s or cut it and let the triad lead into the end card |
| 0:26 to 0:30 | Standard end card. Today's has the old tagline plus "เจอกันนะ · See you there" (two lines saying the same thing) |
| Variants | Export 16:9, 1:1 and 9:16, and a 6 s bumper: cold open line, then logo and tagline |

---

## Launch plan

### Launch type and audience
- **A soft, phased launch** tied to the pilot (3 to 5 BMA events, 100 to 300 users, 3 to 5 districts; `bkk-social-prd-v3.md` §P0). Cold start is the top risk (R6), so the films should fill specific tables, not build broad awareness.
- **First pilot audience (pick one, speak to it directly):** people **new to Bangkok, aged 22 to 32**: from the provinces (first job, uni) and long-stay foreigners. Secondary: **new grads whose circle shrank** after university. Both have the clearest pain ("I don't know anyone here") and are least served by dating apps. LGBTQ+ friendly tables are a strong third lane for Pride.
- **Narrative:** "Bangkok has millions of people and too many of us eat alone. Jurrgun gets you to a real table: small groups, real places, made with the city."
- **Goal for the pilot window:** fill every pilot table (RSVP fill of 60% or more), registration to first RSVP of 40% or more, and 50 or more pieces of UGC from pilot attendees.

### Which film goes where

| Phase | Channel | Asset | Hook and CTA |
|---|---|---|---|
| **0. Internal (now)** | BMA executive meeting, Governor's office, district champions | **Film 01 revised** (2:00, plus a founder VO version) | CTA: "Approve the pilot in 3 to 5 districts" |
| **0. Internal** | Partner and venue pitches (hosts, cafés, CMB/Tinder partner lane) | Film 01 shortened to 60 s, plus film 03 | CTA: "Host a table" |
| **1. Pre-launch (2 to 3 weeks out)** | Jurrgun IG and TikTok, founder's personal accounts | Reel 04 (pun version), quiz-result share cards ("ฉันเป็นคนกรุงเทพฯ แบบ…") | Hook: "มีเพื่อนใหม่ครั้งล่าสุดเมื่อไหร่?" CTA: "ทำควิซ รู้ไทป์ของคุณ" (take the quiz). The quiz is the waitlist |
| **1. Pre-launch** | LINE OA (rich message), LINE VOOM | Promo 05 at 1:1, reel 04 | CTA: "จองที่โต๊ะแรก" (book your first table) |
| **2. Launch week** | BMA channels: Facebook page, LINE OA, district pages, VisitBangkok | Promo 05 (endorsed end card) and reel 04 **plain version, no pun** | Endorsement on screen. CTA: the first pilot events by district |
| **2. Launch week** | YouTube pre-roll and event screens (festivals, BTS/MRT screens if available) | Promo 05, 6 s bumper | CTA: QR to the event list |
| **3. Weeks 2 to 6** | IG, TikTok, LINE VOOM | Film 03 cut into three 20 s chapters, pilot UGC, creator-hosted tables | CTA: "มาคนเดียวก็ได้" (come on your own) |
| **3. Weeks 2 to 6** | YouTube (owned), landing page | Film 03 full, film 01 public cut (without the pilot ask) | Evergreen explainer |
| **Later, in-app only** | Me screen, after switching on "Open to something more" | Film 02 re-cut as the opt-in explainer | Never on paid or BMA channels |

### Hooks to test (first 2 seconds)
1. "มีเพื่อนใหม่ครั้งล่าสุดเมื่อไหร่?" (When did you last make a new friend?)
2. "กรุงเทพฯ ไม่เคยหลับ แล้วทำไมเรายังเหงา?" (Bangkok never sleeps. So why do we still feel alone?)
3. "กรุงเทพฯ ไม่เท!" (In the City of Angels, nobody gets ditched.)
4. "คุณเป็นคนกรุงเทพฯ แบบไหน?" (Which Bangkok are you?) with the quiz result
5. "ย้ายมากรุงเทพฯ แล้วยังไม่มีเพื่อน?" (Moved to Bangkok and don't know anyone yet?) for the newcomer segment

### CTAs (one per placement)
- Quiz: "ทำควิซ 2 นาที รู้ไทป์กรุงเทพฯ ของคุณ / Take the 2-minute quiz"
- Table: "จองที่โต๊ะแรก / Book your first table"
- Social: "แท็กเพื่อนที่จะชวนไป / Tag who you're bringing"
- BMA and partners: "เปิดโต๊ะในเขตของคุณ / Host a table in your district"

### Competitor lens (how the films should differ)
- **Timeleft** owns curated stranger dinners with polished city lifestyle imagery. Jurrgun should look more local and less premium: street food, parks, real Bangkok light.
- **Bumble BFF and the dating apps** own profile and photo browsing. Never show card stacks, swiping gestures or photo grids, even when the feature is harmless.
- **LINE OpenChat and Facebook groups** own "free but random". Jurrgun's proof is the host, the small table and the mutual-only rule. Show a host greeting a table.
- **Nobody** in the category says "made with the city" or shows a whole city as the venue. That's the white space; the endorsement and the 50-district passport should be visible in public cuts.

---

## Assets and skills still needed

1. **Pilot footage (Route A in product-film).** One shoot day at the first 2 or 3 pilot tables: a host welcome, hands on a table, laughter, phones going down, the group leaving together. Consent forms, no faces of people who decline. This turns every film from a slideshow into a human story.
2. **UGC system (ugc-strategy).** Design share moments into the product: the quiz result card, the passport stamp, "I made it to my first table", the circle's monthly photo (consented). Add a branded hashtag, for example **#เจอกันที่กรุงเทพฯ**, and a reshare permission flow.
3. **Creator briefs (influencer-marketing).** Five to ten **nano and micro creators (1k to 50k)** who are themselves newcomers: provincial grads, expat long-stayers, a Pride community voice. Format: "I went to a table of strangers alone". They host or attend a real table and post their honest take. Brief must-haves: friends-first, never "dating app", the tagline in the caption, disclosure (#ad / #ร่วมกับJurrgun), no BMA logo unless approved.
4. **Brand kit (brand-guidelines).** A one-page film kit: end card spec, colour tokens, type pair, the endorsement lockup and its approval status, Thai-first caption rules, banned words ("dating app", "แฟน" in marketing, "swipe"), and the list of approved claims from the table above. It stops the next film from drifting.
5. **Fix in the film source** (for whoever re-renders, likely the "Quiz" session): `lib/kit.py` `endcard()` (tagline, endorsement, URL, drop "Made with SV Motion"), `assets/brand/mark-close.svg` fill to `#137f45`, the font stack (Anuphan for every non-heading role, remove `inter`, `plex-thai-*` and `sarabun-*`), re-captured `screens/` from today's build with the prototype banner hidden, and `ROSE` replaced by coral.
6. **BMA sign-off** on the endorsement wording before any public cut carries it. Until then, BMA-facing internal cuts can carry it marked "draft".
7. **Measurement (brand-measurement):** track quiz completions by film, UTM per placement, RSVP fill by district, and UGC count.

---

## Prioritised revision list

| # | Change | Films | Effort | Why now |
|---|---|---|---|---|
| 1 | **Replace the end card**: today's tagline (TH and EN), the endorsement line, the URL, the mark in `#137f45`, drop "Made with SV Motion" | All | S (one function) | The old "one fan (แฟน)" tagline is on every film, including the BMA one |
| 2 | **Remove romance from every public film**: cut reel 0:38 to 0:56, change the promo's "Dating, slowly", replace film 01's Singles card | 01, 04, 05 | S to M | The biggest reputational risk ("taxpayer-funded dating app") |
| 3 | **Pull film 02 from the launch**; re-cut later as the in-app "Open to something more" explainer with the current name and palette | 02 | M (later) | Off-brand as a launch film; uses a retired feature name |
| 4 | **Fix false and outdated claims**: "Daytime" default, "photos gone when the chat is cleared", City Pulse goes to the BMA, re-capture screens with today's landing and no prototype banner | 01, 03, 05 | M | True-claims rule; BMA executives will check |
| 5 | **Thai-first type in the BMA system**: Thai headline in Sao Chingcha, English subline in Anuphan, no Inter, IBM Plex or Sarabun, minimum 36 px on 1080p | All | M | Brand consistency, phone legibility |
| 6 | **Add the endorsement and the "who runs it" line to film 01**, plus the pilot ask and a founder VO version | 01 | M | Positioning decided today; it's the film that earns the endorsement |
| 7 | **Show the Bangkok Type quiz** (16 types) in films 01, 04 and 05 and use it as the main CTA | 01, 04, 05 | S | The most shareable feature and the natural waitlist |
| 8 | **Tighten pacing**: film 01 to about 2:00, film 03 to about 1:30, reel to 45 s plus a 15 s cut, promo bumper at 6 s | All | M | Social attention spans |
| 9 | **Legibility and visuals**: scrims on dusk plates, a recognisable Bangkok skyline, kill unreadable small grey lines and rails | 01, 03, 05 | S | Several key lines can't be read today |
| 10 | **Shoot pilot footage and start UGC and creator programmes**, then cut a people-first version of film 05 and the reel | New | L | The films show no people; the brand promise is people |
| 11 | **Audio**: normalise to -14 LUFS, true peak -1 dB (film 01 clips at 0.0 dB) | All | S | Technical polish |
| 12 | **Channel variants**: plain (no pun) reel for BMA channels; 1:1 promo for LINE | 04, 05 | S | The pun is right for TikTok, wrong next to the endorsement |
