# Bangkok Type quiz: bank audit

*Quiz chat, 2026-10-15. Covers the 47 hand-written scenarios in `src/vibe/bank/*.ts` (752 answers) as they stood at `72ac406`, and the fixes made in this pass. The plan for growing the bank is in [quiz-blueprint.md](quiz-blueprint.md).*

## Summary

- **47 scenarios, 752 answers**: 35 core, 6 rhythm, 6 plan; 4 twin pairs; all 16 types answer every scenario (47 answers each).
- **Every answer was read** and checked letter by letter, for real-life sense, for the place and its district, and for Thai and English saying the same thing.
- **81 answers fixed in the bank files** (87 edits), plus 2 landmarks and 2 type hangouts moved to the right district, and 4 places marked `verify` in `landmarks.ts`.
- **What the fixes were:** 55 answers did not show one of their letters in words (34 D, 6 F, 8 M, 7 H); 10 answers named a place in the wrong district (Benjasiri Park, Wat Chong Nonsi); 11 did not make sense in real life (wrong time, a place that is closed, seats that do not exist, "new" places that opened years ago, assuming the member is a parent); 4 used the retired word "circle" or Thai "วง"; 5 had grammar problems.
- **Biggest gaps** (for the blueprint): nothing written for newcomers or international members, the launch audience (D6); no funny scenarios; only 3 coworker and 3 meetup core scenarios although meeting new people matters most; a few types lean on one place (the Team Player plays badminton at the Thai-Japanese Sports Centre in 13 of 47 answers).
- **Automatic checks added** to `src/vibe/bank-rules.ts`: letters said in words (D, F), rhythm time and plan wording, contradictions (a D answer that reads as a habit, an F answer that reads as a first), the same place named in both languages, baht amounts in both languages, retired names, Thai glossary spellings, polite particles, prompt punctuation, answer length, and the new `mood`, `months` and `audience` fields. Soft hints for B, C, M, S, N and H print as warnings in `scripts/check-bank.ts`.

## 1. Coverage

### Scenarios by context and kind

| Context | Core | Rhythm | Plan | Total | Session minimum (core) |
|---|---|---|---|---|---|
| friends | 7 | 1 | 1 | 9 | 2 |
| family | 6 | 1 | 1 | 8 | 3 |
| date | 7 | 1 | 1 | 9 | 3 (none for friends-only members) |
| solo | 5 | 1 | 1 | 7 | 1 |
| coworkers | 3 | 0 | 0 | 3 | 1 |
| party | 4 | 1 | 1 | 6 | 2 |
| meetup | 3 | 1 | 1 | 5 | 2 |
| **Total** | **35** | **6** | **6** | **47** | 14 of the 16 core slots |

A session uses 16 core, 2 rhythm and 2 plan scenarios, so it sees 16 of 35 core scenarios (46%) and a third of the rhythm and plan ones. A friends-only member has 28 core scenarios to draw 16 from; after two quizzes they start seeing repeats. Meetup and coworkers have 3 core scenarios each, so the 2 meetup questions a session needs come from a pool of 3.

### Time of day (`tone`, the postcard sky)

evening 17 · morning 11 · afternoon 10 · night 6 · rain 2 · dawn 1

### Mood (new field, tagged in this pass)

`tone` already means the sky, so the kind of moment is a new field, `mood`. Every scenario now has one.

| Mood | Scenarios | Which |
|---|---|---|
| everyday | 30 | saturday, friday, sunday, newfriend, familylunch, grandparent-birthday, kids-day, siblings, chosen-family, firstdate, seconddate, anniversary, budget-date, birthday-host, farewell, good-news, stranger-dinner, team-outing, new-coworker, after-work, longweekend, group-chat, weekday-off, meetup-slot, family-outing-time, meetup-signup, date-plan, family-trip, friends-weekend, party-plan |
| personality | 9 | story, new-group, know-one, cheer-up, best-hours, date-time, friends-time, party-time, free-evening |
| landmark | 4 | visitor, photo, parentsvisit, sunset-date |
| seasonal | 4 | rain and rainy-date (months 5 to 10), toohot (3 to 5), countdown (12) |
| funny | 0 | none |

### Twins (consistency check)

