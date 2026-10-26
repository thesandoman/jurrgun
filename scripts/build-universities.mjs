/**
 * Turns the open universities list into scripts/data/universities.json, which
 * scripts/load-universities.ts loads into the social_universities table (the
 * list is not bundled into the Worker; Core Platform C3).
 *
 * Source: github.com/Hipo/university-domains-list (MIT licence),
 * file world_universities_and_domains.json. Download it, then:
 *
 *   node scripts/build-universities.mjs path/to/world_universities_and_domains.json
 *
 * Thai additions and Thai-language names live in src/content/universities.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-universities.mjs <world_universities_and_domains.json>");
const raw = JSON.parse(readFileSync(src, "utf8"));
const seen = new Set();
const rows = [];
for (const u of raw) {
  const name = String(u.name ?? "").replace(/\s+/g, " ").replace(/ [–—] /g, " - ").replace(/[–—]/g, "-").trim();
  const cc = String(u.alpha_two_code ?? "").toUpperCase();
  if (!name || !/^[A-Z]{2}$/.test(cc)) continue;
  const key = `${cc}|${name.toLowerCase()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push([name, cc]);
}
rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
writeFileSync(new URL("./data/universities.json", import.meta.url), JSON.stringify(rows) + "\n");
console.log(`wrote scripts/data/universities.json (${rows.length} universities). Then run scripts/load-universities.ts to update the database.`);
