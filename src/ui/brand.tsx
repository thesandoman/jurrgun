/**
 * Jurrgun (เจอกัน): "see you" / "see you later" in Thai.
 * The mark: a minimal waving hand, "see you!"
 */

export const BRAND = { name: "Jurrgun", th: "เจอกัน", meaning: { th: "เจอกัน = แล้วเจอกันนะ", en: "Jurrgun (เจอกัน) means “see you later” in Thai" } };

/** The mark as an SVG string (app icon, manifest). */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#16a34a"/><g fill="#ffffff" transform="rotate(-20 32 38)"><rect x="21.5" y="31" width="23" height="21" rx="9.5"/><rect x="21.5" y="16" width="5.6" height="24" rx="2.8"/><rect x="27.6" y="12.5" width="5.6" height="27" rx="2.8"/><rect x="33.7" y="13.5" width="5.6" height="26" rx="2.8"/><rect x="39.6" y="18" width="5.2" height="21" rx="2.6"/><rect x="20.2" y="31.5" width="6" height="18" rx="3" transform="rotate(-36 23.2 47.5)"/></g><path d="M47 10.5q6 3.5 7.5 10.5M44.5 15q3 2 4 5.5" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".9"/></svg>`;

export function BrandMark() {
  return <span class="brand-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARK_SVG }} />;
}
