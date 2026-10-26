DRAFT, held for the owner's OK. Nothing here is published.

# M4 · Placement link register


*Marketing, 2026-10-26. Dates are relative to launch day (L).*

## How codes work (from `src/lib/source.ts`)

- Add `?src=<code>` to a **landing**: `/`, `/new`, `/international`, `/signup` or `/types/<slug>`. A code on any other path (for example `/quiz` or `/events/...`) is **not recorded**, so every link below points to a landing.
- Codes are lower case `a-z`, `0-9`, `-` and `_`, at most 32 characters. Anything else becomes `_`. A run of 6 or more digits is dropped, so codes never carry dates or numbers like `20261107`.
- The first code wins for 30 days. City Insight shows sign-ups and first RSVPs by code, only as totals of 10 or more.
- **One code per channel, film cut or poster. Never per person.** Creators share one code (`creator`), not one each.

**Scheme:** `<channel>-<placement>`, for example `ig-reel04`. Short, no dates.

## Register

| Code | Where it's used | Landing | Notes |
|---|---|---|---|
| `line-rich-tables` | LINE OA rich menu: Tables this week | `/new` | |
| `line-rich-new` | LINE OA rich menu: New to Bangkok | `/new` | |
| `line-rich-intl` | LINE OA rich menu: From abroad | `/international` | |
| `line-rich-quiz` | LINE OA rich menu: Take the quiz | `/new` | `/quiz` isn't a landing, so go via `/new` |
| `line-greeting` | LINE OA greeting message | `/new` | |
| `line-bc-eve` | LINE broadcast, launch eve (L-1) | `/new` | |
| `line-bc-reminder` | LINE broadcast, day-before reminder | `/new` | |
| `line-voom` | LINE VOOM posts | `/new` | |
| `ig-bio` | Instagram bio link | `/` | |
| `ig-reel04` | IG reel, `jurrgun-04-reel-9x16.mp4` | `/new` | |
| `ig-promo05-1x1` | IG feed, `jurrgun-05-promo-1x1.mp4` | `/new` | |
| `ig-promo05-9x16` | IG story or reel, `jurrgun-05-promo-9x16.mp4` | `/new` | |
| `tt-bio` | TikTok bio link | `/` | |
| `tt-reel04` | TikTok, `jurrgun-04-reel-9x16.mp4` | `/new` | |
| `fb-page` | Facebook page links | `/` | |
| `fb-promo05` | Facebook post, promo 05 | `/new` | |
| `yt-film01` | YouTube, film 01 | `/` | |
| `yt-film03` | YouTube, film 03 | `/` | |
| `yt-film06` | YouTube, film 06 | `/` | |
| `founder-ig` | Owner's own IG post | `/new` | Owner's account: only with their OK |
| `founder-li` | Owner's LinkedIn post | `/international` | |
| `creator` | All creator posts (one shared code) | `/new` | Never one code per creator |
| `poster-new` | QR poster, New to Bangkok | `/new` | |
| `poster-intl` | QR poster, From abroad | `/international` | |
| `poster-uni` | QR poster at universities | `/new` | Same art, own code |
| `poster-cowork` | QR poster at coworking spaces | `/new` | |
| `bma-district` | BMA district pages, if approved | `/` | Only after BMA approval |
| `bma-line` | BMA LINE, if approved | `/` | Only after BMA approval |
| `press` | Media links | `/` | Held until there's a launch date |

Full link example: `https://jurrgun.apps.sv-academy.org/new?src=poster-new`

## QR posters (A3 and A4, copy only; art is Branding's)

Live address only. No BMA logo. Use the line in text form.

**Poster A · New to Bangkok** (QR to `/new?src=poster-new`)

> ย้ายมากรุงเทพฯ แล้วยังไม่รู้จักใคร?
> โต๊ะเล็ก ๆ 4 ถึง 6 คน ในที่จริงของเมือง มีเจ้าภาพโต๊ะดูแลทุกโต๊ะ มาคนเดียวได้
>
> New in Bangkok and don't know anyone yet?
> A small table of 4 to 6 at a real city place, with a Table Host at every table. Come on your own.
>
> สแกนเพื่อจองโต๊ะแรก · Scan to book your first table
> jurrgun.apps.sv-academy.org/new
>
> กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ · Small groups. Real Bangkok places. See you there.
> 🏛️ แอปอิสระ มีกรุงเทพมหานครเป็นเจ้าภาพและผู้กำกับดูแล / An independent app, hosted and overseen by the Bangkok Metropolitan Administration

**Poster B · From abroad** (QR to `/international?src=poster-intl`; English first is fine on this one, Thai under it)

> New to Bangkok? Make friends at a real table.
> Small groups of 4 to 6, a Table Host at every table, check-in at the venue. No fluent Thai needed.
>
> มาจากต่างประเทศ? มาเจอเพื่อนใหม่ที่โต๊ะจริง
> กลุ่มเล็ก 4 ถึง 6 คน มีเจ้าภาพโต๊ะทุกโต๊ะ ไม่ต้องพูดไทยคล่องก็มาได้
>
> Scan to start · สแกนเพื่อเริ่ม
> jurrgun.apps.sv-academy.org/international
>
> (tagline and BMA line as on Poster A)

## Weekly readout (template)

One page, sent to Main every Monday after L. Real numbers only; blank until they exist.

```
Jurrgun weekly readout · week of ____ (L+__)

1. Weekly Reconnected Members (north star): ___   target ≥ 60 a week by week 8
   (sat at a table this week with someone they'd met at Jurrgun before)

2. Funnel                              this week   last week   target
   Registration → first RSVP            ___%        ___%       ≥ 40%
   RSVP → check-in                      ___%        ___%       ≥ 70%
   Table fill (RSVPs / seats)           ___%        ___%       ≥ 60%
   Checked in → mutual connection       ___%        ___%       ≥ 50%

3. Safety
   "I felt safe" 4 or 5 out of 5        ___%                   ≥ 90%
   Reports per 100 attendees            ___                    < 1

4. Where people came from (sign-ups and first RSVPs by src, totals of 10+ only)
   top codes: ____  ·  codes under 10: not shown

5. Segment mix (local / newcomer / international, k ≥ 10): ____

6. UGC and creator posts (#เจอกันที่กรุงเทพฯ, if confirmed): ___   target ≥ 50 over the pilot

7. One thing to keep, one to cut, one to try next week.
```

Sources: Staff overview (north star), City Insight (funnel, src, segments), feedback and moderation (safety). The segment split is not built yet (launch plan section 07).
