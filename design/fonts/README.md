# Brand fonts: the BMA type system

From the BMA type system sheet (`BMA_Type system.pdf`, supplied by the owner on 2026-10-15):

| Role | Typeface | Files here | Licence |
|---|---|---|---|
| Headings | Sao Chingcha (เสาชิงช้า), BMA's custom typeface | `saochingcha-400`, `-700` | Bangkok Metropolitan Administration; embedding allowed (OS/2 fsType 8) |
| Subheadings, UI labels, buttons | Anuphan (Cadson Demak) | `anuphan-400`, `-500`, `-600`, `-700` | SIL Open Font License 1.1 |
| Body text | TH Sarabun New (SIPA national font) | `sarabunnew-400`, `-400i`, `-700` | GPL with font exception |

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