saturday / longweekend, rain / toohot, familylunch / parentsvisit, firstdate / seconddate. Two pairs are used per session. Note that rain / toohot are now tagged seasonal with months; if the generator ever filters by season, a twin pair must stay together or be dropped together.

### Answers per type

Every type has exactly 47 answers (one per scenario). How spread out each type's places are:

| Type | Districts used | Most used district |
|---|---|---|
| BDMN Street Explorer | 18 | huai_khwang 6 |
| BDMH Old-Town Adventurer | 19 | samphanthawong 6 |
| BDSN Scene Seeker | 13 | khlong_san 12 |
| BDSH Food Hunter | 17 | samphanthawong 7 |
| BFMN Team Player | 11 | din_daeng 13 |
| BFMH Festival Regular | 18 | phra_nakhon 11 |
| BFSN Party Host | 16 | watthana 10 |
| BFSH Night-Market Regular | 21 | bang_khen 6 |
| CDMN Quiet Wanderer | 21 | bang_sue 8 |
| CDMH Temple Walker | 20 | bang_bon 6 |
| CDSN Café Curator | 18 | khlong_san 8 |
| CDSH Story Collector | 17 | rat_burana 7 |
| CFMN Steady Mover | 14 | khlong_toei 14 |
| CFMH Park Regular | 19 | nong_khaem 7 |
| CFSN Cosy Creative | 15 | phaya_thai 12 |
| CFSH Neighbourhood Keeper | 22 | bang_khae 7 |

The F types are meant to repeat places ("your usual"), but across the whole bank it reads as a rut: the Team Player is at the Thai-Japanese Sports Centre 13 times, the Steady Mover at Benjakitti or Benjasiri 14 times, the Cosy Creative in Ari 12 times, the Scene Seeker on the Khlong San riverside 12 times.

### Districts

All 50 districts are used (the test needs at least 6 answers each and at most 8% of all answers). The inner city carries the bank; the outer districts sit near the floor.

| Answers | Districts |
|---|---|
| 30 or more | pathum_wan 36, khlong_toei 35, bang_rak 30 |
| 20 to 29 | phaya_thai 28, phra_nakhon 26, samphanthawong 26, chatuchak 26, khlong_san 25, prawet 23, watthana 22, pom_prap 20, thon_buri 20, din_daeng 20, sathon 20, ratchathewi 20 |
| 10 to 19 | huai_khwang 19, bang_kapi 18, bangkok_noi 17, phra_khanong 15, min_buri 15, dusit 14, bangkok_yai 14, bang_sue 13, khan_na_yao 13, bang_khen 11, taling_chan 11, rat_burana 11, bang_phlat 11, chom_thong 11, lat_krabang 10, bang_khun_thian 10, phasi_charoen 10, bueng_kum 10, don_mueang 10, lat_phrao 10, bang_na 10 |
| 7 to 9 | nong_chok 9, bang_kho_laem 9, bang_khae 9, lak_si 9, nong_khaem 8, sai_mai 8, wang_thonglang 8, khlong_sam_wa 8, thung_khru 8, bang_bon 8, yan_nawa 7, suan_luang 7, saphan_sung 7, thawi_watthana 7 |

### Places and ideas used most

| Place or idea | Answers | Types using it |
|---|---|---|
| Ari | 24 | 6 |
| Benjakitti Forest Park | 17 | 4 |
| Suan Luang Rama IX | 15 | 4 |
| Min Buri (old market and canals) | 15 | 7 |
| Thai-Japanese Sports Centre | 14 | 2 |
| Charoenkrung | 14 | 5 |
| True Digital Park | 13 | 4 |
| Talat Phlu | 12 | 4 |
| Khlong Lat Phrao canal paths | 12 | 5 (8 of them say "the new canal-bank paths") |
| Krung Thep Aphiwat Central Terminal | 11 | 3 |
| Wang Lang Market, Nang Loeng | 11 each | 6, 4 |
| run club | 11 | 2 |
| Yaowarat, Charoen Nakhon Road, mocktails | 10 each | |
| Sathon rooftop (unnamed) | 9 | 2 |
| Songkran on Khao San, Loy Krathong, kites | 3 each | all BFMH |

### Inclusion

