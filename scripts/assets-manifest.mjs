#!/usr/bin/env node
/**
 * Generates `src/assets.ts` from the contents of `design/assets/`.
 *
 *   npm run assets          rewrite src/assets.ts from the folder
 *   npm run assets:check    fail if src/assets.ts is stale, or a file is too big
 *   npm run assets:local    copy design/assets into your LOCAL dev storage
 *
 * Managed by SV Cloud — the deploy pipeline runs `assets:check` and uploads
 * this same file list to your project's storage. Editing this script will not
 * change what gets uploaded, but it will make your local check disagree with CI.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_DIR = join(ROOT, "design", "assets");
const MANIFEST_PATH = join(ROOT, "src", "assets.ts");

/**
 * Must stay in step with the platform's own allowlist — the deploy step refuses
 * to upload anything outside it, so a file accepted here but rejected there
 * would fail your build rather than your check.
 */
const ALLOWED_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico",
  "mp4", "webm", "mov", "mp3", "wav", "pdf", "woff2",
];

/** Same mapping the deploy step gets from `file --mime-type` on the runner. */
const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  woff2: "font/woff2",
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Every file under design/assets, as forward-slash paths relative to it. */
function collect(dir = ASSETS_DIR) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // folder deleted — an empty manifest is the correct answer
  }
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // Dotfiles are tooling, not assets: .gitkeep, .DS_Store, Thumbs.db.
    if (entry.name.startsWith(".") || entry.name === "Thumbs.db") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (entry.isFile()) found.push(relative(ASSETS_DIR, full).split(sep).join("/"));
  }
  return found.sort();
}

/**
 * The real size of an asset, in bytes.
 *
 * A file tracked by Git LFS is only its pointer text on disk unless the bytes
 * have been fetched — and CI deliberately does not fetch the ones a commit did
 * not touch, so `statSync` there reports ~130 bytes for a 40 MB video. The
 * pointer carries the true size on its own `size` line; read that instead, so
 * the limits below mean the same thing on your machine and on the runner.
 */
function realSize(fullPath) {
  const { size } = statSync(fullPath);
  // A pointer is a few short lines. Anything larger is the real file.
  if (size > 1024) return size;
  const buffer = Buffer.alloc(size);
  const fd = openSync(fullPath, "r");
  try {
    readSync(fd, buffer, 0, size, 0);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString("utf8");
  if (!text.startsWith("version https://git-lfs.github.com/spec/v1")) return size;
  const match = text.match(/^size (\d+)$/m);
  return match ? Number(match[1]) : size;
}

function validate(paths) {
  let total = 0;
  for (const path of paths) {
    const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      fail(
        `design/assets/${path} is not a supported asset type.\n` +
          `  Supported: ${ALLOWED_EXTENSIONS.join(", ")}\n` +
          `  Design source files and mockups belong in design/reference/ instead.`,
      );
    }
    const size = realSize(join(ASSETS_DIR, path));
    if (size > MAX_FILE_BYTES) {
      fail(
        `design/assets/${path} is ${mb(size)} — the limit is ${mb(MAX_FILE_BYTES)} per file.\n` +
          `  Compress it (a short hero video should be a few MB, not hundreds) or\n` +
          `  host it elsewhere and link to it.`,
      );
    }
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) {
    fail(
      `design/assets/ is ${mb(total)} in total — the limit is ${mb(MAX_TOTAL_BYTES)}.\n` +
        `  Remove what the app does not actually serve, or compress the largest files.`,
    );
  }
  return total;
}

/**
 * The first segment of an asset's address: a short hash of its CONTENTS.
 *
 * This is what makes uploading safe. A file that changes gets a new address, so
 * nothing is ever overwritten and the version of your app that was built
 * against the old one keeps working — which is also what makes rolling back
 * work at all.
 *
 * A file stored with Git LFS carries its own sha256 on the pointer's `oid`
 * line, so the hash costs nothing even when the real bytes have not been
 * downloaded — the same trick `realSize` above uses to read the true size.
 */
