---
id: P0-05
title: Add GitHub Actions CI, coverage thresholds, and close the release-guard hole
priority: P0
area: infra
status: done
owner: claude-fable-5-ultrawork
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-01, UC-05, UC-06, UC-07, UC-08]
---

# P0-05 — Add GitHub Actions CI, coverage thresholds, and close the release-guard hole

## 1. Requirement (RE)

- **Problem**: 903 tests exist but nothing enforces them — there is zero CI.
  - Verified: **no `.github/` directory exists** in the repo (github.com/mattysouth97/BIM).
  - `package.json:15` — `"ci:check": "node scripts/ci-check-plan.mjs"` runs only when a
    developer remembers to run it manually.
  - `vitest.config.ts:9-13` — v8 coverage is configured (`provider: "v8"`, include
    `src/**/*.ts(x)`) but declares **no thresholds**, so coverage can rot silently.
  - `scripts/ci-check-plan.mjs:153` — the release-immutability guard (guard c) lists changed
    files via `git diff --name-only HEAD`, which **never lists untracked files**: a NEW file
    dropped into `public/releases/v*/` passes the guard undetected (the matcher at `:164`
    only sees tracked modifications). Guards (a) schema-drift and (b) explorer-purity
    (`:3-10` header) are unaffected by this hole.
- **Impact**: Broken tests, lint failures, type errors, and frozen-release tampering all
  merge undetected. The 903-test suite is decorative until CI runs it on every PR.
- **Use case**: As the repo maintainer, I want every PR and every push to main to run
  lint, tests with coverage floors, build, and the plan guards, so that regressions and
  release tampering are blocked before merge.

## 2. Specification (SDD)

- **Context pack** (read first, in order):
  1. `package.json:5-16` — available scripts: `lint` (eslint), `test` (vitest run), `build` (next build), `ci:check`, `test:coverage`. Package name `korea-building-info` (`:2`); no `engines`/`packageManager` fields.
  2. `pnpm-lock.yaml:1` — `lockfileVersion: '9.0'` (pnpm 9/10 era). pnpm is the package manager (only `pnpm-lock.yaml` exists; no npm/yarn lockfiles).
  3. `vitest.config.ts` (20 lines) — coverage block at `:9-13`.
  4. `scripts/ci-check-plan.mjs` (198 lines) — three guards; the vulnerable one at `:146-178`, especially `:153` and the `releasePattern` at `:164`.
  5. `next` `16.2.10` (`package.json:35`) — requires a modern Node; local dev runs Node v24. No `.nvmrc`/`.node-version` exists.
- **BDD scenarios**:
  1. *PR gate runs*: Given a pull request against `main`, When CI executes, Then it runs `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm ci:check` in order and fails the PR if any step fails.
  2. *Main gate runs*: Given a push to `main`, When CI executes, Then the same four steps run.
  3. *Untracked release file caught*: Given a new, never-committed file at `public/releases/v9.9/evil.json` in the working tree, When `pnpm ci:check` runs, Then guard (c) reports FAIL and the script exits 1.
  4. *CHANGELOG exemption preserved*: Given an untracked or modified `public/releases/v1.0/CHANGELOG.md`, When guard (c) runs, Then it passes (the `(?!CHANGELOG\.md$)` exemption at `:164` still holds).
  5. *Coverage floor*: Given `src/lib` line/function coverage drops below the configured threshold, When `pnpm test:coverage` runs in CI, Then vitest exits non-zero.

## 3. Constraints (CDD)