- Older people: 45 answers bring a grandparent or parents.
- Food for different diets: 9 answers name halal, vegetarian or jay food.
- Money: 7 scenarios mention a price (free, baht, cheap); only budget-date is about cost.
- Little walking: by a rough word count (seat, table, museum, boat, cinema), every scenario but two (visitor, party-time) has at least two answers that need little walking.
- Newcomers and international members: no scenario is written for someone new to Bangkok. Only visitor ("a friend flies in") and farewell ("a friend is moving abroad") touch it, from the local's side.

## 2. The sense pass

Every answer was read against its four letters (WRITING.md), then asked: would a real person in Bangkok do this, at this time, at this place? Is the place real and in that district? Do the Thai and English say the same thing? The check was done by hand first, then repeated with the new automatic letter checks, which found more answers where a letter was only implied.

### Places in the wrong district (fixed)

| Place | Was | Is | Where fixed |
|---|---|---|---|
| Benjasiri Park (Sukhumvit 22 to 24, next to Emporium) | watthana | khlong_toei | 8 answers, `landmarks.ts`, CFMN hangout in `archetypes.ts` |
| Wat Chong Nonsi (Rama III) | yan_nawa | bang_kho_laem | 2 answers, `landmarks.ts`, CDMH hangout in `archetypes.ts` |

### Not fixed: needs a check on the ground or the owner's call

These are marked `verify: true` in `landmarks.ts` where they are landmarks.

| # | Problem | Answers | Proposed fix | Why not fixed now |
|---|---|---|---|---|
| V1 | **Fixed (owner, Q-D2).** Krung Thep Aphiwat Central Terminal moved to `chatuchak` (7 answers); 4 answers rewritten to Bang Sue places (Bang Pho lanes, Gateway at Bangsue, the Rama VII riverside) so Bang Sue keeps 6 | 11 | done | |
| V2 | **Fixed (owner, Q-D2).** Chokchai 4 market moved to `lat_phrao` (2 answers and the BFSH hangout); 6 answers rewritten around Wat Thepleela and its Khlong Saen Saep pier so Wang Thonglang keeps 6. Wat Thepleela and Gateway at Bangsue are marked verify | 8 | done | |
| V3 | Brown Sugar jazz bar is listed as "Chinatown" in Pom Prap; it moved to Phra Sumen Road (Phra Nakhon) years ago and may have moved again | 3 | Confirm where it is now, then fix the district and the "(Chinatown)" label | not sure of today's address |
| V4 | Jodd Fairs Ratchada: the market has moved more than once (Rama 9, then DanNeramit in Chatuchak) | 7 + 2 hangouts | Confirm which Jodd Fairs runs now; switch to Jodd Fairs DanNeramit (`chatuchak`) if Ratchada is gone | not sure it is open |
| V5 | Can you ride a bike on the Benjakitti skywalk and over Rama VIII Bridge? | photo BDMN, longweekend BDMN | Change to walking if not | rules not confirmed |
| V6 | Chula Centenary Park at 9 pm (date-time CFMN) | 1 | Change to 7 pm if the park closes at 8 | opening hours not confirmed |
| V7 | Safari World is mostly a drive-through, so it is weak as a Move answer (family-outing-time BDMN, family-trip BFMN) and as New-scene (kids-day BFSN) | 3 | Swap for a walking day out in the same district, or move Safari World to S answers | judgement call |
| V8 | Two cinema tickets and a popcorn may pass 300 baht (budget-date CFSN) | 1 | "two seats and a shared snack" | prices change |
| V9 | "The new canal-bank paths of Khlong Lat Phrao" (8 answers) opened around 2022; "new" will read stale. Several CDMN answers rely on that word for their D | 8 | Replace with "a stretch of the Khlong Lat Phrao paths you've never walked" | each D answer needs its own rewrite |
| V10 | The Festival Regular (BFMH) repeats Songkran on Khao San (3), Loy Krathong (3) and kites (3) | 9 | In the next batch give BFMH other festivals: Chinese New Year in Yaowarat, the vegetarian festival, the Golden Mount fair, Bangkok Design Week | variety, not an error |
| V11 | One-place ruts (the table above): Thai-Japanese Sports Centre 13 for BFMN, Benjakitti and Benjasiri 14 for CFMN, Ari 12 for CFSN, Khlong San 12 for BDSN | about 50 | Cap any place at 4 answers per type (blueprint rule P5) and rewrite the excess while adding new scenarios | large rewrite; better done with the new batches |

