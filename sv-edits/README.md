# Jurrgun brand kit (SV Edits)

Built 16 Oct 2026 with the SV Edits skill (photo 0.5.0, vector 0.5.0) and SV Blender on Blender 5.2.2, from the app's own brand (`src/ui/brand.tsx`, `src/ui/warm.ts`) with the natural-thumb mark (e570540). `brand.json` lists every colour and font with its source. Colours follow the app palette of 17 Oct 2026 (`src/ui/palette.ts`): green acts, cream is only the page, mango only for My events and warnings, Chao Phraya sky for info and the river, canal teal for food and nights, love red only for dating mode. Coral is retired. Since 26 Oct 2026: teal-200 `#8ff2ea` is the second headline line ("แล้วเจอกันนะ") on green outdoor ads instead of mango, and dark-mode dating text uses `#ff6b74` so it reads red, not pink.

| Folder | What |
| --- | --- |
| `logo/` | The mark and its reversed version; lockups light and dark (`.ai`, SVG, PDF, EPS, PNG) |
| `guide/` | One-page A3 brand guide (`.ai`, PDF, PNG) |
| `icons/` | App icons 1024, 512, 192; Apple touch icon 180; favicons 32 and 16; `favicon.svg` |
| `designs/` | Layered PSDs with live type: billboard 8:3, A1 poster, lightbox, MRT 2:1, highway 3:1, LED 16:9 |
| `billboards/` | One layered PSD and PNG per scene: the design is a smart object placed by its four corners, with Blender's light on top |
| `scenes-collage-morning.png` | One morning image per scene: the reference for a future brand video |

Scripts: `guide.py` builds the brand guide; `jurrgun-scenes.py` builds the MRT, highway and bus shelter scenes; `relight.py` makes morning and night copies of an SV Blender scene; `place.py` places designs onto a rendered scene as a layered PSD; `render-relit.sh` and `render-queue4.sh` are the render runs used.

26 Oct 2026 refresh to the 17 Oct palette (Branding signed off): the headline line "แล้วเจอกันนะ" is teal-200 `#8ff2ea` instead of mango, the poster's disc is sky-100 `#e3f2fc`, its screen is the current Discover view and its label reads "ข้อมูลตัวอย่างสมมติ · Fictional demo data"; the six morning scenes carry the new designs. `collage.py` rebuilds `scenes-collage-morning.png` from them (ffmpeg, 3 x 2, 2944x1128).

Four Bangkok morning scenes for the brand video (owner, 26 Oct; Branding signed off): `bangkok-scenes.py` builds Lumphini Park (notice board with the A1 poster; an empty table of five, the slot for a later actors' shot), tuk-tuks at Sanam Luang (back panel; the Grand Palace is an unbranded backdrop), a Talat Noi alley (wall print) and a motorbike-taxi stand (stand sign), each with one design face named AdFace for SV Blender's own-.blend route. Layered results: `billboards/bkk-<scene>-morning.psd` and `.png`.

Not committed: the Blender scene files and render passes (`scenes*/`), the BMA font files (`fonts/`, ask the owner), and the zip. Fonts: Sao Chingcha (headings) and Anuphan (body), from the BMA.
