# Jurrgun films: revision brief

> **Superseded in part (owner, 2026-10-15 18:30; see `design/reference/project-state.md`):**
> - **BMA line:** "Made with the BMA" (G2) is out. Use "แอปอิสระ มีกรุงเทพมหานครเป็นเจ้าภาพและผู้กำกับดูแล / An independent app, hosted and overseen by the BMA" on every film, 02 included.
> - **People:** the illustrated cast (G12) is out. Use real app screens with demo profiles, led by Fern as a real profile, labelled "ข้อมูลตัวอย่าง · Demo profiles".
> - **Film 02:** goes on BMA channels.
> - **Names:** Circle → Regular Table (โต๊ะประจำ), leader → Table Host (เจ้าภาพโต๊ะ).
> - **Copy:** grammatical, no run-on sentences, simple, not corporate, emotional.
> - **Who:** the re-render chat finishes all five films.

*2026-10-15. The changes to make to the five films, ready to hand to whoever re-renders them (sources in `~/jurgun-films`, one `tools/build.py` per film, shared parts in `lib/kit.py`). The reasoning is in `design/reference/film-review.md`; this file is just the to-do. **Status: waiting for the owner's approval.***

## Owner decisions (2026-10-15)

| Topic | Decision |
|---|---|
| Tagline | Use the brand tagline: **กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ / Small groups. Real Bangkok places. See you there.** "Jurrgun: more fun, one fan (แฟน)" is retired |
| URL | Keep **jurrgun.apps.sv-academy.org** on every end card. `jurrgun.ktm` isn't bought yet |
| Dating | **It stays, and it's important.** Film 02 stays as the feature demo, and the opt-in can appear in the other films as one feature among several |
| Dating's name | **"Open to something more" / "เปิดใจมากกว่าเพื่อน"** (💘), the name the app already uses. "Dating mode" / "โหมดเดท" is gone from every frame |
| People on screen | **Show a person**, even before there are real users: a named, clearly fictional cast (see "The cast") |

---

## 1. Changes for all five films

| # | Change | Where |
|---|---|---|
| G1 | **New end card**: the mark, then `Jurrgun เจอกัน`, then "say jer-gun", then the tagline in TH and EN, then the endorsement line, then `jurrgun.apps.sv-academy.org`. Remove "Jurrgun: more fun, one fan (แฟน)" and "Made with SV Motion" | `lib/kit.py` `endcard()` |
| G2 | **Endorsement line**: 🏛️ ร่วมกับกรุงเทพมหานคร · Made with the Bangkok Metropolitan Administration. Mark it "draft" until the BMA approves the wording. Leave it **off** film 02's end card (keep the BMA away from the romance feature) | `endcard(made=…)` |
| G3 | **Mark colour** `#16a34a` becomes `#137f45` | `*/assets/brand/mark-close.svg` |
| G4 | **Type**: Sao Chingcha for headings, Anuphan for everything else. Remove Inter, IBM Plex Sans Thai and TH Sarabun New (`fonts/inter.woff2`, `plex-thai-*`, `sarabun-*`) | `lib/kit.py` font stack |
| G5 | **Thai first**: the Thai line is the big headline, the English line goes under it, smaller. Today films 02 to 05 do it the other way round | every build |
| G6 | **Colours**: green `#137f45`, cream `#fff9f0`, mango `#ffb443`, coral `#ff7a5c`. Swap the rose accent (`ROSE`, `#b8305f`, `#e0507f`) for coral | `lib/kit.py`, film 02 |
| G7 | **Rename** every "Dating mode" / "โหมดเดท" to "💘 เปิดใจมากกว่าเพื่อน / Open to something more" | films 02, 04, 05 |
| G8 | **Fresh screens**: re-capture `screens/` from today's build in Thai UI with the prototype banner hidden. The current landing screen still shows the old hero, "เจอเพื่อนใหม่ ในเมืองที่คุณรัก" | `~/jurgun-films/screens` |
| G9 | **Legibility**: nothing under 36 px on 1080p, a dark scrim behind white text on dusk and dawn skies, no small grey third lines | all |
| G10 | **Audio**: normalise to -14 LUFS, true peak -1 dB. Film 01 peaks at 0.0 dB today | render step |
| G11 | **No dashes** in on-screen copy, em or en. Write "4 ถึง 6" / "4 to 6", not "4–6", in sentences | all copy |
| G12 | **The cast** appears in every film (next section) | all |

---

