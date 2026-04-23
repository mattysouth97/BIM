#!/usr/bin/env node
// scripts/self-improve-benchmark.mjs
// Benchmark for the v7.0 Prediction self-improve loop.
// Scope: src/lib/portfolio/feature-extractor.ts statements coverage.
// Emits JSON to stdout; non-zero exit on failure paths.

import { execSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const TARGET = "src/lib/portfolio/feature-extractor.ts";
const PRESERVED_TESTS = [
  "src/lib/portfolio/__tests__/feature-extractor.test.ts",
  "src/lib/portfolio/__tests__/extract-features-cli.test.ts",
];
const COVERAGE_DIR = "coverage/self-improve";
const SUMMARY_PATH = join(COVERAGE_DIR, "coverage-summary.json");

function run(cmd) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8", cwd: REPO_ROOT });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stderr: (err.stderr?.toString() ?? "") + (err.stdout?.toString() ?? ""),
    };
  }
}

// Clean stale coverage so we don't read old numbers on failure.
if (existsSync(COVERAGE_DIR)) {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
}

// Tests + coverage (scoped to target + preserved tests, so unrelated pre-existing
// failures in other parts of the repo do not pollute the benchmark).
const testArgs = [
  "exec vitest run",
  "--coverage",
  "--coverage.enabled=true",
  `--coverage.include=${TARGET}`,
  "--coverage.reporter=json-summary",
  `--coverage.reportsDirectory=${COVERAGE_DIR}`,
  ...PRESERVED_TESTS,
].join(" ");

const tests = run(`pnpm ${testArgs}`);
const build = run("pnpm build");
const lint = run(`pnpm exec eslint ${TARGET}`);

// Also scan the tests directory for any NEW test files added by variants and
// run them under the same coverage scope so additive variants get credit.
// (Vitest collects coverage across all tests that execute, so this is
// accomplished by just running all tests under src/lib/portfolio/__tests__/.)
const allExtTests = run(
  `pnpm exec vitest run --coverage --coverage.enabled=true --coverage.include=${TARGET} --coverage.reporter=json-summary --coverage.reportsDirectory=${COVERAGE_DIR} src/lib/portfolio/__tests__/`,
);

let coveragePct = 0;
if (existsSync(SUMMARY_PATH)) {
  try {
    const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
    const key = Object.keys(summary).find((k) =>
      k.replace(/\\/g, "/").endsWith(TARGET),
    );
    if (key) coveragePct = summary[key].statements?.pct ?? 0;
  } catch {
    coveragePct = 0;
  }
}

let status = "success";
let error = "";
if (tests.exitCode !== 0) {
  status = "failure";
  error = "preserved tests failed";
} else if (allExtTests.exitCode !== 0) {
  status = "failure";
  error = "portfolio tests failed";
} else if (build.exitCode !== 0) {
  status = "failure";
  error = "build failed";
} else if (lint.exitCode !== 0) {
  status = "failure";
  error = "lint failed";
}

const result = {
  status,
  benchmark_score: coveragePct,
  primary_metric: "coverage_pct",
  secondary: {
    preserved_tests_exit: tests.exitCode,
    all_portfolio_tests_exit: allExtTests.exitCode,
    build_exit: build.exitCode,
    lint_exit: lint.exitCode,
  },
  error,
};

console.log(JSON.stringify(result, null, 2));
process.exit(status === "success" ? 0 : 1);
