#!/usr/bin/env node
// scripts/ci-check-plan.mjs
// v7.0 Prediction — Phase 35 Task 11 CI guards (plan A11):
//
//   (a) Schema drift  — regenerate schema.json from FEATURE_SCHEMA and diff
//                        against the committed public/releases/<latest>/schema.json
//   (b) Explorer purity — src/app/releases/page.tsx (and its imports) must not
//                          contain "use client"
//   (c) Release immutability — files under public/releases/v*/ must be
//                               unchanged vs `git diff --name-only HEAD`
//
// Exit code 0 = all guards pass. Exit code 1 = at least one guard failed.

import { execFileSync, spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

let failed = false;

function reportFail(guard, message) {
  failed = true;
  process.stderr.write(`[FAIL] ${guard}: ${message}\n`);
}

function reportPass(guard, message) {
  process.stdout.write(`[PASS] ${guard}: ${message}\n`);
}

// ─── Guard (a): schema drift ─────────────────────────────────────────────────

async function checkSchemaDrift() {
  const guard = "schema-drift";
  const manifestPath = path.join(REPO_ROOT, "public", "releases", "manifest.json");

  let latest;
  try {
    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    latest = JSON.parse(manifestRaw).latest;
  } catch (err) {
    reportFail(guard, `could not read public/releases/manifest.json: ${err.message}`);
    return;
  }

  if (!latest) {
    reportFail(guard, "public/releases/manifest.json has no 'latest' field");
    return;
  }

  const committedSchemaPath = path.join(REPO_ROOT, "public", "releases", latest, "schema.json");
  let committedSchema;
  try {
    committedSchema = await fs.readFile(committedSchemaPath, "utf-8");
  } catch (err) {
    reportFail(guard, `could not read ${path.relative(REPO_ROOT, committedSchemaPath)}: ${err.message}`);
    return;
  }

  // Regenerate to stdout via the export script and diff.
  const exportScript = path.join(REPO_ROOT, "scripts", "export-feature-schema.mjs");
  const result = spawnSync(process.execPath, [exportScript, "--stdout"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });

  if (result.status !== 0) {
    reportFail(guard, `export-feature-schema.mjs failed: ${result.stderr}`);
    return;
  }

  const regenerated = result.stdout;

  if (regenerated.trim() !== committedSchema.trim()) {
    reportFail(
      guard,
      `regenerated schema differs from public/releases/${latest}/schema.json — FEATURE_SCHEMA drifted from the committed release schema. Run "pnpm export:feature-schema" and re-review.`
    );
    return;
  }

  reportPass(guard, `regenerated schema matches public/releases/${latest}/schema.json`);
}

// ─── Guard (b): explorer page purity ─────────────────────────────────────────

async function checkExplorerPurity() {
  const guard = "explorer-purity";
  const pagePath = path.join(REPO_ROOT, "src", "app", "releases", "page.tsx");

  let content;
  try {
    content = await fs.readFile(pagePath, "utf-8");
  } catch (err) {
    reportFail(guard, `could not read src/app/releases/page.tsx: ${err.message}`);
    return;
  }

  // Match the actual directive form: a standalone statement "use client";
  // or 'use client'; (optionally without trailing semicolon), not any
  // comment or prose that happens to mention the phrase.
  const directiveRegex = /^\s*["']use client["']\s*;?\s*$/m;
  if (directiveRegex.test(content)) {
    reportFail(guard, `src/app/releases/page.tsx contains a "use client" directive — explorer page must be server-only`);
    return;
  }

  // Best-effort import-chain check: flag any relative/@ import in the page
  // whose target file also contains "use client". This is a shallow (one
  // level) check by design — deep transitive checking is out of scope for a
  // fast CI guard.
  const importRegex = /from\s+["']([^"']+)["']/g;
  let match;
  const suspiciousImports = [];
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith(".") && !importPath.startsWith("@/")) continue; // skip node_modules

    const resolved = importPath.startsWith("@/")
      ? path.join(REPO_ROOT, "src", importPath.slice(2))
      : path.resolve(path.dirname(pagePath), importPath);

    for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, "index.ts"), path.join(resolved, "index.tsx")]) {
      try {
        const importedContent = await fs.readFile(candidate, "utf-8");
        if (directiveRegex.test(importedContent)) {
          suspiciousImports.push(path.relative(REPO_ROOT, candidate));
        }
        break;
      } catch {
        // try next candidate extension
      }
    }
  }

  if (suspiciousImports.length > 0) {
    reportFail(guard, `imported file(s) contain "use client": ${suspiciousImports.join(", ")}`);
    return;
  }

  reportPass(guard, `src/app/releases/page.tsx and its direct imports contain no "use client"`);
}

// ─── Guard (c): release immutability ─────────────────────────────────────────

function checkReleaseImmutability() {
  const guard = "release-immutability";

  let changedFiles;
  try {
    const output = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    changedFiles = output.split("\n").map((f) => f.trim()).filter(Boolean);
  } catch (err) {
    reportFail(guard, `git diff failed: ${err.message}`);
    return;
  }

  // Normalize to forward slashes for cross-platform matching.
  const releasePattern = /^public\/releases\/v[^/]+\/(?!CHANGELOG\.md$).+/;
  const violations = changedFiles
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => releasePattern.test(f));

  if (violations.length > 0) {
    reportFail(
      guard,
      `frozen release files modified vs HEAD: ${violations.join(", ")} — releases under public/releases/v*/ are immutable once committed`
    );
    return;
  }

  reportPass(guard, "no modifications to frozen files under public/releases/v*/");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await checkSchemaDrift();
  await checkExplorerPurity();
  checkReleaseImmutability();

  if (failed) {
    process.stderr.write("\nci-check-plan: one or more guards FAILED.\n");
    process.exit(1);
  }

  process.stdout.write("\nci-check-plan: all guards passed.\n");
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
