# Place verification (2026-10-15)

Read-only check of every real Bangkok place the app names. I looked at name, district (เขต) and whether each place is still open. Sources:
`src/vibe/landmarks.ts`, `src/vibe/archetypes.ts` (spots and hangouts), `src/vibe/bank/*.ts` (867 district-keyed answers, about 200 distinct named places), `src/lib/constants.ts` (DISTRICTS, VISITBANGKOK_ROUTES), `src/content/learn.ts` (helplines, transport), `src/content/profile.ts` / `dating.ts` (neighbourhood names only), `scripts/seed*.ts`, and the `verify` items in `quiz-audit.md` / `quiz-blueprint.md`. I also read the new bank files in two worktrees: `amazing-bhabha-870efa` (WIP Q2 draft) and `funny-lamarr-5f6056`. `src/vibe/seasons.ts` does not exist.

Method: I web-searched every place that was flagged `verify`, sat near a district border, or might have closed or moved, preferring the venue's own address, Thai Wikipedia, Time Out, BMA and news from the last 12 months. For well-known places with an obvious district (Lumphini Park, ICONSIAM, Wat Arun and the like), I checked them against known geography and did not search each one. The OK list says which places were sourced.

## Summary

| | Count |
|---|---|
| Distinct places reviewed | ~200 (plus 9 helplines and the transport facts) |
| Verified OK | ~180 (about 45 sourced in this run, the rest accepted on well-known geography) |
| **Fix needed, main** | **5** (3 wrong districts, 1 service suspended, 1 probable wrong district) |
| **Fix needed, worktrees only** | **11** groups of answers (wrong or stale district keys) |
| Closed, moved or suspended | 4 (Khlong Phasi Charoen boat suspended; Doc Club & Pub moved; Jodd Fairs Rama 9 moved to Ratchada; Brown Sugar moved, already correct in the app) |
| Could not verify | 5 |
| Optional wording updates | 3 |

## Fixes needed, main branch