function contentHash(fullPath) {
  const { size } = statSync(fullPath);
  if (size <= 1024) {
    const buffer = Buffer.alloc(size);
    const fd = openSync(fullPath, "r");
    try {
      readSync(fd, buffer, 0, size, 0);
    } finally {
      closeSync(fd);
    }
    const text = buffer.toString("utf8");
    if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
      const match = text.match(/^oid sha256:([0-9a-f]{64})$/m);
      if (match) return match[1].slice(0, 12);
    }
  }
  return createHash("sha256").update(readFileSync(fullPath)).digest("hex").slice(0, 12);
}

function render(paths) {
  // `{}` rather than `{\n\n}` when empty, so a fresh repo's committed file is
  // byte-identical to what `--check` regenerates.
  const body =
    paths.length === 0
      ? "{}"
      : `{\n${paths
          .map(
            (p) =>
              `  ${JSON.stringify(p)}: "/assets/${contentHash(join(ASSETS_DIR, p))}/${p}",`,
          )
          .join("\n")}\n}`;
  return `// GENERATED by \`npm run assets\` — do not edit by hand.
//
// One entry per file in design/assets/. Import \`asset\` rather than writing the
// URL as a string: the type is built from this list, so a typo is a typecheck
// error on your machine instead of a broken image in your demo.
//
//   import { asset } from "./assets";
//   \`<img src="\${asset("logo.svg")}" alt="Our logo" />\`
//
// Add a file to design/assets/, run \`npm run assets\`, and commit both.

export const assets = ${body} as const;

/** Every asset path available to this app, e.g. \`"logo.svg"\` or \`"icons/cart.svg"\`. */
export type AssetPath = keyof typeof assets;

/** The URL your app serves \`path\` from. See the \`/assets/*\` route in index.ts. */
export function asset(path: AssetPath): string {
  return assets[path];
}
`;
}

/** Reads bucket_name out of wrangler.toml — only needed for --seed-local. */
function localBucketName() {
  const toml = readFileSync(join(ROOT, "wrangler.toml"), "utf8");
  const match = toml.match(/^\s*bucket_name\s*=\s*"([^"]+)"/m);
  if (!match) fail("Could not find bucket_name in wrangler.toml.");
  return match[1];
}

function seedLocal(paths) {
  if (paths.length === 0) {
    console.log("design/assets/ is empty — nothing to copy into local storage.");
    return;
  }
  const bucket = localBucketName();
  for (const path of paths) {
    // Same content-addressed key the deployed app asks for, so local dev and
    // production resolve an asset the same way.
    const key = `assets/${contentHash(join(ASSETS_DIR, path))}/${path}`;
    console.log(`  → ${key}`);
    const ext = path.split(".").pop().toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    execFileSync(
      "npx",
      [
        "wrangler", "r2", "object", "put", `${bucket}/${key}`,
        "--file", join(ASSETS_DIR, path),
        "--content-type", contentType,
        "--local",
      ],
      { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT },
    );
  }
  const first = `/assets/${contentHash(join(ASSETS_DIR, paths[0]))}/${paths[0]}`;
  console.log(`\nCopied ${paths.length} file(s). Run \`npm run dev\` and open ${first}`);
}

const mode = process.argv[2] ?? "";
const paths = collect();
const totalBytes = validate(paths);
const generated = render(paths);

if (mode === "--seed-local") {
  seedLocal(paths);
} else if (mode === "--check") {
  let current = "";
  try {
    current = readFileSync(MANIFEST_PATH, "utf8");
  } catch {
    fail("src/assets.ts is missing. Run `npm run assets` and commit the result.");
  }
  if (current !== generated) {
    fail(
      "src/assets.ts does not match design/assets/.\n" +
        "  Run `npm run assets`, then commit src/assets.ts along with your files.",
    );
  }
  console.log(`assets: ${paths.length} file(s), ${mb(totalBytes)} — manifest up to date.`);
} else {
  writeFileSync(MANIFEST_PATH, generated);
  console.log(`assets: wrote src/assets.ts — ${paths.length} file(s), ${mb(totalBytes)}.`);
}
