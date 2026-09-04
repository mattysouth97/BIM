#!/usr/bin/env node
// Find UNTRACKED files that TRACKED code depends on.
//
// This class of breakage is invisible to `tsc`, to eslint and to the whole test
// suite, because on the machine that authored the file everything resolves from
// disk. It surfaces in exactly two places: a fresh clone, and a clean deploy.
//
// Both have already cost this repo real time:
//   * `public/landing/layer-all-peel-hd.png` was referenced by `lib/landing/layers.ts`
//     but never tracked. `vercel --prod` uploads the working tree, so it reached
//     production from a dirty checkout and 404'd the instant a clean worktree
//     deploy ran (2026-09-04).
//   * A tracked module importing an untracked sibling breaks `git clone` for
//     everyone while the author sees a green suite.
//
// Usage:  node scripts/check-untracked-imports.mjs
// Exits 1 if anything would break a fresh checkout, 0 otherwise.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
const tracked = git(["ls-files"]);
const trackedCode = tracked.filter((f) => CODE.test(f));

const bodies = new Map();
const read = (f) => {
  if (!bodies.has(f)) {
    try { bodies.set(f, readFileSync(f, "utf8")); } catch { bodies.set(f, ""); }
  }
  return bodies.get(f);
};

// Every module specifier in a file: `from "x"`, `import "x"`, `require("x")`,
// `import("x")`. Captures the specifier only.
const SPEC = /(?:from\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

// Resolve a specifier to a repo-relative path without an extension.
// Returns null for bare package names, which can never be an untracked local file.
function resolveSpec(fromFile, spec) {
  if (spec.startsWith("@/")) return "src/" + spec.slice(2);
  if (spec.startsWith(".")) return path.posix.normalize(
    path.posix.join(path.posix.dirname(fromFile.split(path.sep).join("/")), spec),
  );
  return null;
}

// Index tracked code by what it imports, resolved and extension-stripped.
const importedBy = new Map(); // resolved stem -> [importing tracked files]
for (const f of trackedCode) {
  const body = read(f);
  for (const m of body.matchAll(SPEC)) {
    const resolved = resolveSpec(f, m[1]);
    if (!resolved) continue;
    const stem = resolved.replace(CODE, "").replace(/\/index$/, "");
    if (!importedBy.has(stem)) importedBy.set(stem, []);
    importedBy.get(stem).push(f);
  }
}

// Does the COMMITTED copy of any tracked file reference this module? That is the
// difference between "HEAD is broken for everyone who clones it" and "this breaks
// the moment you commit", and the two deserve very different urgency. Reading
// tracked files from disk cannot tell them apart, because the working tree holds
// in-flight edits that are not yet history. Searching HEAD directly can.
function committedImporters(stem) {
  const base = stem.split("/").pop();
  try {
    return execFileSync("git", ["grep", "-l", "-e", base, "HEAD", "--", "*.ts", "*.tsx"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
      .split(/\r?\n/).filter(Boolean).map((l) => l.replace(/^HEAD:/, ""));
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

const problems = [];

// 1. Untracked source modules that tracked code imports.
for (const f of untracked.filter((u) => CODE.test(u))) {
  const stem = f.replace(CODE, "");
  const hits = [...new Set(importedBy.get(stem) ?? [])].filter((h) => h !== f);
  if (!hits.length) continue;
  const inHead = committedImporters(stem).filter((h) => hits.includes(h));
  problems.push({ kind: "module", file: f, hits, inHead });
}

// 2. Untracked assets under public/ referenced by any tracked source string.
for (const a of untracked.filter((u) => u.startsWith("public/"))) {
  const web = "/" + a.slice("public/".length);
  const hits = trackedCode.filter((t) => read(t).includes(web));
  if (hits.length) problems.push({ kind: "asset", file: a, web, hits });
}

// 3. Untracked App Router routes/pages. Nothing imports these — they are reached
//    by URL — so no import analysis can ever catch them. Reported as a warning,
//    since an in-flight new route is legitimate; it just must not be forgotten.
const ROUTE = /^src\/app\/.*\/(route|page|layout)\.(ts|tsx)$/;
const routes = untracked.filter((u) => ROUTE.test(u));

for (const p of problems) {
  if (p.kind === "module") {
    if (p.inHead.length) {
      console.log(`
BROKEN AT HEAD - a committed file imports this untracked module:
  ${p.file}`);
      console.log(`    committed importer(s): ${p.inHead.join(", ")}`);
    } else {
      console.log(`
COMMIT-ORDERING TRAP - only uncommitted edits import this untracked module.`);
      console.log(`  HEAD is fine; it breaks if the importer is committed without it:
  ${p.file}`);
    }
  } else {
    console.log(`\nUNTRACKED ASSET referenced by tracked code — 404s on a clean deploy:\n  ${p.file}  (served at ${p.web})`);
  }
  for (const h of p.hits) console.log(`    <- ${h}`);
}

if (routes.length) {
  console.log(`\nUNTRACKED ROUTES (URL-reachable, so no import can flag them — verify these are deliberate):`);
  for (const r of routes) console.log(`  ${r}`);
}

const scanned = untracked.filter((u) => CODE.test(u) || u.startsWith("public/")).length;
const atHead = problems.filter((p) => p.kind === "asset" || p.inHead?.length).length;
const pending = problems.length - atHead;
console.log(
  `
${atHead ? "FAIL" : "OK"}: scanned ${scanned} untracked files against ${trackedCode.length} tracked modules - ` +
  `${atHead} broken at HEAD, ${pending} commit-ordering trap(s), ${routes.length} untracked route(s) to confirm.`,
);
// Only a genuine break at HEAD is a failure. Uncommitted in-flight work is normal
// in a shared tree and must not fail the check, or the check gets ignored.
process.exit(atHead ? 1 : 0);
