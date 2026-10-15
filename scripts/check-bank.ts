/**
 * Checks one Bangkok Type quiz bank file (src/vibe/bank/*.ts) against the
 * content rules. Usage:
 *
 *   npx vite-node scripts/check-bank.ts src/vibe/bank/family.ts FAMILY
 *
 * The same rules run over the whole bank in test/bank.test.ts.
 */
import { resolve } from "node:path";
import { checkScenarios } from "../src/vibe/bank-rules";

const [file, name] = process.argv.slice(2);
if (!file || !name) {
  console.error("usage: vite-node scripts/check-bank.ts <file> <EXPORT_NAME>");
  process.exit(2);
}
const mod = await import(resolve(file));
const list = mod[name];
if (!Array.isArray(list)) {
  console.error(`${file} has no array export named ${name}`);
  process.exit(2);
}
const { errors, warnings, districts } = checkScenarios(list, { requireEveryDistrict: true });
const missing = districts.missing;
// Warnings are hints a human should look at (a letter with no word that shows it); they never fail the check.
for (const w of warnings) console.log("WARN", w);
if (errors.length === 0 && missing.length === 0) {
  console.log(`OK: ${list.length} scenarios, ${list.length * 16} answers, all 50 districts used.`);
} else {
  for (const e of errors) console.log("ERROR", e);
  if (missing.length) console.log("MISSING DISTRICTS", missing.join(", "));
  process.exit(1);
}
