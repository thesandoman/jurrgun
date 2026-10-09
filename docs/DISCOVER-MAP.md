# Discover map

Discover (`/events`) is a full-screen map modelled on the Sanroo live map: a ticker
(Bangkok rain, feels-like heat and PM2.5 from Open-Meteo, cached 15 min; then this
week's events, the next one, what's filling up, a Learn tip, the prototype notice), a
floating header (logo, search, Aa text size, language), a status card, Filters and
category chips, right-hand tools (Ask, Map style, Quests, Saved, Me), the key, an
Events sheet over the map, and the big centre "My events" button in the tab bar.
It opens on the map, with the same events listed in the sheet (same
filters, same members-only access). The map shows even when nothing matches, with an
empty list below. **🗺️ Map / ☰ List** switches to a list-only view and keeps the filters.
Without JavaScript, or if the map can't load, the list is still there.

The map itself is the **`sv-map`** package (github:thesandoman/sv-map), pinned to a
commit in `package.json`. Its browser files are bundled into the app by
`npm run svmap` (→ `src/vendor/sv-map.generated.ts`) and served at `/vendor/sv-map.js`
and `/vendor/sv-map.css`; `test/vendor.test.ts` fails if the bundle is stale. Server
side, `src/lib/places.ts` uses the package's map-link reader, `placeFor` and Bangkok
district preset. To update: change the commit in `package.json`, `npm install`,
`npm run svmap`, `npm test`.

It is the map from the Sanroo live map (floodmap.apps.sv-academy.org), carried over
and changed for BKK Social.

## What came across, and what it became

| Sanroo | BKK Social |
|---|---|
| MapLibre GL 6.11.2, calm grey Esri basemap | Same; dark grey tiles in dark mode |
| Layer chips (flood, SOS, traffic…) | Category chips from the events on screen (up to 8) + Free; one tap filters the pins |
| Flood reports, sensors, hazards | Published events only |
| Legend you can fold | Key: exact place · district area · my events (starts folded on phones) |
| Bottom sheet for what you tapped | Event cards: date, venue, district, spots left, cost, your own RSVP |
| "Me" button, location kept on the phone | Same: shows you on the map and sorts the sheet by distance; never sent to the server |
| Keyboard, Escape, reduced motion | Pins are buttons with a spoken label, Escape closes the sheet and focus goes back, no animation with reduced motion, "skip the map" link |

Left out on purpose: warnings, ticker, live feeds, traffic, read-aloud and the
accessibility panel (the app has its own settings), and anything about people.

## Where a pin goes (`src/lib/places.ts`)

Events have a district, a venue name and an optional map link, not coordinates, and
the schema stays as it is. Each event gets a point from, in order:

1. **Exact:** coordinates in the map link (`@lat,lng`, `!3d…!4d…`, `?q=lat,lng`,
   OpenStreetMap `mlat`/`mlon` or `#map=`), only when inside Bangkok.
2. **Route:** the start of its VisitBangkok route (OpenStreetMap; Baan Silapin isn't
   mapped, so that route falls through to its district).
3. **Area:** the district office (OpenStreetMap). Drawn as a dashed pin and labelled
   "district area — address on the event page", never as the venue.

Wang Thonglang's office isn't in OpenStreetMap, so an event there without a map link
has no pin and is listed under "Not on the map yet" instead of being guessed.

**For staff:** paste a full Google Maps link (one with `@lat,lng`). Short
`maps.app.goo.gl` links carry no coordinates, so those events show at district level.

## Privacy

The page sends only what an event card already shows. No attendee names, counts
beyond "spots left", or anyone else's RSVP. Your own RSVP shows only to you. Your
location stays in the browser.

## Tests

`test/places.test.ts` (map links, the fallback order, every district and route
covered and inside Bangkok) and the map case in `test/events.integration.test.ts`.