- **Design constraints**:
  - Workflow: create `.github/workflows/ci.yml` — triggers `pull_request` (to `main`) and `push` (branches: `main`). Steps: `actions/checkout@v4` → `pnpm/action-setup@v4` (pin `version: 10`; the repo has no `packageManager` field, so the version must be explicit) → `actions/setup-node@v4` with `node-version: 22` and `cache: 'pnpm'` → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test` → `pnpm build` → `pnpm ci:check`. Add `corepack enable` only if pnpm-action-setup is not used — do not stack both.
  - **Implementer note (from review)**: the Git Bash pnpm shim is broken on the maintainer's machine — CI must use `pnpm/action-setup` (or corepack), never the shim, and local verification of the workflow YAML should prefer `pnpm/action-setup` parity over local shim runs.
  - Coverage thresholds in `vitest.config.ts:9-13`: add `coverage.thresholds` scoped to `src/lib` — `'src/lib/**': { lines: 70, functions: 70 }` as the starting floor. Procedure: run `pnpm test:coverage`, record the current `src/lib` baseline; if it is already ≥ 70 set 70; if below, set the floor at the measured whole number and open a P1 ratchet item (do not weaken existing tests to pass, do not exclude files to game the metric).
  - Guard fix in `ci-check-plan.mjs:151-161`: collect candidate files from BOTH `git diff --name-only HEAD` (tracked modifications) AND untracked files via `git ls-files --others --exclude-standard` (or parse `git status --porcelain`, handling the `??` prefix and quoted paths). Union the lists before applying `releasePattern` (`:164`). Keep the existing fail/pass reporting style (`reportFail`/`reportPass`, `:24-31`) and the CHANGELOG exemption.
  - Keep the guard script dependency-free (Node stdlib only, as today) and executable identically on Windows dev machines and Ubuntu CI runners (forward-slash normalization at `:166` already exists — extend it to the new source).
- **May touch**:
  - new: `.github/workflows/ci.yml`
  - `vitest.config.ts` (coverage thresholds only)
  - `scripts/ci-check-plan.mjs` (guard (c) file enumeration only)
  - optionally `package.json` (add `"packageManager": "pnpm@10.x"` to pin; additive field only)
- **Must not**:
  - Do not modify application source under `src/` for this item.
  - Do not change guards (a) schema-drift or (b) explorer-purity logic.
  - Do not add e2e/Playwright to the required CI path in this item (`test:e2e` exists but is out of scope — note as a P1 follow-up).
  - Do not weaken or delete tests to satisfy coverage thresholds; no broad `coverage.exclude` additions.
  - Do not commit any secrets; the workflow needs none (all four steps are hermetic).
- **Fitness functions**:
  - `git ls-files --others --exclude-standard` output containing a `public/releases/v*/` path (non-CHANGELOG) makes `node scripts/ci-check-plan.mjs` exit 1; verified locally by creating and then deleting a probe file.
  - `node scripts/ci-check-plan.mjs` exits 0 on a clean tree.
  - `pnpm test:coverage` exits non-zero when `src/lib` lines/functions fall below the configured threshold (verify by temporarily setting an absurd threshold like 100, then revert).
  - `.github/workflows/ci.yml` parses (actionlint or GitHub's own validation on first push) and contains all four run steps.
  - No `package-lock.json`/`yarn.lock` introduced.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - This is an infra item; "tests" are the verification probes below. If the implementer wants executable coverage for guard (c), add a small node test (e.g. `scripts/__tests__/ci-check-plan.test.mjs` run via `node --test`) that shells the guard in a temp git repo with an untracked `public/releases/v9/probe.json` — optional, do not block the item on it.
  - Mandatory manual probes (record results in the PR):
    1. `touch public/releases/v-probe/evil.json` → `pnpm ci:check` FAILs (exit 1) → delete probe → PASSes (exit 0).
    2. Threshold probe: set thresholds to `100` temporarily → `pnpm test:coverage` exits non-zero → restore real threshold → exits zero.
    3. Full local gate: `pnpm lint && pnpm test && pnpm build && pnpm ci:check` all green.
- **Gates**:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm ci:check` (with the untracked-file probe passing/failing as specified)
  - Post-merge: first CI run on `main` green; a throwaway PR intentionally breaking a test shows the red X (then close it).
- **Security / honesty checklist**:
  - Workflow requests no secrets and grants default (read-only) `GITHUB_TOKEN` permissions; add explicit `permissions: contents: read`.
  - No third-party actions beyond `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` (all pinned to major versions).
  - Guard output must not leak absolute CI paths into committed artifacts (stdout/stderr only, as today).
  - Coverage threshold reflects an honestly measured baseline — record the measured number in the PR description.
- **Acceptance criteria**:
  - [x] `.github/workflows/ci.yml` runs lint + test + build + ci:check on PRs and pushes to `main` with pnpm caching.
  - [x] `vitest.config.ts` enforces `src/lib` lines/functions thresholds (≥ 70 or measured floor with a filed ratchet follow-up).
  - [x] Guard (c) detects untracked files under `public/releases/v*/` while preserving the CHANGELOG exemption.
  - [x] All three mandatory probes documented in the PR.
  - [ ] Local full gate green (✔); first real CI run green (pending push — cannot be verified locally).
- **Done when**: A PR that breaks a test or drops an untracked file into `public/releases/v*/` is visibly red in GitHub, and the four-step gate runs automatically on every PR and main push.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- Workflow `.github/workflows/ci.yml`: checkout@v4 → pnpm/action-setup@v4 (version 10) →
  setup-node@v4 (node 22, pnpm cache) → frozen-lockfile install → lint → **test:coverage**
  (runs the full suite AND enforces floors, covering BDD 1+5 in one step) → build → ci:check.
  `permissions: contents: read`, zero secrets.
- **Measured baseline (honest)**: `src/lib/**` = **52.78% lines / 57.54% functions** — below
  the 70 target, so floors set at **52/57** and ratchet item **P1-09** filed
  (`items/P1-09-coverage-ratchet.md`) listing the zero-coverage hotspots.
- Guard (c) now unions `git diff --name-only HEAD` with
  `git ls-files --others --exclude-standard` (quoted-path handling included).
- **Mandatory probes (recorded)**:
  1. Untracked `public/releases/v-probe/evil.json` → `ci:check` exit 1 (FAIL reported);
     deleted → exit 0. ✔
  2. Thresholds at 100 → `test:coverage` exit 1 (printed actuals 52.78/57.54); at 52/57 →
     exit 0. ✔
  3. Full local gate: lint 0 errors · test 971 (via coverage run) · build green ·
     ci:check clean-tree PASS. ✔ Bonus probe: untracked `CHANGELOG.md` in a release dir →
     exempt, exit 0. ✔
- Deviations: `packageManager` field NOT added to package.json (optional per may-touch;
  avoided interfering with the maintainer's broken local pnpm shim setup — CI pins
  pnpm 10 via action instead). Workflow YAML validated by eye only (no actionlint locally);
  GitHub validates on first push. Optional `node --test` guard test skipped per item text.
- **Post-merge follow-up**: first CI run + intentional-red throwaway PR remain to be
  observed on GitHub after push.
