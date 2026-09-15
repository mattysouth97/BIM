#!/usr/bin/env node
// scripts/publish-reference-glbs.mjs
//
// Uploads every reference-building GLB to the bim public Vercel Blob store.
// The contract is pathname + public + overwrite + no suffix, not the exact
// flag spelling — if a CLI flag has drifted, correct it against
// `vercel blob put --help`:
//
//   pathname  — `reference-buildings/<id>/<file>.glb`, the public URL path
//               minus the leading slash. NEVER pass --add-random-suffix: a
//               suffixed pathname misses the next.config.ts rewrite and 404s
//               every consumer.
//   public    — the store and these meshes are world-readable by design.
//   overwrite — republishing a rebuilt model replaces the object in place.
//
//   node scripts/publish-reference-glbs.mjs --dry-run
//     Prints the inventory and the exact put commands. No token, no env, no
//     upload. Exits non-zero unless the on-disk GLB set is exactly the
//     manifest-referenced set — a stray disk file or a manifest reference
//     with no bytes fails the run before anything uploads.
//
//   node scripts/publish-reference-glbs.mjs
//     Real upload. Needs BLOB_READ_WRITE_TOKEN in the environment or in
//     .env.local (run `vercel env pull .env.local` once the Task 3 store is
//     connected). The token is never printed.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const TREE = path.join(PUBLIC, "reference-buildings");
const SCOPE = "matts-projects-d0677dc4";
const DRY_RUN = process.argv.includes("--dry-run");

const slash = (p) => p.split(path.sep).join("/");

/**
 * Recursively collect string values ending in `.glb` — the same walk the
 * e2e manifest gate uses, so both sides enumerate the identical set.
 */
const collectGlbRefs = (value, out = new Set()) => {
  if (!value || typeof value !== "object") return out;
  for (const v of Object.values(value)) {
    if (typeof v === "string" && v.endsWith(".glb")) out.add(v);
    else if (typeof v === "object") collectGlbRefs(v, out);
  }
  return out;
};

// ---- disk inventory ---------------------------------------------------------
const disk = new Map(); // pathname -> { absPath, bytes }
const walkDir = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p);
    else if (e.name.endsWith(".glb")) {
      const pathname = slash(path.relative(PUBLIC, p));
      disk.set(pathname, { absPath: p, bytes: fs.statSync(p).size });
    }
  }
};
walkDir(TREE);

// ---- manifest-referenced inventory ------------------------------------------
const referenced = new Set();
for (const e of fs.readdirSync(TREE, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const manifestPath = path.join(TREE, e.name, "manifest.json");
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const file of collectGlbRefs(manifest)) {
    referenced.add(`reference-buildings/${e.name}/${file}`);
  }
}

// ---- set equality: fail before anything uploads ------------------------------
const strays = [...disk.keys()].filter((p) => !referenced.has(p));
const missing = [...referenced].filter((p) => !disk.has(p));
if (strays.length || missing.length) {
  for (const p of strays)
    console.error(`stray on disk, no manifest reference: ${p}`);
  for (const p of missing)
    console.error(`manifest reference with no bytes on disk: ${p}`);
  console.error(
    "disk set and manifest-referenced set must be exactly equal — aborting before any upload"
  );
  process.exit(1);
}

const pathnames = [...disk.keys()].sort();
const totalBytes = pathnames.reduce((s, p) => s + disk.get(p).bytes, 0);

const putArgs = (pathname, absPath) => [
  "blob",
  "put",
  absPath,
  "--pathname",
  pathname,
  "--access",
  "public",
  "--content-type",
  "model/gltf-binary",
  "--allow-overwrite",
  "--scope",
  SCOPE,
];

if (DRY_RUN) {
  for (const pathname of pathnames) {
    console.log(`vercel ${putArgs(pathname, disk.get(pathname).absPath).join(" ")}`);
  }
  console.log(`${pathnames.length} file(s), ${totalBytes} bytes`);
  process.exit(0);
}

// ---- real run ----------------------------------------------------------------
// Load .env.local only when the token is not already in the environment, so an
// operator-set variable always wins regardless of loadEnvFile override semantics.
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      // fall through to the check below
    }
  }
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set.");
  console.error(
    "Run `vercel env pull .env.local` after the Task 3 store is connected, then re-run."
  );
  process.exit(1);
}

for (const pathname of pathnames) {
  const { absPath, bytes } = disk.get(pathname);
  console.log(`put ${pathname} (${bytes} bytes)`);
  // shell on win32 so cmd.exe resolves the vercel.cmd shim; POSIX execs it.
  const res = spawnSync("vercel", putArgs(pathname, absPath), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error(
      `vercel blob put failed for ${pathname} (exit ${res.status}) — aborting; ` +
        "re-run to resume (overwrite is allowed)"
    );
    process.exit(res.status ?? 1);
  }
}
console.log(`published ${pathnames.length} file(s), ${totalBytes} bytes`);
