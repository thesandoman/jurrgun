# SV Map

A ready-made map any app can drop into its pages. It comes from the Sanroo live map,
first reused for BKK Social's Discover page.

**What you get**
- Pins for your things (events, shops, reports…). Things at the same spot share one numbered pin.
- One-tap filter chips, made from your data or listed by you, plus extras like "Free".
- A small key you can fold.
- Tap a pin and a card sheet opens: a bottom sheet on phones, a side panel on wide screens.
- A "my location" button that sorts cards by distance. The location never leaves the device.
- Two map looks: calm grey, light or dark to match the device; or plain streets.
- Thai and English built in; every word can be changed.
- Accessibility: pins are real buttons with spoken labels, Escape closes the sheet and
  focus goes back, a "skip the map" link, and no animation when the device asks for less motion.

**What each app decides:** the data, the colours (CSS variables), the words, and
(optionally) what a card looks like.

No build step and no package to install. MapLibre GL (the free map engine) loads from a
CDN on first use.

## Files

| File | What it is |
|---|---|
| `src/sv-map.js` | The map. `createMap(element, settings)` |
| `src/sv-map.css` | Its look. Change colours with variables |
| `src/places.js` | Helpers: read coordinates from a pasted Google/OSM/Apple map link, distance, "first known position" |
| `presets/bangkok.js` | Bangkok: start point, pan limits, all 50 districts (Thai/English names, OpenStreetMap positions) |
| `demo/index.html` | The same map dressed as two different apps |

## Try the demo

```bash
cd ~/flood/sv-map && python3 -m http.server 8891
```

Then open http://localhost:8891/demo/

## Get it into another project

The code lives at https://github.com/thesandoman/sv-map. Either:

- **Install it** (projects with a `package.json`), then import `sv-map`, `sv-map/places`,
  `sv-map/presets/bangkok` and `sv-map/sv-map.css`:

```bash
npm install github:thesandoman/sv-map
```

- **Or copy** the `src/` and `presets/` folders into the project.

## Use it in a page (3 steps)

