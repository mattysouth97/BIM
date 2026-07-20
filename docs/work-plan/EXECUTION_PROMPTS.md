# Execution Prompts — GreenRetrofit Work Plan

Ready-to-paste prompts for executing the 23 work items in `docs/work-plan/items/`.
Assumes the receiving AI agent runs with the repo root as its workspace (`C:\Users\Nam\BIM`) and can read files, edit code, and run shell commands.

**Usage notes**
- Run **one item per session** (the AI_PROCESS rule); use the per-item prompts below, or the master prompt for an autonomous sequential run.
- On this machine the Git Bash `pnpm` shim is broken — the prompt tells the agent to invoke pnpm via `node "$APPDATA/npm/node_modules/pnpm/bin/pnpm.cjs"`. Remove that line if your environment has a working `pnpm`.
- Recommended order (respects the sequencing constraints in `docs/work-plan/README.md`):
  - **Wave 1 (P0):** P0-01 → P0-04 → P0-03 → P0-02 → P0-05
  - **Wave 2 (P1):** P1-04 → P1-08 → P1-05 → P1-01 → P1-02 → P1-03 → P1-06 → P1-07
  - **Wave 3 (P2):** P2-01 → P2-02 → P2-03 → P2-04 → P2-05 → P2-06 → P2-07 → P2-09 → P2-10 → P2-08 (P2-08 always last)

---

## Master prompt (autonomous sequential run)

```text
You are a senior full-stack engineer working in the repository at the current workspace root
(GreenRetrofit Simulator — Next.js 16.2.10 + React 19 + TypeScript; Korean building-ledger query,
3D digital twin, and energy-retrofit savings simulator). A tracked remediation work plan exists at
docs/work-plan/, created from a full code review on 2026-07-21.

MISSION: Execute the work plan item by item, strictly following docs/work-plan/AI_PROCESS.md
(the RE → SDD → CDD → EDD operating loop: SELECT → CONTEXT → SPEC → TEST-RED → IMPLEMENT →
EVALUATE → TRACK).

EXECUTION ORDER (respect the sequencing constraints in docs/work-plan/README.md):
Wave 1 (P0): P0-01, P0-04, P0-03, P0-02, P0-05
Wave 2 (P1): P1-04, P1-08, P1-05, P1-01, P1-02, P1-03, P1-06, P1-07
Wave 3 (P2): P2-01, P2-02, P2-03, P2-04, P2-05, P2-06, P2-07, P2-09, P2-10, P2-08

FOR EACH ITEM, in strict order:
1. Read docs/work-plan/items/<ID>-*.md fully, then its §2 context-pack files, then
   docs/work-plan/knowledge/domain-glossary.md if it references unfamiliar domain terms.
2. Set the item frontmatter to status: in-progress with today's date before touching code.
3. TDD: write the failing tests named in the item's §4 FIRST and show they fail (red).
4. Implement the minimal change that satisfies the §2 BDD scenarios, staying inside the
   §3 may-touch list. Do NOT touch anything in the §3 must-not list — if that proves
   unavoidable, STOP and write an ADR per docs/work-plan/adr/README.md instead of proceeding.
5. Run ALL of the item's gates: its targeted vitest files, then `pnpm lint`, `pnpm test`,
   `pnpm build`. All must pass. Never delete, skip, or weaken a test to make a gate pass;
   if a pre-existing unrelated test fails, report it and leave it untouched.
6. Complete the item's §4 security/honesty checklist and verify its §3 fitness functions.
7. TRACK: tick the acceptance criteria in the item file, set status: done (or blocked with a
   reason), update the `updated:` date, and append a row to the Changelog table in
   docs/work-plan/README.md.
8. Commit as ONE commit per item: `<ID>: <imperative summary>` — never batch two items
   into one commit.
9. Report back before starting the next item: item id, gate results (lint/tests/build),
   files changed, any deviations or open questions.

GLOBAL RULES:
- Work on exactly ONE item at a time; never have two items in-progress.
- pnpm note: the Git Bash pnpm shim is broken on this machine — invoke pnpm as
  `node "$APPDATA/npm/node_modules/pnpm/bin/pnpm.cjs" <args>` (or use corepack).
- The AGENTS.md warning applies: this Next.js version has breaking changes — consult
  node_modules/next/dist/docs/ before using Next.js APIs from memory.
- Follow existing code conventions (pure functions in src/lib, no 'use client' in src/lib,
  explicit unavailable-data states, no fabricated metrics or values).
- If you finish a wave, summarize wave results and continue to the next wave without
  waiting for confirmation, unless an item is blocked.

Start now with P0-01.
```

