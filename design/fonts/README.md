# Brand fonts: the BMA type system

From the BMA type system sheet (`BMA_Type system.pdf`, supplied by the owner on 2026-10-15):

| Role | Typeface | Files here | Licence |
|---|---|---|---|
| Headings | Sao Chingcha (เสาชิงช้า), BMA's custom typeface | `saochingcha-400`, `-700` | Bangkok Metropolitan Administration; embedding allowed (OS/2 fsType 8) |
| Subheadings, UI labels, buttons and body text | Anuphan (Cadson Demak) | `anuphan-400`, `-500`, `-600`, `-700` | SIL Open Font License 1.1 |
| The "easier to read" accessibility font | Atkinson Hyperlegible (Braille Institute) | `atkinson-400`, `-700` (Latin), `atkinson-ext-400`, `-700` (Latin Extended) | SIL Open Font License 1.1, see `OFL-atkinson-hyperlegible.txt` |

The sheet sets body text in TH Sarabun New. We use Anuphan instead: Sarabun New
reads as an official document on screen and draws small (x-height 0.34 em
against Anuphan's 0.57). Decided 2026-10-15.

Each covers Thai and basic Latin. The files are WOFF2, subset to Latin-1, Thai
and general punctuation with every OpenType feature kept (Thai mark placement
needs them):

```bash
pyftsubset SOURCE.otf --unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+0E00-0E7F,U+2000-206F,U+20AC,U+20BF,U+2122,U+2190-2193,U+2212,U+25CC,U+FEFF,U+FFFD" \
  --layout-features='*' --flavor=woff2 --no-hinting --desubroutinize --output-file=design/fonts/NAME.woff2
npm run fonts   # rebuilds src/vendor/fonts.generated.ts
```

They are served by the Worker at `/fonts/NAME.HASH.woff2` (see `src/ui/fonts.ts`),
not through `design/assets/`: that route redirects to storage on another origin,
and fonts loaded across origins need CORS headers.

## Atkinson Hyperlegible (self-hosted since 2026-10-27, card S2)

The files are unchanged from `@fontsource/atkinson-hyperlegible` 5.3.0
(`files/atkinson-hyperlegible-latin[-ext]-{400,700}-normal.woff2`), renamed. They
are not re-subset: the Latin and Latin Extended split, with `unicode-range` in
`src/ui/fonts.ts`, means a browser fetches them only when the setting is on and
the text needs them. Before this, the font came from Google Fonts on every page.
