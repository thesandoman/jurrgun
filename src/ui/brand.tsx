/**
 * Jurrgun (เจอกัน): "see you" / "see you later" in Thai.
 * The mark: two friends meeting (two overlapping circles) and a smile.
 */

export const BRAND = { name: "Jurrgun", th: "เจอกัน", meaning: { th: "เจอกัน = แล้วเจอกันนะ", en: "Jurrgun (เจอกัน) means “see you later” in Thai" } };

/** The mark as an SVG string (app icon, manifest). */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c8a45"/><stop offset=".6" stop-color="#22c55e"/><stop offset="1" stop-color="#a3e635"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#g)"/><circle cx="25" cy="27" r="12" fill="#ffffff"/><circle cx="39" cy="27" r="12" fill="#ecfccb" fill-opacity=".92"/><path d="M21 44q11 9 22 0" stroke="#ffffff" stroke-width="4.5" fill="none" stroke-linecap="round"/></svg>`;

export function BrandMark() {
  return <span class="brand-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARK_SVG.replace('id="g"', 'id="jg-mark"').replace("url(#g)", "url(#jg-mark)") }} />;
}
