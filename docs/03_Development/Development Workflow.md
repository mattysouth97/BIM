---
type: reference
status: partial
last_verified: 2026-08-27
---

# Development Workflow

Branch → validate → commit → deploy, plus the two traps that silently waste a session.

Related: [[Build and Run]] · [[Testing Strategy]] · [[Repository Conventions]] · [[Deployment and Environment]]

## Where the tracked work lives — PINNED

All remediation and feature work is tracked in [docs/work-plan/](../work-plan/). That folder is
**referenced by name from [CLAUDE.md](../../CLAUDE.md)** and cross-linked internally. Link to it;
do not relocate or restructure it.

| Artifact | Path | Role |
|---|---|---|
| Operating contract | [work-plan/AI_PROCESS.md](../work-plan/AI_PROCESS.md) | RE → SDD → CDD → EDD, gates G0–G5, 7 fitness functions |
| Status dashboard | [work-plan/README.md](../work-plan/README.md) | P0/P1/P2 tables + changelog |
| Item specs | [work-plan/items/](../work-plan/items/) | 43 files; frontmatter `status:` is the source of truth |
| Domain knowledge | [work-plan/knowledge/](../work-plan/knowledge/) | `domain-glossary.md`, `use-cases.md` (UC ids) |
| Decisions | [work-plan/adr/](../work-plan/adr/) | required *before* breaking a constraint or fitness function |

Rules from `AI_PROCESS.md` that bite in practice: one `in-progress` item per session (R5.2); no
refactors outside an item's declared May-touch paths, "even if nearby" (R3.3); an ADR is required
before changing a domain assumption (cost data, subsidy ratios, primary-energy factors, climate
tables) (R3.2); and never "fix the test to match the code" without an ADR. `done` is reserved for
human/merge acceptance — an agent session may only reach `in-review`.

Two stale facts in that contract, noted so you do not chase them: it names the project root as
`C:\Users\Nam\BIM`, and it says coverage has "no thresholds configured" (thresholds now exist —
see [[Testing Strategy]]). Its test-count baseline (902) is also five months old.

The work-plan changelog's last entry is 2026-07-23, while the last five commits are all
2026-08 energy-diagnostics work. The G5 TRACK step has not been honoured for recent work —
treat the dashboard as approximately, not exactly, current.

## Branching

Current branch: `feat/design-stage-energy-diagnostics`. The default branch is **`master`**
(`origin/HEAD → origin/master`). `origin/main` exists but holds a single "Initial commit" and is
438 commits behind.

> **CI does not run on your work.** [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
> triggers only on `branches: [main]`. Pushes and PRs to `master` or to any feature branch run
> **no CI at all**. Until that file names `master`, every gate below is a local responsibility.

When CI does fire it is one hermetic `gate` job: checkout → pnpm 10 → node 22 →
`pnpm install --frozen-lockfile` → `lint` → `test:coverage` → `build` → `ci:check`. Note what is
absent: no standalone `tsc --noEmit` (typecheck rides on `next build`) and **no Playwright step**.

## Local gate before committing

Run all four; they are the same gates CI would run plus the typecheck CI lacks.

```bash
node node_modules/typescript/bin/tsc --noEmit        # exits 0 as of 2026-08-27
node node_modules/vitest/vitest.mjs run --coverage   # 3952 passed / 4 skipped / 362 files
node node_modules/eslint/bin/eslint.js .
node node_modules/@playwright/test/cli.js test       # 35/35 chromium
```

`pnpm ci:check` additionally guards the published prediction dataset:

- **schema-drift** — the committed `public/releases/<latest>/schema.json` must match a fresh
  `export-feature-schema.mjs` run (CRLF-normalised, because git may check the frozen JSON out with
  CRLF on Windows).
- **explorer-purity** — [src/app/releases/page.tsx](../../src/app/releases/page.tsx) must contain no
  `"use client"`, and its first-level imports are checked too. `/releases` is server-only by design.
- **release-immutability** — files under `public/releases/v*/` (except `CHANGELOG.md`) must be
  unchanged versus HEAD; untracked files are unioned in, because `git diff` never lists them.

## Committing

> **The Vercel author-email trap.** A deploy returns state **BLOCKED** — not a build failure, with
> no build log to read — when the HEAD commit's author email is not an address on the Vercel
> account. It must be `namseunghun97@gmail.com`.

```bash
git config user.email namseunghun97@gmail.com   # per-repo, do this once
git log -1 --format='%ae'                       # verify before deploying
```

There is no commit-message convention enforced by tooling; recent history uses short imperative
subjects ("Make diagnostic finding selection explicit").

## Deploying

Production is the Vercel project `bim` (org `matts-projects-d0677dc4`) at
<https://bim-self.vercel.app>. Deploys are manual and CLI-driven:

```bash
vercel --prod --yes
```

There is no `vercel.json` — all build behaviour comes from `next.config.ts` defaults. Full
procedure, environment variables and failure modes: [[Deployment and Environment]].

### .vercelignore is load-bearing

[.vercelignore](../../.vercelignore) is not tidiness — without it the CLI **aborts the upload**.
`qa-evidence/` alone is 81 MB across 234 files; excluding it plus `test-results/`,
`playwright-report/`, `.agents/` and root `*.png`/`*.url` took the upload from ~45 MB to ~672 KB.
If you add a new artifact directory that any tool writes into, add it here in the same change.

Note `qa-evidence/` is excluded from ESLint and from Vercel upload but is **not** in
[.gitignore](../../.gitignore), so it sits permanently as `?? qa-evidence/` in `git status`. No
retention policy is recorded for its per-commit `production-<sha>/` subdirectories.

## Alternate deploy targets (present, unexercised)

[open-next.config.ts](../../open-next.config.ts) + [wrangler.jsonc](../../wrangler.jsonc) describe a
Cloudflare Workers target (worker name `greenretrofit-bim`, a pre-rename identity), and
`build:sites` stages an OpenAI "Sites" bundle using [.openai/hosting.json](../../.openai/hosting.json).
Neither appears in CI or in any release procedure, and there is no evidence in the repo of either
having been deployed. Do not treat them as live alternatives without confirming first.
