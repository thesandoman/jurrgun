# Quiz Q2: 100 new Bangkok scenarios

*Quiz Q2 chat, 2026-10-15. Written to the blueprint (quiz-blueprint.md), the shared writing rule (D23, quiz-review.md) and the widened bank check (D24). For the Branding chat and the owner.*

## What's in it

101 scenarios in seven new bank files (1,616 answers): 87 core, 8 rhythm, 6 plan. One is in the 💘 open-to-more set and one in the table-host set, so everyone sees 99.

| File | Scenarios | What |
|---|---|---|
| `everyday-commute.ts` | 14 | the commute, rain, haze, payday, a new job, a quiet long weekend |
| `everyday-home.ts` | 13 | moving flats, a new neighbourhood, hosting visitors and family |
| `everyday-rut.ts` | 13 | sick of your usual places, breaking routines, reconnecting |
| `landmarks-city.ts` | 15 | the river, canals, views, museums, old town and new scene |
| `landmarks-edge.ts` | 15 | the outer districts: west, south coast, far east, north |
| `seasonal.ts` | 15 | Songkran, Loy Krathong, rainy and cool season, Lunar New Year, jay week, kites, mangoes, 11.11, December, the year-end party |
| `jurrgun.ts` | 16 | first Table, newcomer and language Tables, Regular Tables, Table Hosts, hosting a proposal, Bangkok Buddy quests and stamps, People I Met, +1, the weekly plan |

- **Context:** friends 29, solo 23, meetup 21, family 14, coworkers 9, party 4, date 1 (💘 set only).
- **Mood:** everyday 62, seasonal 18 (all with `months`), landmark 15, personality 6.
- **Audience:** 2 for newcomers and international members, 1 for locals; the rest for everyone.
- **Writing:** 6 to 12 words (average 11.3). Letters are shown through a detail; across the batch only 17 answers use usual/regular/never/new. No romance outside the 💘 set (a Valentine's idea became "14 February with friends"). Places from place-verification.md use the corrected districts; Doc Club and the Khlong Phasi Charoen boat aren't used.
- **Jurrgun's offerings** were checked against the code (src/domain/buddy.ts, hosting.ts, plan.ts, chat.ts, rules.ts; routes/newcomers.tsx) before they were described.

## Also changed

- `bank-rules.ts`: a few more detail cues for D (hidden, untried, unfamiliar, found, a tip, swore by, first try/taste/visit…) and F (by heart, for ages, since school, the aunties, your crew/court/order, every Thursday…).
- `generator.ts`: twin pairs out of season go last, like every other scenario. With a bigger bank, the seasonal twin "rain" was otherwise shown as often outside its months as in them (test/quiz-sets.test.ts caught it).
- `scripts/check-bank.ts` lists any `verify` places; `Answer.verify` marks them in the bank.

## Places checked (all 57 flagged answers)

Every answer that was marked `verify` has now been checked. Commit 6a768c1 fixed 12 (Science Centre, Wat Nimmanoradee, Sena Nikhom café, Warehouse 30, Wongsakorn, Wat Thepleela, the Rama III walkway, orchards, Bangkok Arena futsal, Soi Nana, Seacon, jay lanes). The other 45 were checked on the web on 2026-10-15, and no `verify` marks are left in these seven files.

**Confirmed and kept:** Brown Sugar (18 Soi Nana, Pom Prap, live music to about 1 am, closed Mondays); Baan Kudichin Museum; Lumpinee Stadium, Ram Inthra (Bang Khen); Esplanade Ratchada bowling (Din Daeng); Central Rama 2 (Bang Khun Thian); Liab Duan Ram Inthra night market (Bang Khen, 17:00 to 02:00); Terminal 21 Rama 3 (Bang Kho Laem); Paradise Park (Prawet); Central EastVille (Lat Phrao); Seri Thai Park (on BMA's 2025 Loy Krathong list); Saranrom Park (opens 05:00, morning tai chi); Nong Bon Water Sports Centre (public paddling with a cheap yearly membership); Chokchai 4 is in Lat Phrao.

**Fixed or replaced:**

| Was | Now | Why |
|---|---|---|
| Chao Phraya Sky Park keyed Khlong San | `phra_nakhon` | the park's address is Phra Pok Klao Rd, Phra Nakhon |
| "Jodd Fairs" | Jodd Fairs Ratchada | the Rama 9 one closed in Jan 2025; Ratchada (Din Daeng) runs 17:00 to 01:00 |
| a Huai Khwang café at 11 pm | Samyan Mitrtown's 24-hour zone | no café open that late found in Huai Khwang |
| badminton at Bangkok Arena (×2) | Nong Chok Park's courts | the arena is a futsal venue with no public court booking; the park's youth centre has badminton courts |
| Wat Nimmanoradee canal-side houses | its quiet, fading canal market | only a few of the old houses still trade; no walking route found |
| the longest food queue at Pattavikorn | weekend crowds there | no source for food queues |
| Bodindecha house museum (×3) | Suan Pakkad's teak houses; the Khlong Thap Chang canal by Wat Lat Bua Khao; the Bangkokian Museum | the museum is inside a school, weekdays only, call first |
| a café at IT Square Lak Si | its food court | no café confirmed open |
| Fashion Island pop-up classes | its pop-up events | events confirmed, classes not |
| an escape room in Ratchada | Puzzle Room, Sukhumvit 18 (Khlong Toei) | none found in Ratchada |
| a Warehouse 30 exhibition opening | a Warehouse 30 exhibition | exhibitions confirmed, recent openings not |
| boat noodles by Wat Thepleela | noodles by Wat Thepleela pier | noodle shops on Ramkhamhaeng 39, no boat noodles |
| Ekkamai planetarium | Children's Discovery Museum II (Thung Khru) | the planetarium closed 30 Mar 2026 for renovation, due back late 2026 |
| Nong Bon Park's lit lake (Loy Krathong) | Suan Wanatham on Loy Krathong night | Nong Bon isn't on BMA's 2025 Loy Krathong park list; Suan Wanatham (Prawet) is |
| bread for the fish at Thonburirom | a slow lakeside lap | BMA asks people not to bring bread krathong or feed; the park is on the Loy Krathong list |
| a Chokchai 4 café open till midnight | a 9 pm latte there | the café closes at 22:00 |
| a Suk Sawat vegan café | Broccoli Revolution (Sukhumvit 49) | no vegan café confirmed on Suk Sawat |
| an old jay shop in Sai Mai | a jay stall on Song Wat Road | no established jay shop confirmed; Chinatown is the festival's centre |
| a named Saphan Sung garden café | a leafy café off Ramkhamhaeng 118 | several exist there, none confirmed open in 2026 by name |
| a W District café | an EmQuartier café | no café confirmed inside W District |
| EastVille's December lights | EastVille's year-end garden decorations | the mall runs a year-end campaign; lights not confirmed |

Main sources: Time Out Bangkok (Brown Sugar, Sky Park, Loy Krathong parks 22 Oct 2025, planetarium 13 Mar 2026), Thai Holiday Guide (Bodindecha, Kudichin, Lumpinee, Saranrom), Wikipedia (Central Rama 2, Pattavikorn, Bangkok Arena, Nong Chok Park, Paradise Park, Wat Nimmanoradee), TrueID (Liab Duan), Major Cineplex investor pages (Esplanade bowling), Central Pattana (EastVille), The Smart Local (Nong Bon), Wongnai (Chokchai 4, Ramkhamhaeng 39).