| # | File:line | As written | Problem | Correct value | Conf. | Source |
|---|---|---|---|---|---|---|
| M1 | `landmarks.ts:102` (verify), `bank/classic.ts:58`, `:160`, `family.ts:132`, `friends-solo.ts:80`, `rhythm.ts:139`, `party-meetup-work.ts:244` | Wat Thepleela and its Saen Saep pier → `wang_thonglang` | **Wrong district.** The temple and its pier are in Hua Mak, **Bang Kapi**, on Khlong Saen Saep. Only the Ramkhamhaeng 39 soi leading to it touches Phlapphla, Wang Thonglang. If this is fixed, **Wang Thonglang drops to 0 answers.** | วัดเทพลีลา (พระอารามหลวง) / Wat Thepleela, แขวงหัวหมาก เขตบางกะปิ → `bang_kapi`. The pier is real (ท่าเรือวัดเทพลีลา). Wang Thonglang needs 6 new answers. One candidate is the Chao Phraya Bodindecha house museum (`landmarks.ts:120`), which is inside Bodindecha (Sing Singhaseni) School off Ramkhamhaeng in Wang Thonglang (medium; visits by phone appointment). Any other Wang Thonglang place needs a fresh check. | high | [th.wikipedia วัดเทพลีลา](https://th.wikipedia.org/wiki/วัดเทพลีลา), [Thairath](https://www.thairath.co.th/lottery/news/2736941), [Sanook (pier)](https://www.sanook.com/news/1264444/), [Thai Holiday Guide (museum)](https://www.thaiholidayguide.com/attraction/chao-phraya-bodindecha-sing-singhaseni-museum/) |
| M2 | `landmarks.ts:44`, `archetypes.ts:467`, `bank/family.ts:163`, `plan.ts:79` | the murals of Wat Chong Nonsi → `bang_kho_laem` | **Wrong district.** The temple is at 463 Nonsi Rd, Chong Nonsi, **Yan Nawa**. The worktrees already key it `yan_nawa`. | จิตรกรรมฝาผนังวัดช่องนนทรี / Wat Chong Nonsi, แขวงช่องนนทรี เขตยานนาวา → `yan_nawa`. Bang Kho Laem goes 9 → 7, which is still fine. | high | [th.wikipedia วัดช่องนนทรี](https://th.wikipedia.org/wiki/วัดช่องนนทรี), [TrueID](https://travel.trueid.net/detail/NWBwO9KpYdrn) |
| M3 | `landmarks.ts:54` (verify), `archetypes.ts:333`, `:418`, `bank/classic.ts:130`, `:210`, `friends-solo.ts:45`, `plan.ts:76`, `dates.ts:108`, `party-meetup-work.ts:100`, `rhythm.ts:17` | Jodd Fairs Ratchada → `huai_khwang` | **Still open, wrong district.** Jodd Fairs Rama 9 closed in January 2025. The current site, the only Jodd Fairs, is at 129 Ratchadaphisek Rd, between the Thai Life building and Big C, by MRT Thailand Cultural Centre Exit 4. That is the west side of Ratchada, which is **Din Daeng**. The Cultural Centre across the road stays Huai Khwang. | จ๊อดแฟร์ รัชดา / Jodd Fairs Ratchada → `din_daeng`. Remove `verify`. Huai Khwang goes 19 → 12 and Din Daeng 20 → 27; RCA, the Thailand Cultural Centre and Huai Khwang night market stay Huai Khwang. | medium-high | [travjoy 2026 guide](https://travjoy.com/blog/jodd-fairs-night-market-bangkok-a-complete-2026-guide-to-the-ratchada-site), [Brand Buffet (site)](https://www.brandbuffet.in.th/?p=235900), [Seth Lui (Rama 9 closure)](https://sethlui.com/jodd-fairs-shuts-down-phra-rama-9-thailand-jan-2025/) |
| M4 | `landmarks.ts:107`; `bank/family.ts:99` ("on the Khlong Phasi Charoen boats"), `friends-solo.ts:100` ("hop off a packed Khlong Phasi Charoen long-tail") | the Khlong Phasi Charoen canal boat from the Phetkasem 69 pier (`bang_khae`) | **Suspended.** The BMA/KT commuter boat (Pratu Nam Phasi Charoen to Phetkasem 69) stopped around 2022. A transport ministry visit on 1 July 2026 calls it the boat that "used to" run and is studying a school-boat and taxi-boat pilot, with no launch date. | Drop the boat. For example "the Phetkasem 69 canal-side path along Khlong Phasi Charoen" (บางแค), or another Bang Khae place. Rewrite the two answers away from a scheduled public boat. `classic.ts:217` (a hired longtail) and `plan.ts:112` (a noodle boat) can stay. | high | [Bangkok Biz News, July 2026](https://www.bangkokbiznews.com/economics/1241026), [Thai PBS 2022](https://www.thaipbs.or.th/news/content/314987) |
| M5 | `landmarks.ts:111`, `bank/dates.ts:115` | Saphan Mai Market → `sai_mai` | **Probably wrong district.** Talat Saphan Mai (Yingcharoen Market) is in the Saphan Mai area, which lies "chiefly in Anusawari, **Bang Khen**", with only a strip in Khlong Thanon, Sai Mai. Nearby businesses give Anusawari, Bang Khen addresses. | ตลาดสะพานใหม่ (ตลาดยิ่งเจริญ) → `bang_khen`, or swap the Sai Mai answer to Wongsakorn Market (confirmed Sai Mai). | medium | [Wikipedia: Saphan Mai](https://en.wikipedia.org/wiki/Saphan_Mai), [Prachachat](https://www.prachachat.net/hilight-prachachat/news-1033278) |

### Remove `verify` (confirmed)
| File:line | Place | Finding | Conf. | Source |
|---|---|---|---|---|
| `landmarks.ts:142`; `bank/dates.ts:137`, `classic.ts:80`, `party-meetup-work.ts:104` | Brown Sugar jazz bar (Chinatown) → `pom_prap` | Now at **18 Soi Nana, Pom Prap, Pom Prap Sattru Phai**, Tue–Sun 5pm–1am (Time Out, page current March 2026). The district and "Chinatown" are right. Older listings at Phra Sumen Rd are stale. | medium (open-status not confirmed from the venue's own channel) | [Time Out TH](https://www.timeout.com/bangkok/th/bars/brown-sugar-jazz-pub-restaurant) |
| `landmarks.ts:155`; `bank/dates.ts:139`, `party-meetup-work.ts:245` | Gateway at Bangsue → `bang_sue` | AWC still lists it in its portfolio, with 2024–2025 events. It is by MRT Tao Poon/Bang Pho and Bang Pho pier, in Bang Sue. I found no 2026 news of closure. | medium | [AWC portfolio](https://www.assetworldcorp-th.com/en/portfolio/retails-and-wholesales/79/gateway-at-bangsue) |

## Fixes needed, worktrees (before they merge)

These matter only when the quiz chats land their branches. Rows W1–W3 are **stale keys from before the owner's D20 fixes**, repeated in the new files.

| # | Worktree file:line | As written | Problem | Correct | Conf. | Source |
|---|---|---|---|---|---|---|
| W1 | bhabha `everyday-commute.ts:26,208`, `everyday-home.ts:68,200`, `landmarks-city.ts:70,104,276`, `jurrgun.ts:51,103,211,305,339`, `seasonal.ts:182`; lamarr `funny-a.ts:78,219,286,394`, `funny-b.ts:23,104,312` | Krung Thep Aphiwat / Central Terminal → `bang_sue` | The owner moved it to Chatuchak (blueprint §3). | `chatuchak` | high | quiz-blueprint.md:168 |
| W2 | bhabha `everyday-rut.ts:80,157`, `everyday-home.ts:307`, `landmarks-city.ts:206,259`, `landmarks-edge.ts:126,136,229,236`, `jurrgun.ts:175,206,344,384`, `seasonal.ts:134,148,227`; lamarr `funny-a.ts:57,158,320`, `funny-b.ts:106,191,258,322,403` | Chokchai 4 → `wang_thonglang` | The owner keyed it `lat_phrao` (D20). See also "could not verify" below. | `lat_phrao` | medium | quiz-audit.md V2 |
| W3 | bhabha `landmarks-city.ts:178,308`, `jurrgun.ts:159,367`; lamarr `funny-a.ts:182`, `funny-b.ts:54,270` | Benjasiri Park → `watthana` | Sukhumvit 24, Khlong Tan, **Khlong Toei** (blueprint §3). | `khlong_toei` | high | quiz-blueprint.md:168 |
| W4 | bhabha `seasonal.ts:332` | Emporium → `watthana` | Emporium is on the south side of Sukhumvit (Soi 24), in Khlong Toei. `everyday-rut.ts:23` already keys it `khlong_toei`. | `khlong_toei` | high | as W3 |
| W5 | bhabha `everyday-home.ts:76`, `landmarks-city.ts:286`, `seasonal.ts:290` | W District → `phra_khanong` | W District (Sukhumvit 71, by BTS Phra Khanong) is in Phra Khanong Nuea, **Watthana**. | `watthana` | high | [Thailand-Property: W District](https://www.thailand-property.com/commercial/13802/w-district) |
| W6 | bhabha `landmarks-city.ts:256` (av) | The Street Ratchada → `huai_khwang` | 139 Ratchadaphisek Rd, **Din Daeng**. | `din_daeng` | high | [Hotels.com](https://uk.hotels.com/go/thailand/the-street-ratchada-shopping-mall) |
| W7 | bhabha `everyday-commute.ts:230` (av) | "café near Kasetsart's Bang Khen gate" → `bang_khen` | Kasetsart Bang Khen campus is 50 Ngamwongwan Rd, Lat Yao, **Chatuchak**. | `chatuchak` | high | [KU profile PDF](https://web.planning.ku.ac.th/Download/KU%20profile%2065%20Final.pdf) |
| W8 | bhabha `everyday-rut.ts:53` (av) | An indie film at Doc Club & Pub → `samphanthawong` | **Moved, not in Chinatown.** Its Sala Daeng venue closed on 16 March 2025. A January 2026 Time Out piece says it will reopen in a larger space with no confirmed address (possibly Cloud 11, Sukhumvit, Phra Khanong). | Replace it with a Samphanthawong answer, or hold until it reopens. | medium | [Time Out Jan 2026](https://www.timeout.com/bangkok/th/news/new-doc-club-pub-010526), [Time Out Mar 2025](https://www.timeout.com/bangkok/th/news/doc-club-pub-saladeang-031325) |
| W9 | bhabha `landmarks-edge.ts:178` | "Phan Fa pier, then … the old Bang Lamphu lanes" → `pom_prap` | The answer's destination, Bang Lamphu, is in **Phra Nakhon**. | `phra_nakhon`, or make the walk about Pom Prap (Golden Mount, Nang Loeng) | medium | Bang Lamphu = Talat Yot/Chana Songkhram, Phra Nakhon |
| W10 | bhabha `everyday-commute.ts:82` | "a Sena Nikhom café" → `lat_phrao` | Sena Nikhom subdistrict is in **Chatuchak**. Only the Sena Nikhom 1 road runs into Lat Phrao. | `chatuchak`, or name a Lat Phrao area | low-medium | DISTRICTS geography |
| W11 | wherever the worktrees copy main files (`family.ts:163`, `plan.ts:79`, the Thepleela, Jodd Fairs, Saphan Mai and Phasi Charoen boat answers) | as M1–M5 | Fix M1–M5 once on main and let the merge carry it. Don't fix them twice. | — | — | — |

Checked in the worktrees and OK: Lumpinee Boxing Stadium on Ram Inthra → `bang_khen` (6 Ram Inthra Rd, Anusawari, Bang Khen; [AAA Tripcanvas](https://www.aaa.com/tripcanvas/attraction/lumpinee-boxing-stadium-VA8546)). Esplanade Ratchada → `din_daeng` ([Wikipedia](https://en.wikipedia.org/wiki/The_Esplanade_(Bangkok))). The Paseo Park Kanchanaphisek → `thawi_watthana` (Sala Thammasop). Terminal 21 Rama 3 → `bang_kho_laem` (Nation, Wikipedia; one Wikipedia line says Yan Nawa, so medium). Krung Thep Bridge → `thon_buri`. Central Rama 2 / Bang Khun Thian, Central Bangna / Bang Na, Central Rama 9 / Huai Khwang, Central Rama 3 / Yan Nawa, Central EastVille / Lat Phrao, Pata Pinklao / Bang Phlat, Seacon Bangkae / Phasi Charoen, MOCA and Or Tor Kor / Chatuchak, Paradise Park / Prawet, Khwan Riam / Min Buri, Neilson Hays Library / Bang Rak, Wat Rakhang / Bangkok Noi, Wat Kalayanamit / Thon Buri, Thonburirom Park / Thung Khru, Indoor Stadium Huamark / Bang Kapi, Queen Sirikit Centre / Khlong Toei, KMITL / Lat Krabang. Three answers are fine as written because the district matches the destination: "Tha Tien → Wat Arun" (bangkok_yai), "boat to Pratunam then CentralWorld" (pathum_wan), and "off at Pak Khlong Talat, over Memorial Bridge to Kudi Chin" (thon_buri).

## Could not verify

| Place | File | What I found |
|---|---|---|
| Chokchai 4 market → `lat_phrao` | `landmarks.ts:101`, `archetypes.ts:370` | The Chokchai 4 road (Lat Phrao Soi 53) is listed as Lat Phrao, but some listings near "ตลาดโชคชัย 4" give Wang Thonglang addresses. I found no official address for the market. `lat_phrao` (the owner's choice) is plausible, so keep it. |
| Thewet flower/plant market → `dusit` | `landmarks.ts:21`, bank (14 answers) | Stalls run along **both banks** of Khlong Phadung Krung Kasem. The south bank is Bang Khun Phrom, Phra Nakhon; the north bank is Dusit. Time Out files it under Dusit and TrueID under Phra Nakhon. `dusit` is defensible. ([Wikipedia: Thewet bridge](https://en.wikipedia.org/wiki/Thewet_Naruemit_Bridge)) |
| Talat Mai Don Mueang by Khlong Prem Prachakon | `landmarks.ts:97`, bank | The market is real and in Don Mueang. A 2018 Thai PBS story reports that the district ordered encroaching buildings demolished. I found no recent status. ([Thai PBS](https://www.thaipbs.or.th/news/content/272110)) |
| Asok pier (Saen Saep) → `huai_khwang` | bhabha `landmarks-edge.ts:213`, lamarr `funny-a.ts:350` | The pier is on the Huai Khwang/Watthana/Ratchathewi border. I could not confirm which bank or district. |
| Tungkru Plaza Market on Pracha Uthit | `landmarks.ts:128`, bank (8) | Only property listings mention it (Pracha Uthit, Thung Khru). It exists, but I could not confirm its current name or that it still operates. |

## Optional wording updates (not errors)
- `learn.ts:681`, Yellow and Pink lines. Since the 2026 common-ticketing shift, eligible EMV contactless cards work on Blue, Purple, Yellow and Pink under MRTA, according to [Nation, 2026](https://www.nationthailand.com/news/policy/40064833). The line could say "Bank contactless cards also work on the Yellow and Pink lines; check each line's site for other ways to pay." Medium confidence.
- Thai-Japanese Sports Centre (`landmarks.ts:73`, `archetypes.ts:382`, 17 answers). The official name is ศูนย์เยาวชนกรุงเทพมหานคร (ไทย-ญี่ปุ่น), Thai-Japanese Bangkok Youth Center, on Mit Maitri Rd, Din Daeng. The current names are what people commonly call it and are fine. Rename only if you want the official name. ([Wikipedia](https://en.wikipedia.org/wiki/Thai-Japanese_Stadium))
- Safari World. "9 am opening" is correct, but the park **closes on Mondays**, so avoid a "Monday" framing. ([THAIest](https://thaiest.com/en/blog/safari-world-bangkok-schedule))

## Verified OK (compact)

**Sourced in this run:** Brown Sugar (Soi Nana, Pom Prap); Gateway at Bangsue; Liab Duan Ram Inthra night market (Pradit Manutham Rd, Tha Raeng, **Bang Khen** ✓, [TrueID](https://travel.trueid.net/detail/JpbZJywMgd8p)); Pattavikorn Market (Nawamin 70/72, Khlong Kum, **Bueng Kum** ✓, [Wikipedia](https://en.wikipedia.org/wiki/Pattavikorn_Market)); Lat Phrao 101 (Khlong Chan, **Bang Kapi** ✓); Wongsakorn Market (**Sai Mai** ✓); Wat Bang Bon (Ekkachai 119, **Bang Bon** ✓); Wat Nong Khaem on Khlong Phasi Charoen (**Nong Khaem** ✓); Wat Rat Burana (วัดราษฎร์บูรณะ, a separate temple from Wat Ratchaburana in Phra Nakhon, **Rat Burana** ✓, medium); Wat Lat Bua Khao (the only temple in **Saphan Sung**, Thap Chang ✓); Chao Phraya Bodindecha house museum (**Wang Thonglang**, medium); Thai-Japanese centre (Mit Maitri Rd, **Din Daeng** ✓); Lumpinee Ram Inthra (**Bang Khen** ✓); The Street Ratchada and Esplanade (**Din Daeng**); W District (**Watthana**); Terminal 21 Rama 3 (**Bang Kho Laem**); Paseo Park (**Thawi Watthana**); Kasetsart / Kaset Fair (**Chatuchak** ✓); House Samyan (open, ranked by Time Out in 2026); Lido Connect (2026 events); Chang Chui (2026 events); Saxophone Pub (3/8 Phaya Thai Rd, listed open, no closure found; medium); Candide Books (at The Jam Factory ✓); Warehouse 30 (Charoenkrung Soi 30 ✓); Bangkokian Museum (Charoen Krung 43, Wed–Sun ✓); Royal Thai Air Force Museum (free, open, own BTS stop ✓); Asiatique Sky (listed April 2026 ✓); Safari World (9 am ✓).

**Learn facts sourced:** 191, 1669, 1300 (24 h), 1663 (daily 09:00–21:00 ✓), 1323 (24 h), 1441, 1155, Samaritans 02-113-6789 (daily 12:00–22:00 ✓), DLT 1584; MRT and MRT Plus cards ended 1 June 2026 ✓ ([Nation](https://www.nationthailand.com/news/policy/40064833)); ARL has 8 stations ✓; Saen Saep boat Phan Fa → Pratunam with a change of boat ✓.

**Well-known geography, district correct, not individually searched:** Phra Nakhon: Santichaiprakarn Park, Khlong Ong Ang, Pak Khlong Talat, Sanam Luang, Khao San/Rambuttri, Phahurat/Little India, Phraeng Phuthon, Museum Siam, Loha Prasat, Bang Lamphu, Giant Swing. Dusit: Wat Benchamabophit. Pom Prap: Nang Loeng Market, Golden Mount and its fair, Rajadamnern Stadium, Bobae. Bang Rak: Charoenkrung galleries, TCDC Grand Postal Building, Silom Soi 4, MahaNakhon SkyWalk. Pathum Wan: Lumphini, BACC, Chula Centenary Park, Siam Square, Samyan Mitrtown, CentralWorld, One Bangkok, Jim Thompson House, Banthat Thong. Samphanthawong: Yaowarat, Talat Noi, Song Wat, Sampeng, Wat Mangkon. Phaya Thai: Ari, Saphan Khwai. Ratchathewi: Victory Monument boat noodles, Pratunam, Ban Khrua, Santiphap Park. Thon Buri: Talat Phlu, Kudi Chin. Bangkok Yai: Wat Arun riverside, Khlong Bangkok Yai. Bangkok Noi: Wang Lang, Royal Barges Museum. Khlong San: ICONSIAM/SookSiam, Lhong 1919, The Jam Factory, Charoen Nakhon. Taling Chan: floating market, Khlong Lat Mayom. Phasi Charoen: Baan Silapin and Khlong Bang Luang. Bang Phlat: Chang Chui, Rama VIII Thonburi end. Huai Khwang: Thailand Cultural Centre, RCA, Huai Khwang night market. Din Daeng: flats street food. Bueng Kum: Seri Thai Park. Sathon: Wat Yannawa, Chong Nonsi Canal Park, rooftops. Chatuchak: Krung Thep Aphiwat, Chatuchak Market, Rot Fai Park, Major Ratchayothin/Blu-O, Union Mall. Bang Sue: Bang Pho, Rama VII riverside. Bang Kho Laem: Asiatique, Charoen Krung 103. Prawet: Suan Luang Rama IX, Seacon Square, Ramkhamhaeng 2. Khlong Toei: Benjakitti, Benjasiri, Khlong Toei Market, EmSphere. Watthana: EmQuartier, The Commons, Terminal 21 Asok, Thonglor/Ekkamai. Suan Luang: Wat Mahabut/Mae Nak, On Nut canal. Chom Thong: Wat Ratchaorasaram, Bang Mot orchards. Don Mueang: RTAF Museum. Lak Si: Wat Lak Si, IT Square. Khan Na Yao: Siam Amazing Park, Fashion Island/The Promenade. Khlong Sam Wa: Safari World. Bang Na: BITEC, Udom Suk. Thung Khru: KMUTT Bang Mot. Bang Kapi: Rajamangala, Ramkhamhaeng University, The Mall Bang Kapi, Saen Saep pier. Nong Chok: Bangkok Arena, Khlong Sip Si farms. Min Buri: old market, Saen Saep communities. Lat Krabang: Hua Takhe. Bang Khae: Bang Khae market. Rat Burana: Wat Bang Pakok, Suk Sawat. Phra Khanong: True Digital Park, Wat Thammamongkhon. Bang Khun Thian: mangrove path. Bang Khen: Wat Phra Si Mahathat. Archetype spots outside Bangkok are labelled correctly: Bang Krachao is in Samut Prakan, and Chao Phraya Sky Park spans Phra Nakhon and Khlong San.

**Seeds** (`scripts/seed*.ts`): all OK. MRT Wat Mangkon Exit 1 / Samphanthawong, MRT Sanam Chai / Phra Nakhon, BTS Ari / Phaya Thai, TCDC and Charoen Krung Soi 32 / Bang Rak, Benjakitti / Khlong Toei, BACC and Lumphini / Pathum Wan, BTS Victory Monument / Ratchathewi. **constants.ts VISITBANGKOK_ROUTES**: all OK. The Charoenkrung–Talat Noi route spans Bang Rak and Samphanthawong, and `bang_rak` is acceptable.

---

## Follow-up 1: Wang Thonglang places (added 2026-10-15)

Background: Wat Thepleela is in Hua Mak, Bang Kapi (M1), so Wang Thonglang currently has no correctly keyed answers. Wang Thonglang has few sights. These are the places I could confirm with an address inside the district.

| # | Thai / English | Where (official address) | Open? | Fits these moments | Conf. | Source |
|---|---|---|---|---|---|---|
| WT1 | พิพิธภัณฑ์เจ้าพระยาบดินทรเดชา (สิงห์ สิงหเสนี) / Chao Phraya Bodindecha (Sing Singhaseni) Museum | Inside Bodindecha (Sing Singhaseni) School, 40 Soi Ramkhamhaeng 43/1, Phlapphla, **Wang Thonglang** 10310 | Listed daily 09:00–16:00, free. **Call ahead (02-514-1403), because it's inside a working school.** One article wrongly gives the subdistrict as "ทรายกองดิน"; I went with the listing above. | Heritage: a quiet visit, teak Thai houses and a garden, taking a visiting friend or a grandparent. Not a late-night spot. | high (district), medium (walk-in access) | [Love Thailand listing](https://www.lovethailand.org/travel/en/17-Bangkok/893-Chao-Phraya-Bodindecha-(Sing-Singhaseni)-Museum.html), [Thai Holiday Guide](https://www.thaiholidayguide.com/attraction/chao-phraya-bodindecha-sing-singhaseni-museum/) |
| WT2 | ถนนศรีวรา ย่านทาวน์อินทาวน์ / Sriwara Road, Town in Town | Sriwara Rd, Phlapphla, **Wang Thonglang** (e.g. 1213/567 Sriwara Rd) | A living neighbourhood strip of boat-noodle, family seafood, grill, salad and dessert shops, plus The Scene and Park Town in Town (Lotus's) community malls | Food (noodles, seafood, jim jum, grill), a regular table, meeting a friend, a team lunch, an early jok, a new café | high | [Wongnai: Golden Boat Noodles, Sriwara Rd, Phlapphla, Wang Thonglang](https://www.wongnai.com/restaurants/184578wM-%E0%B8%81%E0%B9%8B%E0%B8%A7%E0%B8%A2%E0%B9%80%E0%B8%95%E0%B8%B5%E0%B9%8B%E0%B8%A2%E0%B8%A7%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B8%AD%E0%B8%97%E0%B8%AD%E0%B8%87%E0%B8%84%E0%B8%B3%E0%B8%A1%E0%B8%B2-%E0%B8%97%E0%B8%B2%E0%B8%A7%E0%B8%99%E0%B9%8C%E0%B8%AD%E0%B8%B4%E0%B8%99%E0%B8%97%E0%B8%B2%E0%B8%A7%E0%B8%99%E0%B9%8C%E0%B8%8B%E0%B8%AD%E0%B8%A2-11), [Wongnai: Town in Town Seafood](https://www.wongnai.com/restaurants/townintownseafood/reviews) |
| WT3 | สวนสาธารณะวังทอง 1 / Wang Thong 1 Public Park | Between Soi Lat Phrao 71 and 73, **Wang Thonglang** (district office 02-538-5350) | Daily 05:00–19:00 | A calm walk or jog, a dawn or dusk loop, a slow stroll with a parent | medium (only one listing found) | [Love Thailand](https://www.lovethailand.org/travel/en/17-Bangkok/4703-Wang-Thong1-Public-Park.html) |
| WT4 | ศูนย์การเรียนรู้การจัดการด้านสิ่งแวดล้อมที่ยั่งยืน เขตวังทองหลาง / Wang Thonglang environmental learning centre garden (7 rai) | Soi Ramkhamhaeng 43/1, **Wang Thonglang**, next to WT1 | Open to the public for exercise and rest | A short quiet walk. Pairs with WT1. | medium | [Daily News](https://www.dailynews.co.th/news/1892520/) |
| WT5 | ร้านกาแฟย่านลาดพร้าว 87 / cafés on Lat Phrao Soi 87 (e.g. Zen Cafe by Zen No.14) | Lat Phrao 87, Phlapphla, **Wang Thonglang** | A single shophouse café, so it could close. Write "a café on Lat Phrao 87", not the shop's name. | A café, meeting one friend | medium | [Wongnai](https://www.wongnai.com/restaurants/190116gQ-zen-cafe-by-zen-no-14-%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%9E%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%A7-87) |

What I could not find:
- **A named market.** I found no verified market inside Wang Thonglang. Don't move Chokchai 4 back here: the owner keyed it Lat Phrao and its address is unconfirmed.
- **Lat Phrao 101** is a **border road** between Wang Thonglang and Bang Kapi (official district map). The main bank keys it `bang_kapi`, which is defensible, so leave it.
- The **Liab Duan Ekkamai–Ram Inthra** strip may be in Bueng Kum, so don't use it.

## Follow-up 2: replacing the Khlong Phasi Charoen boat (added 2026-10-15)

No public scheduled boat runs on Khlong Phasi Charoen today (M4). Here is what does run in that part of Thonburi:

| # | Thai / English | District | Runs today? | Fits | Conf. | Source |
|---|---|---|---|---|---|---|
| PC1 | บ้านศิลปิน คลองบางหลวง / Baan Silapin (Artist's House), Khlong Bang Luang | 309 Soi Phetkasem 28, Khuha Sawan, **Phasi Charoen** | Yes. Free Kham Nai puppet show; check show days on its Facebook. Busiest at weekends, when the **weekend floating market at Wat Kamphaeng** is on. Private long-tails still use the canal. | Discovery with kids or cousins (BDMH), heritage, a canal walk | high | [Time Out](https://www.timeout.com/bangkok/th/attractions/บ้านศิลปินคลองบางหลวง), [Naewna](https://www.naewna.com/lady/765713) |
| PC2 | MRT บางไผ่ → ซอยเพชรเกษม 20 → คลองบางหลวง / MRT Bang Phai to the Khlong Bang Luang lanes | **Phasi Charoen** | Yes. Blue Line Bang Phai Exit 4, then Soi Phetkasem 20 on foot or by motorbike taxi | "Getting there" framing for the canal-lane answers, replacing "hop off a long-tail" | medium-high | [TrueID](https://travel.trueid.net/detail/0NgPqKoGBAbJ) |
| PC3 | เรือด่วนเจ้าพระยา / Chao Phraya Express Boat | river piers in Bangkok Noi and Thon Buri (e.g. Wang Lang/Prannok), not in Phasi Charoen | Yes. Since 30 March 2026 the **orange flag runs weekdays only**, and the yellow flag covers daytime and weekends. Use "the river boat", not a flag colour. | Only for Bangkok Noi or Thon Buri answers. It doesn't reach Phasi Charoen. | medium-high | [Little Big Red Dot](https://littlebigreddot.com/chao-phraya-express-boat-routes-fares/), [THAIest](https://thaiest.com/thailand/bangkok/orange-flag-boat) |
| PC4 | สวนบางแคภิรมย์ / Bang Khae Phirom Park | **Bang Khae** | It exists and is a BMA park; I didn't find its hours | A replacement Bang Khae landmark: a calm walk | medium | [Research article, Burapha Univ. journal](https://so01.tci-thaijo.org/index.php/humanjubru/article/view/270412) |

Note: the BMA's planned school-boat and taxi-boat pilot (Bang Wa BTS → Wat Paknam Phasi Charoen → Talat Phlu → Khlong Bang Luang) has **no launch date** as of July 2026. Don't write it in as running.

## Exact replacements, line by line

These are suggested texts. The quiz owner should run `scripts/check-bank.ts` after pasting them. The new names may need entries in `PLACE_PAIRS` in `bank-rules.ts`: `[/Sriwara|Town in Town/, "ศรีวรา|ทาวน์อินทาวน์"]`, `[/Bodindecha/, "บดินทรเดชา"]`, `[/Wat Kamphaeng/, "วัดกำแพง"]`, `[/Bang Phai/, "บางไผ่"]`, `[/Bang Khae Phirom/, "บางแคภิรมย์"]`. Remove `[/Thepleela/, …]` if no answer uses it any more.

**The 3 boat lines**
1. `src/vibe/landmarks.ts:107` →
   `l("bang_khae", "Bang Khae Phirom Park", "สวนบางแคภิรมย์"),`
2. `src/vibe/bank/family.ts:99` (BDMH, phasi_charoen) →
   `a("🎭", "phasi_charoen", "A gang of cousins at the weekend market by Wat Kamphaeng on Khlong Bang Luang, then the puppet show at Baan Silapin, new to all of you", "แก๊งลูกพี่ลูกน้องเดินตลาดวันหยุดริมคลองบางหลวงแถววัดกำแพง แล้วไปดูหุ่นละครเล็กที่บ้านศิลปิน ที่ใหม่สำหรับทุกคน")`
3. `src/vibe/bank/friends-solo.ts:100` (BDMH, phasi_charoen) →
   `a("🛶", "phasi_charoen", "Hop off the MRT at Bang Phai and walk the shady Khlong Bang Luang lanes to Wat Kamphaeng, chatting with whoever comes along", "ลง MRT บางไผ่ แล้วเดินซอยร่ม ๆ ริมคลองบางหลวงไปวัดกำแพง คุยกับใครก็ได้ที่เดินไปด้วย")`

**Wang Thonglang** (each keeps its type letters and `wang_thonglang`)
4. `src/vibe/landmarks.ts:102` →
   `l("wang_thonglang", "the Sriwara Road food shops in Town in Town", "ร้านอาหารถนนศรีวรา ย่านทาวน์อินทาวน์"),`
   Optionally add `l("bang_kapi", "Wat Thepleela and its Khlong Saen Saep pier", "วัดเทพลีลาและท่าเรือคลองแสนแสบ"),` and drop `verify`.
   Also add `l("wang_thonglang", "Wang Thong 1 Public Park", "สวนสาธารณะวังทอง 1"),`
5. `src/vibe/bank/classic.ts:58` (CFSH, visiting friend) →
   `a("🏛️", "wang_thonglang", "A quiet look round the Chao Phraya Bodindecha house museum, then lunch at your usual old noodle shop on Sriwara Road", "เดินชมพิพิธภัณฑ์บ้านเจ้าพระยาบดินทรเดชาเงียบ ๆ แล้วไปกินมื้อเที่ยงที่ร้านก๋วยเตี๋ยวเก่าเจ้าประจำบนถนนศรีวรา")`
   (The museum is in a school, so this suits a weekday visit; the answer doesn't name a day.)
6. `src/vibe/bank/classic.ts:160` (BFSH, cool evening after a storm) →
   `a("🍲", "wang_thonglang", "The usual crowd at the Sriwara Road seafood tables in Town in Town, a big pot of jim jum for the table", "ร้านประจำคนแน่นริมถนนศรีวรา ย่านทาวน์อินทาวน์ สั่งจิ้มจุ่มหม้อใหญ่มาแบ่งกันทั้งโต๊ะ")`
7. `src/vibe/bank/family.ts:132` (BFSH, siblings' weekend) →
   `a("🔥", "wang_thonglang", "The whole sibling crew at the usual grill shop on Sriwara Road, same big table, same grilled dishes", "พี่น้องทั้งแก๊งไปร้านปิ้งย่างประจำบนถนนศรีวรา โต๊ะใหญ่เดิม ของปิ้งย่างเดิม")`
8. `src/vibe/bank/friends-solo.ts:80` (CDSN, weekend plan) →
   `a("🪴", "wang_thonglang", "A just-opened café on Lat Phrao 87, only a couple of you and a long talk", "คาเฟ่เพิ่งเปิดในซอยลาดพร้าว 87 ไปกันแค่สองสามคน คุยกันยาว ๆ")`
9. `src/vibe/bank/rhythm.ts:139` (CFSH, flavour −1, mornings) →
   `a("🥣", "wang_thonglang", "Your usual 7 am jok with one old friend at the same stall on Sriwara Road, then a slow lap of Wang Thong 1 park", "โจ๊ก 7 โมงเช้ากับเพื่อนเก่าคนหนึ่งที่ร้านเจ้าประจำบนถนนศรีวรา แล้วเดินช้า ๆ รอบสวนวังทอง 1", -1)`
10. `src/vibe/bank/party-meetup-work.ts:244` (BFSH, new coworker's lunch) →
   `a("🍲", "wang_thonglang", "The team's regular table at an old shop on Sriwara Road, everyone ordering the usual", "โต๊ะประจำของทีมที่ร้านเก่าบนถนนศรีวรา ทุกคนสั่งเมนูเดิม")`

Wang Thonglang goes back to 6 answers. Five lean on Sriwara Road, which is the district's real food strip. If the quiz chat wants more variety, swap one of them for WT3 (park) or WT4 (garden walk).

---

## Q2 batch: the 57 `verify` answers (commit 83446bb, added 2026-10-15)

Scope: every `av(...)` answer in the seven new bank files on `origin/main` (`everyday-commute`, `everyday-home`, `everyday-rut`, `jurrgun`, `landmarks-city`, `landmarks-edge`, `seasonal`). That is 57 answers about 35 places. I read the files from the commit (`git show 83446bb:…`); the local `main` checkout is one commit behind, and I didn't pull. Line numbers are as of 83446bb, and all paths are under `src/vibe/bank/`.

**Result:** 39 answers can drop `verify`. **8 answers need a fix**: 3 are in the wrong district, 1 names a film night Warehouse 30 no longer runs, 1 gives the wrong opening hours, and 3 promise a canal path that may not exist yet. 10 could not be fully verified; leave `verify` on those or reword them.

### Fix table

| # | File:line | As written | Problem | Correct value | Conf. | Source |
|---|---|---|---|---|---|---|
| Q1 | `everyday-home.ts:162` | "The Ekkamai planetarium show for two" → `watthana` | **Wrong district.** The Science Centre for Education (planetarium) is at 928 Sukhumvit Rd, on the south side opposite BTS Ekkamai, in **Khlong Toei**. Listed open Tue–Sun 09:00–16:30, ticketed separately for exhibits and the dome. I found no renovation closure. | ศูนย์วิทยาศาสตร์เพื่อการศึกษา (ท้องฟ้าจำลองกรุงเทพ) / Science Centre for Education (Bangkok Planetarium) → `khlong_toei` | high (district), medium (open) | [TrueID](https://travel.trueid.net/detail/gZ675YYpkPg), [Time Out](https://www.timeout.com/bangkok/th/museums/%E0%B8%97%E0%B9%89%E0%B8%AD%E0%B8%87%E0%B8%9F%E0%B9%89%E0%B8%B2%E0%B8%88%E0%B8%B3%E0%B8%A5%E0%B8%AD%E0%B8%87-bangkok-planetarium) |
| Q2 | `landmarks-city.ts:129` | "Hands-on rooms at Ekkamai Science Centre" → `watthana` | Same as Q1. `landmarks-edge.ts:292` already keys it `khlong_toei`, which is correct. | → `khlong_toei` | high | as Q1 |
| Q3 | `everyday-commute.ts:299` | "A walk past Wat Nimmanoradee's canal-side houses" → `bang_khae` | **Wrong district.** Wat Nimmanoradee (the old "Wat Bang Khae", which may explain the key) is in Bang Wa, **Phasi Charoen**, on Khlong Phasi Charoen. | วัดนิมมานรดี / Wat Nimmanoradee → `phasi_charoen` | medium-high | [Thairath](https://www.thairath.co.th/newspaper/2702603) |
| Q4 | `everyday-rut.ts:218` | "an indie film night at Warehouse 30" → `bang_rak` | **No longer runs.** The screening room at Warehouse 30 was the Documentary Club's. Doc Club & Pub moved away and closed its later Sala Daeng venue in March 2025. I found no current film nights at Warehouse 30. The district is right. | Keep Warehouse 30 (`bang_rak`) but swap the activity for "a new exhibition opening" or "a pop-up talk". Or move the film night to House Samyan (`pathum_wan`). | medium | [Khaosod 2017 (Doc Club screening room)](https://www.khaosodenglish.com/life/events/2017/07/17/new-art-space-warehouse-30-sees-saturday-soft-opening/amp/), [Time Out Mar 2025](https://www.timeout.com/bangkok/th/news/doc-club-pub-saladeang-031325) |
| Q5 | `landmarks-city.ts:344` | "Midnight with the gang at Wongsakorn Market" → `sai_mai` | **Wrong time.** Wongsakorn is an afternoon and evening market. Its shops list closing at about 19:00–20:00, and I found nothing open at midnight. The district is right. | "An evening with the gang at Wongsakorn Market…" (เย็น ๆ กับแก๊งที่ตลาดวงศกร). For a midnight market in the north, use Liab Duan Ram Inthra (`bang_khen`, open 17:00–02:00). | medium | [Wongnai shop hours, Wongsakorn](https://www.wongnai.com/restaurants/3391808oc-thx-coffee-%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%A7%E0%B8%87%E0%B8%A8%E0%B8%81%E0%B8%A3-%E0%B8%AA%E0%B8%B2%E0%B8%A2%E0%B9%84%E0%B8%AB%E0%B8%A1), [Matichon (Liab Duan hours)](https://www.matichon.co.th/lifestyle/news_495049) |
| Q6 | `landmarks-edge.ts:127`, `jurrgun.ts:416`, `everyday-rut.ts:217` | "the Saen Saep canal path by Wat Thepleela" / "the Wat Thepleela canal walk" → `bang_kapi` | **District right, the path is unconfirmed.** The BMA canal-side walkway and bike lane along Saen Saep is being built in stretches. I found no report that the Hua Mak/Ramkhamhaeng stretch is finished, and Ramkhamhaeng to Khlong Tan was listed as the dirtiest section. | Say "by the Wat Thepleela pier on Saen Saep" rather than "canal path", or keep `verify` until someone walks it. `landmarks-edge.ts:141` (boat noodles by Wat Thepleela) is fine. | medium | [Daily News](https://www.dailynews.co.th/news/5117087/), [Thai PBS](https://www.thaipbs.or.th/news/content/250117) |

### Confirmed: `verify` can come off (39 answers)

| Place | Key ✓ | Lines (all `av`) | What I confirmed | Source |
|---|---|---|---|---|
| Jodd Fairs Ratchada | din_daeng | everyday-rut:262, jurrgun:247, :383, everyday-home:294 | 129 Ratchadaphisek, Din Daeng; open about 17:00–01:00, so "11 pm", "till late" and "till midnight" all hold | see M3 above |
| Brown Sugar | pom_prap | everyday-rut:133, jurrgun:382 | 18 Soi Nana, Pom Prap Sattru Phai; Tue–Sun 17:00–01:00, so "until midnight" holds (closed Mondays) | Time Out (above) |
| Warehouse 30, exhibition opening | bang_rak | jurrgun:324 | Charoen Krung Soi 30 gallery and event warehouses | [Time Out](https://www.timeout.com/bangkok/th/art/warehouse-30) |
| Chao Phraya Bodindecha house museum | wang_thonglang | landmarks-city:134, landmarks-edge:135, seasonal:391 | 40 Soi Ramkhamhaeng 43/1, Phlapphla; listed daily 09:00–16:00, free. **Call ahead (it's inside a school)**, so it isn't a pure walk-in; the answers don't promise one. | Love Thailand (above) |
| Wat Thepleela, boat noodles | bang_kapi | landmarks-edge:141 | Hua Mak, Bang Kapi | th.wikipedia (above) |
| Chao Phraya Sky Park | khlong_san (everyday-commute:134), phra_nakhon (jurrgun:303) | — | Free, daily 05:00–20:00 (reviewed June 2026). It spans both districts, so both keys are valid. | [Thai Holiday Guide](https://www.thaiholidayguide.com/attraction/chao-phraya-sky-park/), [Time Out](https://www.timeout.com/bangkok/attractions/chao-phraya-sky-park) |
| Central Rama 2 | bang_khun_thian | everyday-commute:211, landmarks-city:158 | Rama 2 Rd, Samae Dam, Bang Khun Thian | (geography; confirmed in the first pass) |
| Central EastVille | lat_phrao | seasonal:362, landmarks-edge:408 | Pradit Manutham Rd, Lat Phrao, an indoor and outdoor garden mall; neighbours on the road list Lat Phrao, Lat Phrao | [Marketeer](https://marketeeronline.co/archives/41689) |
| Nong Bon Water Sports Centre / Nong Bon Park | prawet | jurrgun:280, seasonal:82 | Chaloem Phrakiat R.9 Soi 43, Nong Bon, Prawet; daily 08:30–18:30; kayak, sailing and SUP (may need an annual membership); the park is free | [Time Out](https://www.timeout.com/bangkok/th/things-to-do/ศูนย์กีฬาบึงหนองบอน-bueng-nong-bon-sports-center), [Wikipedia](https://en.wikipedia.org/wiki/Nong_Bon_Water_Sports_Center) |
| Esplanade Ratchada bowling | din_daeng | landmarks-edge:400 | Blu-O Rhythm & Bowl, 4th floor; hosted ASEAN Para Games bowling in January 2026 | [Wikipedia](https://en.wikipedia.org/wiki/Bowling_at_the_2025_ASEAN_Para_Games) |
| Lumpinee Stadium, Ram Inthra | bang_khen | landmarks-edge:268 | 6 Ram Inthra Rd, Anusawari, Bang Khen | AAA Tripcanvas (above) |
| Liab Duan Ram Inthra market | bang_khen | everyday-commute:270 | Tha Raeng, Bang Khen; 17:00–02:00, so "11 pm" holds | [Matichon](https://www.matichon.co.th/lifestyle/news_495049) |
| Pattavikorn Market | bueng_kum | everyday-commute:347 | Nawamin 70/72, Khlong Kum | [Wikipedia](https://en.wikipedia.org/wiki/Pattavikorn_Market) |
| Terminal 21 Rama 3 | bang_kho_laem | everyday-home:154 | Rama 3 Rd, Bang Kho Laem | Nation (above) |
| Paradise Park | prawet | everyday-home:346 | Srinakarin, Nong Bon, Prawet | (geography) |
| IT Square Lak Si café | lak_si | landmarks-city:374 | Laksi Plaza, Lak Si | (geography) |
| Baan Kudichin Museum | thon_buri | landmarks-city:140 | 271 Soi Wat Kalaya, Thon Buri; Tue–Sun 09:30–18:00, free (reviewed July 2026) | [Time Out](https://timeout.com/bangkok/museums/baan-kudichin-museum) |
| Thonburirom Park | thung_khru | seasonal:86 | Pracha Uthit, Thung Khru; the BMA extended its hours to 04:00–21:00 | [Matichon](https://www.matichon.co.th/local/news_3825094) |
| Seri Thai Park | bueng_kum | seasonal:88 | (confirmed in the first pass) | — |
| Saranrom Park, 6 am | phra_nakhon | seasonal:135 | Opens about 04:30–05:00, free; morning exercise groups noted | [Thai Holiday Guide](https://www.thaiholidayguide.com/attraction/saranrom-park/) |
| W District café | watthana | seasonal:312 | Phra Khanong Nuea, Watthana (corrected key, now right) | (first pass) |
| Generic "a café/stall in…" answers | huai_khwang (everyday-home:302, jurrgun:295 escape room "in Ratchada"), lat_phrao (seasonal:144 Chokchai 4 café), rat_burana (seasonal:252 Suk Sawat jay café), sai_mai (seasonal:253 old jay shop), saphan_sung (seasonal:284 garden café), khan_na_yao (jurrgun:105 Fashion Island pop-up classes), prawet (jurrgun:111 Seacon Square board games) | — | These name a real area, not a venue, so there's nothing to close. The `verify` mark isn't needed. | — |

### Could not verify: keep `verify` or reword (10 answers)

| File:line | Place | What I found |
|---|---|---|
| `everyday-home.ts:350` | Clay workshop at Warehouse 30 (`bang_rak`) | Warehouse 30 has a hire-out workshop space, but I found no current clay or pottery class there. Safer: "a hands-on workshop at Warehouse 30". |
| `jurrgun.ts:272`, `everyday-home.ts:327` | Bangkok Arena futsal / badminton courts (`nong_chok`) | The BMA sports centre at Bangkok Arena lists badminton, gym, table tennis and pool for the public (2020 report). I found no current booking info for futsal. District right; open status medium. |
| `landmarks-edge.ts:354` | "Rama III riverside" jogging path (`yan_nawa`) | I found no continuous public riverside jogging path on Rama III; the Chao Phraya riverside walkway was halted by court order in 2021. Safer: "evening jogs along Rama III's riverside parks" or "by the river off Rama III". This also affects the older main bank lines on the "Rama III riverside path" (`yan_nawa`, 8 answers), so it's worth a quick look. |
| `jurrgun.ts:357` | Street art on Soi Nana, Chinatown (`pom_prap`) | The district is right, and Soi Nana is the Chinatown bar lane. I found no source for a street-art trail there; Talat Noi (`samphanthawong`) is the documented mural area. |
| `jurrgun.ts:146` | A Thawi Watthana orchid farm taking groups monthly (`thawi_watthana`) | Orchid farms exist in the district, but I found no named farm that takes visitor groups. Reword to "the orchid farms of Thawi Watthana" (the existing landmark) without promising a group visit. |
| `seasonal.ts:299` | Thawi Watthana canal orchards, picking mangoes | Plausible farm area, but no source for pick-your-own mangoes. |
| `seasonal.ts:307` | Chom Thong canal orchards | The Bang Mot orchards are mostly gone or remnant; there's no source for a walkable orchard. The existing landmark "the old orchards of Bang Mot" is already broad. |
| `seasonal.ts:243` | Jay (vegetarian festival) lanes round Wongwian 22 Karakadakhom (`pom_prap`) | The district is right. The festival's documented centre is Yaowarat (`samphanthawong`); I found no source for Wongwian 22's jay lanes. Safer: move it to Yaowarat / `samphanthawong`. |
| `jurrgun.ts:111` | Seacon Square board game café | The mall is right; I found no current board-game café there. Could be "a board-game night at Seacon Square". |

### Not in the verify list, but still in the batch
- `everyday-commute.ts:86`: "a Sena Nikhom café" → `lat_phrao`. Sena Nikhom subdistrict is in **Chatuchak** (W10 in the first pass). Low-medium; change it to `chatuchak` or say "a Lat Phrao café".
- The batch's "Ratchada" answers keyed `huai_khwang` (everyday-rut:168, everyday-commute:266, everyday-home:275, landmarks-city:372, jurrgun:295) are fine. Ratchadaphisek runs mostly through Huai Khwang. Only the west side near the Cultural Centre (Jodd Fairs, The Street, Esplanade) is Din Daeng.
- The first pass's worktree problems (Krung Thep Aphiwat, Chokchai 4, Benjasiri, Emporium, W District, Kasetsart, The Street, Doc Club, the Phasi Charoen boat) are **all fixed** in this commit.