## 2. The cast (people on screen, no real users needed)

There are no real members yet, so the films use a small **fictional cast**, named and consistent across all five films. The demo chats already use Fern, Jay, Nam and Pim; give them faces.

| Character | Who | Bangkok Type | Status | Appears in |
|---|---|---|---|---|
| **Fern** (เฟิร์น), 27 | Moved from Chiang Mai for a design job in Ari. Knows nobody outside work | quiz result, e.g. "Market Wanderer" | **Single**, switches on Open to something more in film 02 | the lead in 01, 02, 04, 05 |
| **Jay** (เจ), 29 | Born in Thonburi, friends moved away | his own type | Single | 02 (Fern's buddy), 03 (circle head) |
| **Nam** (น้ำ), 31 | Nurse, shift work, wants weekend friends | | in a relationship (friends only) | 03 |
| **Pim** (พิม), 24 | New grad from Khon Kaen | | friends only | 03, 04 |
| **Ken**, 34 | Japanese long-stayer, takes the English table | | friends only | 01, 03 |

**How to show them (do the first now, the others later):**
1. **Now: an illustrated cast** in the films' drawn style, paper-collage figures over real UI (product-film Route D). There's no consent or likeness risk, it matches the drawn skyline, and Fern can be shown alone at her desk, then at a table, then laughing with the circle.
2. **Before public launch: real people acting it out.** Friends, team members or hired talent, with signed model releases, at a real table in a real place.
3. **Avoid** photoreal AI faces and stock photos presented as members.

**Honesty rule:** every film with the cast carries a small label, "ตัวละครสมมติ · Illustrated characters" (or "นักแสดง · Actors" for footage). Chats are demo data. Never imply these are real users or real numbers.

**Why a single person leads:** Fern on her own at the start (eating alone, scrolling) is the problem in one shot. By the end she's at a table of five. That arc is the brand promise. In film 02 the same single Fern shows how the opt-in works.

---

## 3. Film by film

### Film 01: Bangkok Together (for BMA executives), 2:32 to about 2:00

| Time now | Change |
|---|---|
| 0:00 to 0:08 | Keep the "กรุงเทพมหานคร" reflection title. Redraw the skyline with a recognisable Wat Arun prang, Mahanakhon and the Rama VIII bridge; drop the generic spire |
| 0:08 to 0:30 | Merge the three city cards into two, bigger: "50 เขต 50 เรื่องราว / Fifty districts. Fifty stories." and "คนจากทุกจังหวัดและทั่วโลก มาเริ่มต้นที่นี่ / People from every province and every country start here." |
| 0:30 to 0:51 | Keep the three "need" lines. **New shot: Fern alone** eating at a food court, phone in hand, behind "เมืองที่มีคนเป็นล้าน แต่หลายคนยังกินข้าวคนเดียว". WHO source line at 36 px or larger |
| 0:51 to 1:00 | Keep "แอปที่ไม่ได้จบแค่บนจอ / An app that ends with a real hello." Add a scrim. New landing screen (tagline and endorsement) |
| 1:00 to 1:12 | Four audience cards: keep the first three. Rewrite the fourth: **"💘 คนโสด / Singles: เปิดใจมากกว่าเพื่อน เฉพาะเมื่อเลือกตรงกัน / Open to something more, only when you both choose it."** Each card shows a cast face (Pim, Ken, Jay, Fern) |
| 1:22 to 1:31 | Change the table line to "โต๊ะละ 4 ถึง 6 คน ที่สาธารณะ มีโฮสต์ดูแล / Four to six people. Public places. A host looks after you." (The "Daytime" default isn't true, and the screen shows an 18:00 night crawl) |
| new, about 5 s | **Bangkok Type quiz** beat: "คุณเป็นคนกรุงเทพฯ แบบไหน? 16 ไทป์ / Which Bangkok are you? 16 types." with Fern's result screen |
| 1:59 to 2:15 | City Pulse row: "City Pulse: ภาพรวมไม่ระบุตัวตน ส่งให้กรุงเทพมหานคร / Anonymous totals, from 10 or more people, go to the BMA." Add a row: "นำร่อง 3 ถึง 5 เขต / Pilot in 3 to 5 districts." |
| 2:15 to 2:25 | Keep "เมืองแห่งเทวดา ไม่ควรมีใครต้องเหงา / In the City of Angels, no one should be alone." over **Fern at a table of five**. Drop "กรุงเทพฯ เจอกัน · Bangkok, together" (a third competing line) |
| 2:25 to 2:32 | G1 end card with the endorsement |
| Whole film | Cut each card from 7 to 9 s down to about 6 s. Optional: a founder voice-over version (Thai, 60 to 90 words) for meeting rooms |

### Film 02: Open to something more (feature demo), 2:03 to about 1:45

The job: show how the opt-in works, step by step, with friendship always first. For owned channels (YouTube, the landing page "how it works", in-app, partner pitches such as CMB and Tinder). Not for BMA channels, and not as the lead paid ad.

| Time now | Change |
|---|---|
| Title | Rename the film "เปิดใจมากกว่าเพื่อน / Open to something more" (file `jurrgun-02-open-to-more.mp4`) |
| 0:00 to 0:19 | Keep the apps cloud, then "เราไม่ได้ขาดแชต เราขาดเหตุผลที่จะได้เจอกัน / We don't need another chat. We need a reason to meet.", then "เจอกันก่อน แล้วค่อยเป็นค่อยไป / Meet first. Let it grow slowly." Thai large (G5). Coral instead of rose (G6) |
| **new, about 8 s** | **The switch.** Fern, single, opens Me and taps the quick switch. On screen: "💘 เปิดใจมากกว่าเพื่อน" with "เฉพาะคนโสด · เป็นความลับ · จะรู้ก็ต่อเมื่อเลือกตรงกัน / Single members only. Private. You only find out when you both chose it." Then "ปิดเมื่อไหร่ ข้อมูลเดทลบหมด / Switch it off and every dating detail is deleted." (all true, `routes/settings.tsx`) |
| **new, about 6 s** | **Dating prompts**: show 2 of the 16 Bangkok dating prompts on Fern's profile, with "เห็นได้เฉพาะคนที่เปิดใจเหมือนกัน / Only members who are also open to more can see them." |
| 0:19 to 0:29 | "Three ways to meet someone" becomes "**ทุกอย่างเริ่มจากเพื่อน / It all starts as friends**" with two ways: a Bangkok Buddy, and a 💘 open-to-more event (dating-partner events and singles socials, tag `open_to_more`). Drop the circle card: circles are friend groups and friends-only members are in them |
| 0:29 to 0:37 | Remove the deck screen ("Flick through people", keen or pass); it reads as swiping. Use the buddy proposal card. Caption: "บัดดี้ที่เข้ากัน เลือกจากไทป์ ไม่ใช่รูป / A buddy who fits, picked by type, not photos." |
| 0:29 to 1:39 (chat) | Keep the six-week thread and its rules (no handles before meeting, 25 messages each, phones down, the mutual reveal, swapping LINE, graduation). Pill in the header: "💘 เปิดใจมากกว่าเพื่อน", not "Dating mode". **Write the chat in Thai** with English subtitles. Swap the "circle picnic" stage for a **buddy quest 2** or an open-to-more event. The rail labels in Thai, larger |
| 1:11 | Reveal line: "💘 คุณทั้งคู่เลือก ‘เปิดใจมากกว่าเพื่อน’ / You both chose 'open to something more'". Caption: "ไม่มีใครรู้จนกว่าจะเลือกตรงกัน / Nobody knows until you both choose it." |
| 1:39 to 1:47 | Cut "Six months later… From a match, to someone you love." Replace it with graduation: "🎓 ไปต่อกันเองได้แล้ว ยินดีด้วย / You two don't need us anymore. Congrats!" then "LINE, IG หรือแอปไหนก็ได้ ตามสะดวก / LINE, IG, any app. Your call." |
| 1:47 to 1:53 | Keep the safety beat (helplines, home-safe check, a shareable date plan) |
| 1:53 to 1:57 | "ช้า ๆ แต่ชัวร์ / Slow burn. Real spark." can stay, in coral |
| End | G1 end card **without** the endorsement line |
| Label | "ตัวละครสมมติ · บทสนทนาตัวอย่าง / Illustrated characters · demo chat" |

### Film 03: Circles, 1:52 to about 1:30

| Time now | Change |
|---|---|
| 0:05 to 0:10 | Cut "This is how one circle found each other". Open straight on "ทุกวง เริ่มจากโต๊ะเดียว / Every circle starts with one table." |
| 0:10 to 0:19 | Show the cast at the table (Fern, Jay, Nam, Pim, Ken and one more). "หกคน โต๊ะเดียว จัดที่นั่งตามสิ่งที่ชอบ / Six strangers. One table. Seated by what they love." |
| Whole film | The ten-step rail is unreadable: show only the current step, large, in Thai. Cut each step from 9 s to 7 s; the invite and the poll can share a beat |
| 1:22 to 1:31 | Remove "Gone when the chat is cleared" (no such feature). Use "รูปอยู่ในวงเท่านั้น / Members only. The photos stay in the circle." Show the cast in the illustrated photos |
| 1:40 | Keep "จากคนแปลกหน้า สู่แก๊งวันอาทิตย์ / Strangers at one table. Now, a Sunday crew." |
| End | G1 end card |

### Film 04: Reel 9:16, 1:00 to about 0:50 (plus a 15 s cut)

| Time now | Change |
|---|---|
| 0:00 to 0:06 | Keep the quiz hook, Thai large: "มีเพื่อนใหม่ครั้งล่าสุดเมื่อไหร่?" ก "สัปดาห์นี้ 🙌" / ข "ปีนี้ 🤔" / ค "จำไม่ได้แล้ว 😅". Fern picks ค |
| 0:06 to 0:15 | Keep "กรุงเทพฯ ไม่เท!" for TikTok and IG. **Make a second version without the pun for BMA channels** (it covers the พ in the city's name) |
| 0:15 to 0:18 | Name card with the mark in `#137f45` and "say jer-gun" |
| 0:18 to 0:38 | Keep the five beats, Thai first. Replace "Your circle votes together" with the **quiz result** ("คุณเป็นคนกรุงเทพฯ แบบไหน? / Which Bangkok are you?") |
| 0:38 to 0:44 | Keep one beat for the opt-in: "💘 เปิดใจมากกว่าเพื่อน ถ้าคุณเลือก / Open to something more, if you choose it." with the mutual-reveal line in the chat. Coral, not pink |
| 0:44 to 0:56 | **Cut** "Maybe leave with a แฟน", "More fun, one fan" and "เจอกัน แล้วเจอแฟน": it's the retired tagline. Replace it with Fern at the table: "มาคนเดียว กลับมาพร้อมแก๊ง / Come alone. Leave with a crew." |
| 0:56 to 1:00 | G1 end card plus "แท็กเพื่อนที่จะชวนไป 👇 / Tag who you're bringing" |
| Extra | A 15 s cut: the hook, three beats, the end card |

### Film 05: Promo 30 s

| Time now | Change |
|---|---|
| 0:00 to 0:05 | Keep "กรุงเทพฯ ไม่เคยหลับ / แล้วทำไมเรายังเหงา?". Add Fern alone, lit by her phone, behind the second line |
| 0:09 to 0:14 | Scrim behind the white text; new plan screen without the prototype banner |
| 0:14 to 0:19 | "โต๊ะเล็ก บัดดี้ วงเพื่อน และเดตแบบช้า ๆ / … Dating, slowly." becomes **"โต๊ะเล็ก บัดดี้ วงเพื่อน และเปิดใจมากกว่าเพื่อน ถ้าคุณเลือก / Small tables. A buddy. Circles. Something more, if you choose."** Add the quiz-result screen to the grid |
| 0:19 to 0:23 | Keep "ไปให้ถึง / เจอกัน / แล้วเจอกันอีก, Show up. Meet. Come back." with the cast on each card |
| 0:23 to 0:26 | Give the closing line 3 s so it can be read |
| 0:26 to 0:30 | G1 end card (one tagline only; drop the extra "เจอกันนะ · See you there") |
| Extra | Export 16:9, 1:1 and 9:16, plus a 6 s bumper |

---

## 4. Where each film goes

| Film | Channels |
|---|---|
| 01 | BMA executives, district champions, partner pitches |
| 02 | YouTube, the landing page "how it works", in-app after the switch, dating-partner pitches. Not on BMA channels |
| 03 | IG, TikTok and LINE VOOM in three 20 s chapters, YouTube in full |
| 04 | TikTok and IG (pun version); BMA channels (plain version) |
| 05 | YouTube pre-roll, event screens, LINE OA (1:1), BMA channels |

## 5. Approval checklist

- [ ] Owner approves this brief
- [ ] The BMA approves the endorsement wording (until then, the end card says "draft")
- [ ] Cast style approved (illustrated now, actors later)
- [ ] Re-render all five with G1 to G12, then review the new contact sheets against this file
- [ ] Before public posting: no "Dating mode", no "one fan", no prototype banner, no Inter, no `#16a34a` left in any frame
