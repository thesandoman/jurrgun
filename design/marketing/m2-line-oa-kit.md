DRAFT, held for the owner's OK. Nothing here is published.

# M2 · LINE OA kit (LINE first)


*Marketing, 2026-10-26. Nothing is created until the owner says so. Dates are relative to launch day (L). Links use the codes in `m4-link-register.md`.*

## Profile

**Display name:** Jurrgun เจอกัน

**Status message (bio, short):**
> กลุ่มเล็ก สถานที่จริง แล้วเจอกันนะ · Small groups. Real Bangkok places. See you there.

**Profile description:**
> หาเพื่อนใหม่ในกรุงเทพฯ แบบไม่ต้องปัดไม่ต้องไถ นั่งโต๊ะเล็ก ๆ 4 ถึง 6 คน ในที่จริงของเมือง มีเจ้าภาพโต๊ะดูแล เช็กอินที่ร้าน และรายงานได้ทุกเมื่อ
> Make friends in Bangkok without swiping. Sit at a small table of 4 to 6 at a real city place, with a Table Host, check-in at the venue, and reporting any time.
> 🏛️ แอปอิสระ มีกรุงเทพมหานครเป็นเจ้าภาพและผู้กำกับดูแล / An independent app, hosted and overseen by the Bangkok Metropolitan Administration

## Greeting message (sent once, when someone adds the OA)

> สวัสดี ยินดีที่ได้เจอนะ 👋
> Jurrgun พาคุณไปนั่งโต๊ะเล็ก ๆ กับคนใหม่ ในที่จริงของกรุงเทพฯ มาคนเดียวได้ โต๊ะนี้ทำมาเพื่อคนที่มาคนเดียว
> เริ่มที่นี่: jurrgun.apps.sv-academy.org/new?src=line-greeting
>
> Hi, good to meet you 👋
> Jurrgun gets you to a small table with new people at a real Bangkok place. Come on your own; tables are made for that.
> Start here: jurrgun.apps.sv-academy.org/new?src=line-greeting
>
> เราจะส่งข้อความแค่ตอนมีโต๊ะใหม่ใกล้คุณ หรือก่อนวันนัด ไม่ส่งช่วง 3 ทุ่มถึง 8 โมงเช้า
> We only message about new tables or the day before yours. Never between 21:00 and 08:00.

## Rich menu (4 tiles, each leads to a table)

| Tile | Thai label | English label | Link |
|---|---|---|---|
| 1 | โต๊ะสัปดาห์นี้ | Tables this week | `/new?src=line-rich-tables` |
| 2 | เพิ่งย้ายมากรุงเทพฯ | New to Bangkok | `/new?src=line-rich-new` |
| 3 | มาจากต่างประเทศ | From abroad | `/international?src=line-rich-intl` |
| 4 | ทำควิซ หาโต๊ะแรก | Quiz to your first table | `/quiz?src=line-rich-quiz` |

- No "news", "rewards" or feed tiles. Every tile ends at a table.
- Tile 4 goes straight to `/quiz`: since 459c806 it records the code, also when a signed-out visitor is sent to sign in first.
- Tiles 1 and 2 share `/new` for now. If Website adds a "this week" anchor on `/new`, point tile 1 at it.

## Broadcasts (short set; none outside 08:00 to 21:00)

**Launch eve, L-1, 19:00**
> พรุ่งนี้ โต๊ะแรกของคุณ 🍽️
> มาคนเดียวได้ โต๊ะนี้ทำมาเพื่อคนที่มาคนเดียว ทุกโต๊ะมีเจ้าภาพโต๊ะ เช็กอินที่ร้าน จองโต๊ะใกล้บ้าน 👉 jurrgun.apps.sv-academy.org/new?src=line-bc-eve
>
> Your first table, tomorrow 🍽️
> Come on your own; tables are made for that. Every table has a Table Host and check-in at the venue. Book one near you 👉 jurrgun.apps.sv-academy.org/new?src=line-bc-eve

**Day-before reminder (only for people with a seat; the app's own reminder may cover this, see D43)**
> พรุ่งนี้เจอกันนะ เปิดบัตรเข้าโต๊ะในแอป ดูทางไปร้านได้เลย ถ้าไปไม่ได้ ยกเลิกในแอป ที่นั่งจะได้ไปถึงคิวสำรอง
>
> See you tomorrow. Your pass and directions are in the app. Can't make it? Cancel in the app so the seat goes to the waitlist.

**New tables near you (at most once a week)**
> โต๊ะใหม่สัปดาห์นี้ที่ [ย่าน] มีที่ว่าง [ดูโต๊ะ]
> New tables this week in [area]. Seats open. [See tables]

Rules: no countdowns, no "last chance", no streaks, at most one broadcast a week outside launch week. Open to something more events never appear in broadcasts (D43: no event titles for them).

**Note:** the D43 reminders already go out in the app and by Web Push. LINE broadcasts shouldn't duplicate them: once the OA exists, check with UI/UX whether LINE replaces Web Push for people who follow the OA, or skips the reminder.

## Handle shortlist (unchecked: availability not looked up)

| Platform | 1st | 2nd | 3rd |
|---|---|---|---|
| LINE OA | @jurrgun (premium ID, paid) | @jurrgunbkk (premium ID) | free basic ID (random, like @123abcd) |
| Instagram | @jurrgun (a new, separate brand account) | @jurrgun.bkk | @jurrgun_th |
| TikTok | @jurrgun | @jurrgunbkk | @jurrgun.th |
| Facebook page | /jurrgun | /jurrgunbkk | /jurrgun.th |

**Instagram (owner, 2026-10-26):** Jurrgun gets its own new @jurrgun account, and creating it still needs the owner's OK. The owner's personal account @sandosit is left out of everything: no posts, no metrics, no founder post.

A free LINE OA gets a random basic ID. A readable ID like @jurrgun is a paid premium ID. **Owner question (through Main):** reserve the handles now, before a launch date, so nobody else takes them?
