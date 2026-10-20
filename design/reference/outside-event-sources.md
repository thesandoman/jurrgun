# Outside event sources (D46, D49)

How Jurrgun may read each source, checked 2026-10-20. The list in code is `src/content/sources.ts`.

## The rule

- **Pasted links:** a page is read once, when a host pastes it, for its own published event description (schema.org Event, Open Graph as a fallback). Its robots.txt must allow JurrgunBot. Only facts are kept: name, a short description, times, place, the page's link and the organiser for the credit. Images and long text are never copied.
- **Link only:** where the terms bar access other than the site's own supported interfaces, or where we couldn't confirm the terms allow reading, the page is never fetched. The link and the source name are kept, and the host types the details.
- **Calendar feeds (iCal):** an admin adds a feed only after checking that source's terms, and writes how in the feed's terms note. Feeds are read once a day by the clock.
- Every card credits its source and links back. Payment always stays at the source.

## What we found

| Source | Pasted page | Feed | Notes |
| --- | --- | --- | --- |
| Luma | link only | yes (published iCal) | Terms: access only through "publicly supported interfaces"; reusing site content needs written permission. Luma documents iCal subscriptions for calendars and city pages, so feeds are the way in. |
| Meetup | link only | admin decides | Terms page could not be read (403 to automated readers); treat as not allowed until confirmed. |
| Ticketmelon | link only | n/a | Terms page not found at /terms; not confirmed. |
| Megatix | link only | n/a | Site refused our connection; not confirmed. |
| Eventpop, ThaiTicketMajor, Eventbrite | link only | n/a | Not checked yet; link only until they are. |
| Facebook, Instagram | link only | n/a | D49: pasted link only. |
| Resident Advisor, Dice, Songkick, Bandsintown | link only | n/a | D49: only where terms allow; link only until a partner agrees. |
| Time Out Bangkok, BK Magazine, Bangkok Post, InterNations | link only | n/a | D49: by agreement and with credit, never copied wholesale. |
| BMA, VisitBangkok, TCDC, Bangkok Design Week, BACC | read | yes | Public bodies publishing their own events. robots.txt still applies. |
| Any other site | read | n/a | robots.txt first. |

Partners (D47) bring their own feed and post with their own key, so their terms are the partnership itself.

To change a source: edit `src/content/sources.ts` and this table together, with the date you checked.