1. Copy `src/` (and `presets/` if you're in Bangkok) into the app.
2. Add the stylesheet and an empty box:

```html
<link rel="stylesheet" href="/sv-map/sv-map.css">
<div id="map"></div>
```

3. Start it with your data:

```html
<script type="module">
  import { createMap } from "/sv-map/sv-map.js";
  createMap(document.getElementById("map"), {
    lang: "th",
    points: [
      { id: "1", lat: 13.7314, lng: 100.5414, title: "เดินเล่นสวนลุมพินี", icon: "🚶",
        tags: ["walk"], href: "/events/1", lines: ["ส. 18:00", "Lumphini Park"],
        badges: [{ text: "เหลือ 4 ที่", tone: "ok" }] },
    ],
    tagLabels: { walk: { label: "เดินเล่น", icon: "🚶" } },
  });
</script>
```

## A point

Only `id`, `lat`, `lng` and `title` are required.

| Field | Meaning |
|---|---|
| `icon` | Emoji or 1–3 characters in the pin |
| `image` | Picture in the card |
| `href` | The card links here |
| `lines` | Short lines under the title (date, place…) |
| `badges` | `[{ text, tone }]`, where tone is `ok`, `warn`, `accent` or `muted` |
| `tags` | What the chips filter on |
| `precision` | `"area"` draws a dashed pin and says "approximate", for when you only know the district |
| `highlight` | Gold pin with a ✓ (e.g. "you're going", "my report") |
| `muted` | Faded pin (e.g. full or closed) |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `points` | `[]` | The things to show |
| `lang` | page language | `"th"` or `"en"` |
| `messages` | built-in | Change any word, e.g. `{ all: "ทุกอย่าง" }` |
| `center`, `zoom` | Bangkok, 10.6 | Where the map starts before points arrive |
| `panLimit` | none | Keep the map inside a box (`BANGKOK_PAN_LIMIT`) |
| `basemap` | `"auto"` | `"light"`, `"dark"`, `"streets"`, or `{ tiles: [...], attribution }` |
| `chips` | `"auto"` | From the points' tags (most common first), a list `[{value,label,icon}]`, or `false` |
| `tagLabels` | none | Names and icons for tags in auto chips |
| `extraChips` | none | Chips with their own rule: `[{ value: "free", label: "ฟรี", icon: "💸", test: p => p.free }]` |
| `legend` | exact · area · mine | `[{ kind: "exact"\|"area"\|"highlight"\|"swatch", label, color }]` or `false` |
| `nearMe` | `true` | Show the "my location" button |
| `renderCard` | built-in card | `(point, ctx) => html`. Escape your values with `ctx.esc` |
| `groupTitle` | "N here" | Sheet title when several points share a spot |
| `skipHref` | none | Where "skip the map" goes (your list view) |
| `overlays` | none | Extra GeoJSON layers: `[{ id, type: "circle"\|"line"\|"fill", data, paint }]` |
| `onSelect`, `onFilter` | none | Called when a pin is opened / the visible points change |
| `maplibregl` | from CDN | Pass your own MapLibre GL module if the app bundles one |

`createMap` gives back `{ map, setPoints, setFilter, select, close, destroy }`:
- `setPoints(list)` after the person changes a search;
- `select(id)` to open one card;
- `map` is the raw MapLibre map, for anything this template doesn't cover.

## Make it look like your app

Set CSS variables on the map's box. Only these change between apps:

```css
#map {
  --svm-brand: #2563eb;      /* pins, active chip */
  --svm-highlight: #dc2626;  /* "mine" pins */
  --svm-radius: 6px;         /* corners */
  --svm-height: 70vh;        /* map height */
  --svm-font: "Your Font", sans-serif;
}
```

Also available: `--svm-surface`, `--svm-surface-2`, `--svm-ink`, `--svm-muted`,
`--svm-line`, `--svm-focus`, `--svm-ok` / `--svm-warn` (+ `-soft`). Dark mode follows the
device; force it with `data-theme="dark"` or `"light"` on the box.

## Placing things you don't have coordinates for

Many apps store an address, a map link or a district, not coordinates. `placeFor` tries
your sources in order and never guesses:

```js
import { coordsFromMapUrl, placeFor } from "./places.js";
import { BANGKOK_BOUNDS, bangkokDistrict } from "../presets/bangkok.js";

const place = placeFor(item, [
  ["exact", (x) => coordsFromMapUrl(x.mapUrl, BANGKOK_BOUNDS)],
  ["area",  (x) => { const d = bangkokDistrict(x.district); return d && [d.lat, d.lng]; }],
]);
// place = { lat, lng, precision } or null: list nulls under the map instead of guessing.
```

Short `maps.app.goo.gl` links hold no coordinates; ask for the full Google Maps link.

## Recipes

**Server-rendered pages (Hono, Express…).** Put the points into the page as JSON, then
start the map from it. Escape `<` so the JSON can't end the script tag:

```html
<script type="application/json" id="points">${JSON.stringify(points).replace(/</g, "\\u003c")}</script>
<script type="module">
  import { createMap } from "/sv-map/sv-map.js";
  createMap(document.getElementById("map"), { points: JSON.parse(document.getElementById("points").textContent) });
</script>
```

**React.**

```jsx
const box = useRef(null);
const mapRef = useRef(null);
useEffect(() => {
  createMap(box.current, { points }).then((m) => (mapRef.current = m));
  return () => mapRef.current?.destroy();
}, []);
useEffect(() => { mapRef.current?.setPoints(points); }, [points]);
return <div ref={box} />;
```

It's safe if React runs the effect twice: the newest map wins.

## Privacy

The map shows only what you put in `points`. Keep people's names, phone numbers and
other personal data out of `points`: anything in them reaches the browser. "My location"
is used in the browser only and never sent.

## Tests

```bash
cd ~/flood/sv-map && npm test
```

## Credits

Map engine: MapLibre GL (BSD). Basemap tiles: Esri, HERE, Garmin and OpenStreetMap
contributors. Bangkok district positions: OpenStreetMap (ODbL).

## License

MIT, see [LICENSE](LICENSE). The map engine and map data keep their own licences (above).
