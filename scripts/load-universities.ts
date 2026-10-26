/**
 * One-time (re-runnable) load of the university list into the deployed
 * database's social_universities table (Core Platform C3, migration 0029).
 * The list lives in scripts/data/universities.json, outside src/, so it never
 * goes into the Worker bundle.
 *
 *   svcloud secrets set jurrgun SETUP_KEY          (paste a random value)
 *   SETUP_URL=https://jurrgun.apps.sv-academy.org SETUP_KEY=<same value> \
 *     npx vite-node scripts/load-universities.ts
 *   svcloud secrets remove jurrgun SETUP_KEY
 *
 * Locally: SETUP_URL=http://localhost:8787 with SETUP_KEY in .dev.vars.
 */
import { readFileSync } from "node:fs";
import { buildUniversities } from "../src/content/universities";

const base = process.env.SETUP_URL;
const key = process.env.SETUP_KEY;
if (!base || !key) throw new Error("set SETUP_URL and SETUP_KEY");
const raw = JSON.parse(readFileSync(new URL("./data/universities.json", import.meta.url), "utf8")) as [string, string][];
const rows = buildUniversities(raw).map((u) => ({ id: u.id, name: u.name, cc: u.cc, nameTh: u.th ?? null, search: u.search, thFold: u.thFold ?? null }));

const post = async (batch: unknown[]) => {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/setup/universities`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-setup-key": key },
    body: JSON.stringify({ rows: batch }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { upserted: number; labelled: number | null; total: number };
};

for (let i = 0; i < rows.length; i += 1000) {
  const r = await post(rows.slice(i, i + 1000));
  console.log(`rows ${i + 1}-${i + r.upserted}: ok (table now ${r.total})`);
}
const done = await post([]);
console.log(`done: ${done.total} universities in the table, ${done.labelled ?? "?"} bios labelled in the final pass`);