---

## Per-item prompts (single-session mode)

Paste the kickoff preamble once per session, then the item line.

**Preamble (paste at session start):**

```text
You are a senior full-stack engineer working in the repo at the current workspace root
(GreenRetrofit Simulator — Next.js 16 + React 19 + TypeScript). Execute work items from
docs/work-plan/ strictly per docs/work-plan/AI_PROCESS.md: read the item file fully, read its
context pack, write its §4 tests first (TDD red), implement within its §3 may-touch/must-not
constraints, run all gates (targeted vitest + pnpm lint + pnpm test + pnpm build), complete its
security/honesty checklist, then update tracking (item frontmatter + Changelog in
docs/work-plan/README.md) and commit as one commit titled "<ID>: <summary>". If a must-not
constraint must be broken, stop and write an ADR per docs/work-plan/adr/README.md instead.
pnpm note: invoke pnpm as `node "$APPDATA/npm/node_modules/pnpm/bin/pnpm.cjs" <args>`.
Heed AGENTS.md: verify Next.js APIs against node_modules/next/dist/docs/.
```

**Item lines (in recommended order):**

| # | Prompt |
|---|---|
| 1 | `Execute work item P0-01 (secure twin-data routes against path traversal and unauthenticated writes).` |
| 2 | `Execute work item P0-04 (fix floor selection on the polygon-footprint rendering path).` |
| 3 | `Execute work item P0-03 (register a CJK font so Korean PDF export stops rendering tofu).` |
| 4 | `Execute work item P0-02 (wire scenario savings — NPV/IRR/payback — into report outputs).` |
| 5 | `Execute work item P0-05 (add GitHub Actions CI, coverage thresholds, close the release-guard hole).` |
| 6 | `Execute work item P1-04 (correct SYSTEM_RATIOS use-code keys against the real MOLIT 용도코드 table).` |
| 7 | `Execute work item P1-08 (state consistency — one effective-recipe hook, guard-aware stepper, real active building).` |
| 8 | `Execute work item P1-05 (fix benchmark unit mismatch and retire dual grading scales).` |
| 9 | `Execute work item P1-01 (enforce mutually exclusive measures and damp interaction double-counting).` |
| 10 | `Execute work item P1-02 (add measure lifetimes, truncate cash flows, add generator-level tests).` |
| 11 | `Execute work item P1-03 (thread heating fuel type into generators; price district heating correctly).` |
| 12 | `Execute work item P1-06 (API hardening sweep — traversal, error contracts, proxy factory, batch caps, zod).` |
| 13 | `Execute work item P1-07 (accessibility and chart repair — Tab hijack, keyboard-inert rows, black bars).` |
| 14 | `Execute work item P2-01 (add infiltration/ventilation heat loss to the energy model).` |
| 15 | `Execute work item P2-02 (per-fuel CO2 factors and fuel-split demand result).` |
| 16 | `Execute work item P2-03 (adopt App Router conventions — error/loading/not-found, metadata, fonts, link).` |
| 17 | `Execute work item P2-04 (rewrite README and retitle landing hero to the GreenRetrofit identity).` |
| 18 | `Execute work item P2-05 (make the v0.1.0 ML release honest — build the pipeline or strip the metrics).` |
| 19 | `Execute work item P2-06 (consolidate i18n onto a single t(ko,en) catalog honoring the language store).` |
| 20 | `Execute work item P2-07 (harden persisted stores — versioning, API-key policy, building-scoped annotations).` |
| 21 | `Execute work item P2-09 (rewrite the e2e suite around the real user journey with mocked APIs).` |
| 22 | `Execute work item P2-10 (financial model refinements — loan-term buy-down, rate honesty, solar fixes, sourced costs).` |
| 23 | `Execute work item P2-08 (delete dead code, fix doc drift, remove stray artifacts) — always run LAST.` |

---

## Report-back format (already embedded in both prompts)

After each item the agent must report: **item id · gate results (lint/tests/build) · files changed · deviations/open questions**, and the dashboard Changelog gains one row. If anything is blocked, the item frontmatter records `status: blocked` with the reason — never silently skip.