### Every fix made in the bank files

"Before" is the old English. Where the Thai changed too it was rewritten to match the new English. District changes are noted in the After column.

| # | Scenario | Type | Before | After | Why |
|---|---|---|---|---|---|
| 1 | visitor | CDSH | A slow afternoon at Baan Silapin, the Artist House, watching the canal and the puppet show | A slow afternoon at Baan Silapin, the Artist House, a first for you both: the canal and the puppet show | D not shown in words: nothing said it was new to you |
| 2 | visitor | CFMN | Your usual morning jog around Benjasiri Park, the visitor jogging right beside you | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 3 | friday | CDMN | One friend asking you to walk the new Chong Nonsi Canal Park's lit paths after dark | One friend asking you to walk Chong Nonsi Canal Park's lit paths after dark, a stretch you've never done | "New" is stale (park opened 2021) |
| 4 | rain | BDMN | Head out on foot to Pattavikorn Market on Nawamin, a huge second-hand maze, the crowds already back | Head out on foot to Pattavikorn Market on Nawamin, a second-hand maze you've never explored, crowds already back | D not shown in words: nothing said it was new to you |
| 5 | rain | CFMN | Your usual evening jog at Benjasiri Park, now cool and quiet | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 6 | rain | CFSH | Hot jok at your usual stall in the food court at IT Square Lak Si | Hot jok at your usual stall in the old lanes around Wat Lak Si | H: an IT-mall food court is not old Bangkok |
| 7 | story | BFMH | Loy Krathong on the Wat Arun riverside with the usual gang, like every year | Walking the Wat Arun riverside at Loy Krathong with the usual gang, like every year | M not shown: watching, floating or riding a boat is not Move |
| 8 | story | CDMH | A quiet walk with one friend through Hua Takhe old market, wooden shophouses over the canal | A first quiet walk with one friend through Hua Takhe old market, wooden shophouses over the canal | D not shown in words: nothing said it was new to you |
| 9 | story | CDSH | The stories an old coffee shop owner told you in Min Buri's old market | The stories an old coffee shop owner told you on your first visit to Min Buri's old market | D not shown in words: nothing said it was new to you |
| 10 | newfriend | BDMN | A concert at Bangkok Arena, dancing together in a crowd of thousands | A concert at Bangkok Arena by a band neither of you has seen, dancing in a crowd of thousands | D not shown in words: nothing said it was new to you |
| 11 | newfriend | BFSH | Your usual Lat Phrao 101 street-food spot, a big table, friends welcome | Your usual old-school street-food spot on Lat Phrao 101, a big table, friends welcome | H not shown: generic street food |
| 12 | parentsvisit | BDMH | A long-tail boat for the whole family through the Bangkok Noi canals, hopping off to walk a village | A long-tail boat for the whole family through the Bangkok Noi canals, hopping off to walk a village none of you know | D not shown in words: nothing said it was new to you |
| 13 | parentsvisit | CDMH | A gentle walk with your parents around Wat Ratchaorasaram and the old Bang Mot orchards | A gentle first walk with your parents around Wat Ratchaorasaram and the old Bang Mot orchards | D not shown in words: nothing said it was new to you |
| 14 | parentsvisit | CDSH | The Bangkokian Museum with your parents, then sitting in its garden hearing their old Bangkok stories | The Bangkokian Museum with your parents, a first visit for all three, then their old Bangkok stories in its garden | D not shown in words: nothing said it was new to you |
| 15 | grandparent-birthday | CDMN | A flat, easy stroll with your grandparent through Krung Thep Aphiwat station hall, then a café there | A flat, easy stroll with your grandparent through Krung Thep Aphiwat station hall, then a café there neither of you has tried | D not shown in words: nothing said it was new to you |
| 16 | grandparent-birthday | CDSH | The Royal Barges National Museum with your grandparent, a bench, and their own river stories | A first visit to the Royal Barges National Museum with your grandparent, a bench, and their own river stories | D not shown in words: nothing said it was new to you |
| 17 | grandparent-birthday | CFMN | The slow lap of Benjasiri Park's sculpture garden you and your grandparent always do | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 18 | kids-day | BFMH | The family's school-holiday kite day at Sanam Luang, cousins racing to get theirs up first | The family's kite day at Sanam Luang every school holiday, cousins racing to get theirs up first | F not shown in words |
| 19 | kids-day | CDSN | A quiet hour with the kid in a BACC exhibition, then sketching it together over a milkshake | A quiet hour with the kid in a new BACC exhibition, then sketching it together over a milkshake | D not shown in words: nothing said it was new to you |
| 20 | siblings | BDSH | A food crawl down the Lat Phrao 101 strip with all the siblings, ordering dishes none of you know | A food crawl down the Lat Phrao 101 strip with all the siblings, ordering old-school dishes none of you know | H not shown: generic street food |
| 21 | siblings | CDSN | An indie film at House Samyan with one sibling, then a long talk in a café nearby | A new indie film at House Samyan with one sibling, then a long talk in a café nearby | D not shown in words: nothing said it was new to you |
| 22 | chosen-family | BFMH | The crew's yearly Loy Krathong at Santichaiprakarn Park, floating the krathong you made together | The crew's yearly Loy Krathong walk through Santichaiprakarn Park, floating the krathong you made together | M not shown: watching, floating or riding a boat is not Move |
| 23 | chosen-family | CDSH | Sit with your best friend before the old murals of Wat Chong Nonsi, then a slow bowl of noodles | Sit with your best friend before the old murals of Wat Chong Nonsi for the first time, then a slow bowl of noodles *(district yan_nawa → bang_kho_laem)* | Wrong district: Wat Chong Nonsi is in Bang Kho Laem; D not shown in words: nothing said it was new to you |
| 24 | chosen-family | CFSH | Supper with your housemate at the food court at IT Square Lak Si, the same vegetarian stall as always | Supper with your housemate at the same jay vegetarian stall in the old lanes around Wat Lak Si | H: an IT-mall food court is not old Bangkok |
| 25 | firstdate | BFMN | Bring them along to your Thursday run club at Benjakitti Forest Park, then smoothies with the crew | Bring them along to your regular Thursday run club at Benjakitti Forest Park, then smoothies with the crew | F not shown in words |
| 26 | firstdate | CDMH | A slow stroll through Kudi Chin's lanes, just you two, trying its old-style Portuguese cake | A slow stroll through Kudi Chin's lanes, new to you both, trying its old-style Portuguese cake | D not shown in words: nothing said it was new to you |
| 27 | firstdate | CDSH | The little Bangkokian Museum for two, then a long coffee talking about its old family house | The little Bangkokian Museum, a first visit for you both, then a long coffee talking about its old family house | D not shown in words: nothing said it was new to you |
| 28 | seconddate | CDSH | The Royal Barges National Museum for two, then a long chat over a quiet bowl of noodles | The Royal Barges National Museum for two, a first for you both, then a long chat over a quiet bowl of noodles | D not shown in words: nothing said it was new to you |
| 29 | anniversary | BFMH | Float a krathong with the crowd at Santichaiprakarn Park, the way you two did last year | Walk the crowded Santichaiprakarn riverside to float a krathong, the way you two did last year | M not shown: watching, floating or riding a boat is not Move |
| 30 | budget-date | CDSH | The free Royal Thai Air Force Museum, then 40-baht noodles at Talat Mai Don Mueang | A first look round the free Royal Thai Air Force Museum, then 40-baht noodles at Talat Mai Don Mueang | D not shown in words: nothing said it was new to you |
| 31 | budget-date | CFMN | Your regular free yoga session on the lawn at Benjasiri Park, two mats side by side | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 32 | budget-date | CFSH | Your regular 50-baht noodle stall at the food court at IT Square Lak Si, where they know your order | Your regular 50-baht noodle stall in the old lanes around Wat Lak Si, where they know your order | H: an IT-mall food court is not old Bangkok |
| 33 | rainy-date | BDMH | Squeeze onto a crowded Saen Saep canal boat, covers up, riding to a pier neither of you knows | Squeeze onto a crowded Saen Saep canal boat, covers up, then walk the lanes round a pier neither of you knows | M not shown: watching, floating or riding a boat is not Move |
| 34 | sunset-date | CDSH | A first quiet afternoon by the river at Wat Bang Pakok, sharing old-style snacks as the boats pass | A first quiet evening by the river at Wat Bang Pakok, sharing old-style snacks as the boats pass | Sunset prompt, afternoon answer |
| 35 | sunset-date | CFSH | Your usual seats among the orchid farms of Thawi Watthana, sweet coconut as the sun goes down | Sweet coconut at your usual canal-side stall by the Thawi Watthana farms as the sun goes down | Orchid farms have no seats to be a regular at |
| 36 | birthday-host | CFSH | Your parents and your favourite shop by Wang Lang Market, the same order as always | Dinner with your parents at your favourite shop by Wang Lang Market, the same order as always | Not a sentence; evening scenario |
| 37 | countdown | BDSH | Midnight dumplings at a Talat Phlu stall none of you have tried, a big noisy table | Midnight khao tom at a Talat Phlu stall none of you have tried, a big noisy table | Dim sum is a morning meal; khao tom is the midnight classic |
| 38 | farewell | CDMN | Just the two of you riding the new Chong Nonsi Canal Park, a last first-time together | Just the two of you on a first walk through Chong Nonsi Canal Park, a last first-time together | "New" is stale (park opened 2021); you cannot ride the whole park |
| 39 | farewell | CDSH | A quiet afternoon with them at the Bangkokian Museum, then old-style coffee nearby | A quiet afternoon with them at the Bangkokian Museum, new to you both, then old-style coffee nearby | D not shown in words: nothing said it was new to you |
| 40 | stranger-dinner | BFMN | A friendly futsal game near Rajamangala Stadium first, then dinner as a team | Your usual friendly futsal game near Rajamangala Stadium first, then dinner as a team | F not shown in words |
| 41 | stranger-dinner | CDMH | A calm riverside table near Wat Arun, then a slow walk through the old lanes | A calm riverside table near Wat Arun, then a slow walk through old lanes none of you know | D not shown in words: nothing said it was new to you |
| 42 | stranger-dinner | CDSH | A quiet table at an old family shop on Pracha Uthit, the owner telling stories | A quiet table at an old family shop on Pracha Uthit none of you know, the owner telling stories | D not shown in words: nothing said it was new to you |
| 43 | new-group | CFMN | A small Sunday yoga class at the same spot in Benjasiri Park | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 44 | new-group | CFMH | The morning tai chi circle at Lumphini Park, same spot, same small group | The morning tai chi regulars at Lumphini Park, same spot, same few faces | Retired word "circle" (D5) |
| 45 | new-group | CFSN | A small monthly writing circle in the TK Park library at True Digital Park, your regular seat | A small monthly writing group at a True Digital Park café, your regular seat | Retired word "circle" (D5) |
| 46 | know-one | BDSH | A tasting night of old Isan recipes on the Ramkhamhaeng 2 food streets, plates passed around | A tasting night of old Isan recipes you've never tried on the Ramkhamhaeng 2 food streets, plates passed around | D not shown in words: nothing said it was new to you |
| 47 | know-one | BFMN | A pickup football game at the Thai-Japanese Sports Centre, teams mixed on the spot | The weekly pickup football game at the Thai-Japanese Sports Centre, teams mixed on the spot | F not shown in words |
| 48 | know-one | BFMH | Songkran on Khao San Road like every year, your one friend and thousands of strangers | Songkran water fights on Khao San Road like every year, your one friend and thousands of strangers | M not shown: watching, floating or riding a boat is not Move |
| 49 | know-one | CDMH | A small visit to the orchid farms of Thawi Watthana, a handful of people, hands in the soil | A small first visit to the orchid farms of Thawi Watthana, a handful of people, hands in the soil | D not shown in words: nothing said it was new to you |
| 50 | know-one | CDSN | A small design talk at the TCDC library, easy to chat one to one afterwards | A small talk at the TCDC library on a design topic new to you, easy to chat one to one after | D not shown in words: nothing said it was new to you |
| 51 | know-one | CDSH | A small evening talk at the Royal Barges National Museum, then chatting in pairs | A small late-afternoon talk at the Royal Barges National Museum, a first visit, then chatting in pairs | The museum is not open in the evening; D not shown in words |
| 52 | know-one | CFSH | A small dinner at your usual stall in the food court at IT Square Lak Si | A small dinner at your usual curry-and-rice shop in the old lanes around Wat Lak Si | H: an IT-mall food court is not old Bangkok |
| 53 | team-outing | CDSH | A few teammates at the Royal Thai Air Force Museum, then a long lunch nearby | A few teammates on a first visit to the Royal Thai Air Force Museum, then a long lunch nearby | D not shown in words: nothing said it was new to you |
| 54 | after-work | BFMH | The team's Friday sepak takraw circle at Santichaiprakarn Park, then dinner | The team's usual Friday sepak takraw game at Santichaiprakarn Park, then dinner | Retired word "circle" (D5) |
| 55 | cheer-up | BDMH | Gather the crew for a boat ride to Hua Takhe old market, somewhere none of you have been | Gather the crew for a boat ride to Hua Takhe old market and a walk down its wooden lanes, new to all of you | M not shown: watching, floating or riding a boat is not Move |
| 56 | cheer-up | CFMN | Your usual evening walk around Benjasiri Park and its sculptures, just the two of you | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 57 | group-chat | BDMH | A trip out to the seaside mangrove path at Bang Khun Thian, a corner of Bangkok nobody has seen | Everyone walking the seaside mangrove path at Bang Khun Thian, a corner of Bangkok nobody has seen | M not shown: watching, floating or riding a boat is not Move |
| 58 | group-chat | CDMH | Pitch a quiet wander for two through Talat Mai Don Mueang by Khlong Prem Prachakon | Pitch a quiet wander for two through Talat Mai Don Mueang by Khlong Prem Prachakon, new to you both | D not shown in words: nothing said it was new to you |
| 59 | toohot | BDMH | Hop on a shared long-tail along Khlong Phasi Charoen, chatting with whoever sits beside you | Hop off a packed Khlong Phasi Charoen long-tail to walk a canal lane you've never seen, chatting with whoever comes along | M not shown: watching, floating or riding a boat is not Move |
| 60 | weekday-off | BDMH | Join a walking group through the Saen Saep canal communities of Min Buri, chatting with locals | Join a walking group through Min Buri's Saen Saep canal communities, new to you, chatting with locals | D not shown in words: nothing said it was new to you |
| 61 | date-time | BFMN | A 6 am run with your run club at Benjasiri Park, your date joining the crew | A 6 am run with your usual run club at Benjasiri Park, your date joining the crew *(district watthana → khlong_toei)* | Wrong district: Benjasiri Park is in Khlong Toei; F not shown in words |
| 62 | family-outing-time | BDMN | An 8 am trip to Safari World, first through the gate with a whole carful of cousins | Safari World at 9 am opening, first through the gate with a whole carful of cousins | Safari World opens at 9 am, not 8 (verify) |
| 63 | family-outing-time | BFSH | Your usual 9 pm family table at the food court at IT Square Lak Si, aunts and cousins on plastic stools | Your usual 9 pm family table at a khao tom stall by Wat Lak Si, aunts and cousins on plastic stools | H: an IT-mall food court is not old Bangkok |
| 64 | party-time | BFMH | Ramwong with the whole neighbourhood at the Min Buri old-market fair, dancing till 11 pm | Ramwong with the whole neighbourhood at the yearly Min Buri old-market fair, dancing till 11 pm | F not shown in words |
| 65 | meetup-signup | BDMN | Register on Monday for Saturday's group photo walk around Krung Thep Aphiwat terminal, route saved | Register on Monday for Saturday's photo walk with new faces around Krung Thep Aphiwat terminal, route saved | D not shown in words: nothing said it was new to you |
| 66 | meetup-signup | BDSN | Grab tonight's last-minute seat at a strangers' dinner on a Sathon rooftop never tried | Grab tonight's last-minute seat at a strangers' dinner on a Sathon rooftop you've never tried | Grammar |
| 67 | meetup-signup | CDMN | Sign up a week early for a four-person sketch-and-stroll meetup at Benjakitti Forest Park | Sign up a week early for a sketch-and-stroll meetup at Benjakitti Forest Park, you and three new faces | D not shown in words: nothing said it was new to you |
| 68 | meetup-signup | CDMH | Join a same-day ride for three along the Thawi Watthana canal farms, decided an hour before | Join a same-day ride for three on a Thawi Watthana canal-farm route you've never done, decided an hour before | D not shown in words: nothing said it was new to you |
| 69 | meetup-signup | CDSH | Book a small tea-and-talk at the Bangkokian Museum two weeks ahead, a first visit for everyone | (English same; Thai fixed) | Thai: "วง" (retired with circle) |
| 70 | meetup-signup | CFMN | Say yes to whichever one-on-one jog pops up at Suan Luang Rama IX, the park run every week anyway | Say yes to whichever one-on-one jog pops up at Suan Luang Rama IX, a park you run in every week anyway | Grammar |
| 71 | date-plan | BFMH | Message that morning: come along on the weekend walk through Thewet flower market the friends always do | Message that morning: come along on the weekend Thewet flower market walk your friends always do | Grammar |
| 72 | date-plan | BFSN | Say 'come now' and meet at the usual table at Jodd Fairs Ratchada where the friends already are | Say 'come now' and meet at the usual table at Jodd Fairs Ratchada where your friends already are | Grammar |
| 73 | date-plan | CDMH | Plan a quiet walk for two weeks ahead to the murals of Wat Chong Nonsi, opening hours checked | Plan a quiet walk for two weeks ahead to the murals of Wat Chong Nonsi, new to you both, opening hours checked *(district yan_nawa → bang_kho_laem)* | Wrong district: Wat Chong Nonsi is in Bang Kho Laem; D not shown in words: nothing said it was new to you |
| 74 | date-plan | CDSN | Book two seats a week ahead for an indie film at House Samyan, dinner spot already picked | Book two seats a week ahead for a new indie film at House Samyan, dinner spot already picked | D not shown in words: nothing said it was new to you |
| 75 | date-plan | CFMN | Ping 'walk?' an hour before and do the usual Benjasiri Park loop together | (same; district watthana → khlong_toei) | Wrong district: Benjasiri Park is in Khlong Toei |
| 76 | family-trip | BFSN | Reserve the family's regular big booth at Seacon Square a week ahead, cinema seats booked too | Reserve the family's usual big table at a Seacon Square restaurant a week ahead, cinema seats booked too | "Booth" is unclear in English and Thai |
| 77 | family-trip | CDMN | Book tickets early for a hands-on science expo at BITEC, just one parent and a kid | Book tickets early for a new hands-on science expo at BITEC, just you and one young cousin | Assumes the member is a parent (launch audience is 23 to 32) |
| 78 | family-trip | CDSN | Book a quiet slot ahead for BACC's new exhibition and its café, just a parent and a kid | Book a quiet slot ahead for BACC's new exhibition and its café, just you and one young cousin | Assumes the member is a parent (launch audience is 23 to 32) |
| 79 | family-trip | CFMN | Book the usual weekend bike rental slot at Suan Luang Rama IX for one parent and one kid | Book the usual weekend bike rental slot at Suan Luang Rama IX for you and one young cousin | Assumes the member is a parent (launch audience is 23 to 32) |
| 80 | friends-weekend | CDSH | Plan a quiet lunch with one friend at an old Pratunam market shop, researched and booked | Plan a quiet lunch with one friend at an old Pratunam market shop neither of you knows, researched and booked | D not shown in words: nothing said it was new to you |
| 81 | party-plan | BDMN | Reserve courts a month ahead at Bangkok Arena for a birthday futsal tournament, twenty invites sent | Reserve courts a month ahead at Bangkok Arena for a first-ever birthday futsal tournament, twenty invites sent | D not shown in words: nothing said it was new to you |

### Copy rules this pass checked and found clean

- No em or en dashes, gendered words, alcohol, political or religious-practice words (the existing checks).
- Every place named in English is named in Thai too (the new place check passed on all 752 answers).
- Every baht amount is the same in both languages.
- No Thai glossary misspellings (เดท, แชท, เช็คอิน and the rest) and no polite particles.
- "Dating mode" and "Made with the BMA" do not appear.
