# sv-map, vendored

Copied from github.com/thesandoman/sv-map at commit 9fac25925dff817c0d221ba98cdb02b283b83438
(version 1.0.0, MIT, see LICENSE) on 2026-10-27, so builds no longer depend on a
personal GitHub repo staying public (Privacy & Security, supply-chain item).

- The server imports `src/places.js` and `presets/bangkok.js` directly (src/lib/places.ts),
  typed by the `.d.ts` files beside them (ours, not upstream).
- The browser files `src/sv-map.js` and `src/sv-map.css` are bundled into
  src/vendor/sv-map.generated.ts by `npm run svmap`.

To update: replace the files here with a new release (keep the .d.ts files and this note,
update the commit above), then run `npm run svmap` and the vendor test.
