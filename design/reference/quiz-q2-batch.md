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
- `scripts/check-bank.ts` lists the `verify` places; `Answer.verify` marks them in the bank.

## Places to verify (57 answers)

Written from memory. Each is marked `verify: true` in the bank; please confirm it's open and in that district.

| Place | District key | Scenarios |
|---|---|---|
| Jodd Fairs Ratchada (open till late or midnight) | din_daeng | eh-sunday-reset, er-odd-hour-hunger, jg-met-again, jg-after-table |
| Brown Sugar jazz (address, open till midnight) | pom_prap | er-friend-of-friend, jg-after-table |
| Warehouse 30 (clay workshop, indie film night, openings) | bang_rak | eh-grandparent-afternoon, er-routine-friend, jg-weekly-picks |
| Wat Thepleela and the Saen Saep canal path (walkable) | bang_kapi | er-routine-friend, jg-coworker-table, le-east-side ×2 |
| Chao Phraya Bodindecha house museum (open to walk-ins) | wang_thonglang | lc-museum-family, le-east-side, se-office-year-end |
| Science Centre for Education / planetarium, Ekkamai (open after renovation; district) | watthana / khlong_toei | eh-teen-cousin, lc-museum-family, le-young-cousins |
| Chao Phraya Sky Park (free, open; district key) | khlong_san / phra_nakhon | ev-month-end, jg-icebreaker |
| Central Rama 2 | bang_khun_thian | ev-storm-stranded, lc-thonburi-day |
| Central EastVille | lat_phrao | le-local-mall, se-december-lights |
| Nong Bon Water Sports Centre / Nong Bon Park (public paddling; Loy Krathong) | prawet | jg-plus-one, se-loy-krathong |
| Bangkok Arena (public badminton and futsal courts) | nong_chok | eh-neighbour, jg-plus-one |
| Fashion Island pop-up classes | khan_na_yao | jg-join-regular |
| Seacon Square board game café | prawet | jg-join-regular |
| Paradise Park mall | prawet | eh-grandparent-afternoon |
| Terminal 21 Rama 3 | bang_kho_laem | eh-teen-cousin |
| IT Square Lak Si café | lak_si | lc-study-spot |
| Esplanade Ratchada bowling | din_daeng | le-local-mall |
| Lumpinee Stadium, Ram Inthra | bang_khen | le-pickup-sport |
| Liab Duan Ram Inthra night market (open at 11 pm) | bang_khen | ev-deadline-week |
| Pattavikorn Market, Nawamin | bueng_kum | ev-new-job-area |
| Wat Nimmanoradee canal-side houses | bang_khae | ev-errand-saturday |
| Wongsakorn Market at midnight | sai_mai | lc-market-hours |
| Baan Kudichin Museum | thon_buri | lc-museum-family |
| Rama III riverside jogging path | yan_nawa | le-down-river |
| Escape room in Ratchada | huai_khwang | jg-icebreaker |
| A Huai Khwang café open at 11 pm | huai_khwang | eh-sunday-reset |
| Soi Nana street art, Chinatown | pom_prap | jg-table-poll |
| Thawi Watthana orchid farm taking groups; canal orchards for mangoes | thawi_watthana | jg-table-host, se-mango-season |
| Chom Thong canal orchards | chom_thong | se-mango-season |
| Thonburirom Park; Seri Thai Park (Loy Krathong) | thung_khru; bueng_kum | se-loy-krathong |
| Saranrom Park 6 am tai chi | phra_nakhon | se-cool-season |
| A Chokchai 4 café open till midnight | lat_phrao | se-cool-season |
| Jay stalls round Wongwian 22 Karakadakhom; a Suk Sawat jay café; an old Sai Mai jay shop | pom_prap; rat_burana; sai_mai | se-jay-festival |
| Saphan Sung garden café | saphan_sung | se-kite-season |
| W District café | watthana | se-mango-season |

`npx vite-node scripts/check-bank.ts src/vibe/bank/<file>.ts <EXPORT>` prints the exact answers.
