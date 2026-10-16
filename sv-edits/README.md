# Jurrgun brand kit (SV Edits)

Built 16 Oct 2026 with the SV Edits skill (photo 0.5.0, vector 0.5.0) and SV Blender on Blender 5.2.2, from the app's own brand (`src/ui/brand.tsx`, `src/ui/warm.ts`) with the natural-thumb mark (e570540). `brand.json` lists every colour and font with its source.

| Folder | What |
| --- | --- |
| `logo/` | The mark and its reversed version; lockups light and dark (`.ai`, SVG, PDF, EPS, PNG) |
| `guide/` | One-page A3 brand guide (`.ai`, PDF, PNG) |
| `icons/` | App icons 1024, 512, 192; Apple touch icon 180; favicons 32 and 16; `favicon.svg` |
| `designs/` | Layered PSDs with live type: billboard 8:3, A1 poster, lightbox, MRT 2:1, highway 3:1, LED 16:9 |
| `billboards/` | One layered PSD and PNG per scene: the design is a smart object placed by its four corners, with Blender's light on top |
| `scenes-collage-morning.png` | One morning image per scene: the reference for a future brand video |

Scripts: `jurrgun-scenes.py` builds the MRT, highway and bus shelter scenes; `relight.py` makes morning and night copies of an SV Blender scene; `place.py` places designs onto a rendered scene as a layered PSD; `render-relit.sh` and `render-queue4.sh` are the render runs used.

Not committed: the Blender scene files and render passes (`scenes*/`), the BMA font files (`fonts/`, ask the owner), and the zip. Fonts: Sao Chingcha (headings) and Anuphan (body), from the BMA.
