/**
 * One command to tell whether the app is healthy:
 *
 *   npm run check            type check, tests, bundle, assets, live smoke test
 *   npm run check -- --local everything except the live smoke test
 *
 * Exits non-zero on the first broken step, with a short summary. Used by the
 * nightly bug-hunting agent and by anyone before pushing to main (which
 * deploys). The live smoke test only reads public pages and checks that
 * signed-in pages redirect; it never signs in or writes anything.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIVE = process.env.CHECK_URL ?? "https://jurrgun.apps.sv-academy.org";
const local = process.argv.includes("--local");

const results = [];
function run(name, cmd, args) {
  process.stdout.write(`\n▶ ${name}\n`);
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) });
  return r.status === 0;
}

async function smoke() {
  process.stdout.write(`\n▶ live smoke test (${LIVE})\n`);
  const expect = [
    ["/api/health", 200], ["/login", 200], ["/signup", 200], ["/faq", 200], ["/learn", 200],
    ["/privacy", 200], ["/terms", 200], ["/types", 200], ["/offline", 200], ["/manifest.webmanifest", 200],
    ["/sw.js", 200], ["/events", 302], ["/settings", 302], ["/notifications/panel", 302],
    ["/universities/search?q=chula", 302], ["/does-not-exist", 404],
  ];
  let ok = true;
  for (const [path, want] of expect) {
    let got;
    try {
      got = (await fetch(LIVE + path, { redirect: "manual" })).status;
    } catch (e) {
      got = `error: ${e.message}`;
    }
    const pass = got === want;
    ok &&= pass;
    console.log(`${pass ? "  ✓" : "  ✗"} ${path} → ${got}${pass ? "" : ` (expected ${want})`}`);
  }
  results.push({ name: "live smoke test", ok, secs: "-" });
  return ok;
}

const steps = [
  () => run("type check", "npx", ["tsc", "--noEmit"]),
  () => run("tests", "npx", ["vitest", "run"]),
  () => run("design assets manifest", "node", ["scripts/assets-manifest.mjs", "--check"]),
  () => run("bundle (dry-run deploy)", "npx", ["wrangler", "deploy", "--dry-run", "--outdir", mkdtempSync(join(tmpdir(), "jurrgun-check-"))]),
];
let failed = false;
for (const step of steps) if (!step()) { failed = true; break; }
if (!failed && !local) failed = !(await smoke());

console.log("\n──────── check summary ────────");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.secs !== "-" ? ` (${r.secs}s)` : ""}`);
console.log(failed ? "\nFAILED" : "\nAll good.");
process.exit(failed ? 1 : 0);
