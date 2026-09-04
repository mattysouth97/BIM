#!/usr/bin/env node
// scripts/check-asset-budget.mjs
//
// Guards the binaries under public/. Every rule here exists because the
// corresponding failure actually happened in this repo:
//
//   untracked  — public/landing/layer-all-peel-hd.png was referenced by live
//                code while untracked. It worked locally and from a dirty
//                `vercel --prod` (which uploads the working tree, not HEAD),
//                then 404'd the moment a clean deploy ran.
//   missing    — the inverse: a committed reference to a file nobody shipped.
//   duplicate  — public/textures/roof_flat/ was a byte-identical copy of
//                concrete_rough/, and eleven GLBs ship under two URLs, so the
//                HTTP cache cannot dedupe them.
//   oversize   — nothing stopped a 4.1 MB PNG from landing.
//
// Exit 1 on error-level findings only. Duplicates and directory totals are
// warnings, so this can land before the cleanups it recommends.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

/** Per-file ceilings in bytes. Raise deliberately, with a reason. */
const LIMITS = [
  { match: /^\/textures\//, max: 2_500_000, label: "texture" },
  { match: /^\/(models|bim-assets)\//, max: 1_000_000, label: "model" },
  { match: /^\/landing\//, max: 1_500_000, label: "landing image" },
  { match: /^\/hdr\//, max: 2_000_000, label: "HDR" },
  { match: /^\/fonts\//, max: 5_000_000, label: "font" },
];

/**
 * Files over their limit that are knowingly tolerated, with the reason.
 * An entry here is a debt record, not an exemption — delete it when fixed.
 */
const KNOWN_OVERSIZE = {
  "/landing/layer-all-peel-hd.png":
    "4.09 MB banner source. Served through next/image, so the wire cost is " +
    "already optimised and the debt is repo plus build size. Re-encode when " +
    "scripts/build-assets.mjs and its sharp dependency land.",
};

/** Directories whose total is worth watching even when each file is legal. */
const DIR_LIMITS = [
  { dir: "/textures", max: 20_000_000 },
  { dir: "/models", max: 12_000_000 },
  { dir: "/landing", max: 9_000_000 },
];

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const rel = (abs) => "/" + path.relative(PUBLIC, abs).split(path.sep).join("/");
const mb = (b) => (b / 1_048_576).toFixed(2) + " MB";

const errors = [];
const warnings = [];

const files = walk(PUBLIC);
const sizeOf = new Map(files.map((f) => [f, fs.statSync(f).size]));

// ---- untracked ------------------------------------------------------------
try {
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "public/"],
    { cwd: ROOT, encoding: "utf8" }
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of untracked) {
    errors.push(`untracked: ${u} — ships from a dirty deploy, 404s from a clean one`);
  }
} catch {
  warnings.push("git unavailable — skipped the untracked-asset check");
}

// ---- referenced but missing ----------------------------------------------
// Matched broadly, then filtered: a reference is only a file if it carries an
// extension. `/models/authoring` and `/models/equipment` are base paths that
// callers join onto, not assets.
const ASSET_DIRS = "textures|models|bim-assets|hdr|landing|fonts|samples|releases|wasm";
const REFERENCE = new RegExp(`["'\`](/(?:${ASSET_DIRS})/[^"'\`\${}\\s]*)["'\`]`, "g");
const HAS_EXTENSION = /\.[a-z0-9]{2,5}$/i;

const srcFiles = walk(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
const referenced = new Set();
for (const f of srcFiles) {
  const text = fs.readFileSync(f, "utf8");
  let m;
  while ((m = REFERENCE.exec(text))) {
    if (HAS_EXTENSION.test(m[1])) referenced.add(m[1]);
  }
}
const onDisk = new Set(files.map(rel));
for (const r of referenced) {
  if (!onDisk.has(r)) errors.push(`missing: ${r} is referenced in src/ but not in public/`);
}

// ---- byte-identical duplicates -------------------------------------------
const byHash = new Map();
for (const abs of files) {
  const size = sizeOf.get(abs);
  if (size < 4096) continue; // ignore trivia
  const h = createHash("md5").update(fs.readFileSync(abs)).digest("hex");
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push({ path: rel(abs), size });
}
let duplicateWaste = 0;
for (const group of byHash.values()) {
  if (group.length < 2) continue;
  const wasted = group[0].size * (group.length - 1);
  duplicateWaste += wasted;
  warnings.push(
    `duplicate (${mb(wasted)} wasted, cache cannot dedupe):\n      ` +
      group.map((g) => g.path).join("\n      ")
  );
}

// ---- per-file size --------------------------------------------------------
for (const abs of files) {
  const r = rel(abs);
  const size = sizeOf.get(abs);
  const limit = LIMITS.find((l) => l.match.test(r));
  if (!limit || size <= limit.max) continue;
  const line = `oversize ${limit.label}: ${r} is ${mb(size)}, limit ${mb(limit.max)}`;
  if (KNOWN_OVERSIZE[r]) warnings.push(`${line}\n      known: ${KNOWN_OVERSIZE[r]}`);
  else errors.push(line);
}

// ---- per-directory total --------------------------------------------------
for (const { dir, max } of DIR_LIMITS) {
  const total = files
    .filter((f) => rel(f).startsWith(dir + "/"))
    .reduce((s, f) => s + sizeOf.get(f), 0);
  if (total > max) warnings.push(`directory ${dir} totals ${mb(total)}, soft limit ${mb(max)}`);
}

// ---- report ---------------------------------------------------------------
const totalBytes = files.reduce((s, f) => s + sizeOf.get(f), 0);
console.log(`public/ — ${files.length} files, ${mb(totalBytes)}`);
if (duplicateWaste > 0) console.log(`duplicated bytes: ${mb(duplicateWaste)}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  x ${e}`);
  console.log("");
  process.exit(1);
}
console.log("\nasset budget OK");
