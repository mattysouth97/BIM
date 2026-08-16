# AI Development Process — GreenRetrofit Simulator (korea-building-info)

> Adapted from the 4-stage pipeline *"SW 공학 기반의 AI 에이전트 코딩"* (SW-engineering-based
> AI-agent coding): Upfront Requirements Engineering → Spec-Driven Development →
> Constraint-Driven Development → Eval-Driven Development.
>
> This document is the **operating contract** for any AI agent executing work items under
> `docs/work-plan/`. A human hands over an item with one line:
> `Execute work item P1-04 per docs/work-plan/AI_PROCESS.md` (see §7).

- Project root: `C:\Users\Nam\BIM` — Next.js 16 + React 19 + TypeScript, package `korea-building-info` (`package.json:2`).
- Domain: Korean building-ledger (건축물대장) query → procedural 3D twin → energy/retrofit savings simulation.
- Knowledge base: `docs/work-plan/knowledge/` (`domain-glossary.md`, `use-cases.md`).
- ADRs: `docs/work-plan/adr/` (see `docs/work-plan/adr/README.md`).
- Item files: `docs/work-plan/items/*.md` (frontmatter-tracked; template in each file's header).

---

## 1. The Four Stages

### Stage 1 — Upfront Requirements Engineering

*Business Process Models + Semantic Models → Use Cases.*

- The semantic model (ontology) is `docs/work-plan/knowledge/domain-glossary.md`.
- The use-case catalog is `docs/work-plan/knowledge/use-cases.md` (`UC-01` … `UC-10`).
- Requirements are captured **before** code: every work item declares `use_cases: [UC-…]` in
  its frontmatter.

**Rules**
- R1.1 Every work item references **at least one UC id**. An item with no UC mapping is not
  ready (fails gate G0).
- R1.2 Any **new domain term** introduced by a change (API field, subsidy program, metric,
  file-format concept) is added to `domain-glossary.md` **in the same PR** as the code.
- R1.3 If an item contradicts an existing UC, fix the UC first (same PR) — never let code and
  catalog drift apart.

### Stage 2 — Spec-Driven Development (SDD)

*Use Cases → BDD scenarios; Semantic Model → Ontology/Knowledge Base → Context.*

- Every item file carries:
  - **BDD scenarios** (`Given/When/Then`) in §2 of the item — happy path **and** the edge
    cases named in the item brief.
  - A **context pack** — the exact ordered list of files/modules the implementer reads first,
    plus the knowledge-base entries (`docs/work-plan/knowledge/*`) relevant to the item.
- Scenarios are written against observable behavior (HTTP status, rendered state, return
  values), never against implementation details.

**Rules**
- R2.1 **No implementation before BDD scenarios exist and are reviewed** (gate G1).
  "Reviewed" = a human, or the initiating orchestrator, has accepted the item file.
- R2.2 If a scenario is ambiguous, the AI **asks the human** rather than guessing (see
  Operating Loop, SPEC step).
- R2.3 Scenario count per item: 2–5. More than 5 means the item is too large — split it.

### Stage 3 — Constraint-Driven Development (CDD)

*BDD + Context → Test Generation → TDD; Use Cases + Ontology + Context → Object Design /
DDD / ADR → Architecture Fitness Functions (AFFs).*

- **TDD is mandatory**: write the failing tests named in the item's §4 *Evaluation* section
  first (TDD red, gate G2), then implement the minimal change to green (G3).
- Every item declares **May-touch** paths and **Must-not** constraints (§3). These are hard
  boundaries, not suggestions.
- Global AFFs below apply to **every** item, in addition to item-local fitness functions.

**Global Architecture Fitness Functions (AFFs)**

| # | Fitness function | Rationale / evidence |
|---|---|---|
| AFF-1 | No `'use client'` directive in `src/lib/**` pure modules. `src/lib` stays server/test-agnostic. | Stores carry it (`src/store/app-store.ts:1`); lib modules must not. |
| AFF-2 | All API routes validate input (zod or explicit guard) and **never echo secrets in errors** (no API keys, no `process.env` values in response bodies). | Key arrives via `x-api-key` header (`src/app/api/bldrgst/title/route.ts:16-19`); errors must stay generic. |
| AFF-3 | Every zustand `persist`ed store declares `version` + `migrate`. | Gap today: `src/store/app-store.ts:30-59` persists without `version`/`migrate`. New/changed persisted stores must not repeat this. |
| AFF-4 | Savings math lives in `src/lib/retrofit` pure functions, **not in components**. Components only format/emit values. | e.g. `selectMeasuresForBudget` (`src/lib/retrofit/economic-model.ts:356`), NPV/IRR (`economic-model.ts:6-8`). |
| AFF-5 | Any measure combined into a portfolio passes interaction / mutual-exclusion rules before selection. | Knapsack input must be pre-filtered (`economic-model.ts:344-356`). |
| AFF-6 | Unavailable data renders an **explicit state** (e.g. `-`, "data unavailable"), never a fabricated value. | Zero-value convention: `platArea=0 / heit=0 / bcRat=0` ⇒ unavailable (`src/lib/data-quality/quality-scorer.ts:31-56`). |
| AFF-7 | Path containment: server code joining user input into filesystem paths must normalize + reject traversal outside the intended root. | Twin store joins `buildingId`/`dataType` into `.twin-data/` (`src/app/api/twin-data/[buildingId]/route.ts:10`). |

**Rules**
- R3.1 Tests fail **for the right reason** before implementation (assert the missing behavior,
  not a syntax error).
- R3.2 If a Must-not constraint or AFF **must be broken**, the AI **stops** and writes an ADR
  in `docs/work-plan/adr/` **first** (see `docs/work-plan/adr/README.md`). Only after the ADR
  is accepted may implementation proceed.
- R3.3 Minimal diff: implement exactly what the BDD scenarios demand. Refactors outside
  May-touch are forbidden even if "nearby".

### Stage 4 — Eval-Driven Development (EDD)

*TDD + AFFs + Security + Compliance + Observability + Cost Controls → CI/CD.*

Every item closes by running the full evaluation stack (gate G4):

**Gates (exact commands, run from repo root)**
- `pnpm test -- <pattern>` — targeted vitest for every touched module (item §4 names them).
- `pnpm test` — full suite must stay green (baseline at authoring: 902 tests passing).
- `pnpm lint` — eslint clean (`package.json:9`).
- `pnpm build` — `next build` green (`package.json:7`).
- `pnpm ci:check` — plan-consistency check (`scripts/ci-check-plan.mjs`) when the item
  touches plan-tracked surfaces.

**Security checklist (per item)**
- [ ] Input validated on every new/changed route and store boundary (AFF-2).
- [ ] No secret, key, or env value in any response body, log line, or thrown error (AFF-2).
- [ ] Path containment holds for any filesystem access (AFF-7).

**Honesty checklist (per item)**
- [ ] No unverifiable metric is displayed (every number traceable to a pure function or an
      upstream response).
- [ ] Unavailable data renders its explicit unavailable state (AFF-6).
- [ ] No silent fallback: if a fallback value is used, it is named in code and in the item's
      acceptance criteria.

**CI / quantitative fitness**
- Once item **P0-05** lands, CI enforces the gates above on every PR; until then the
  executing AI runs them locally and pastes results into the item's evaluation notes.
- **Coverage thresholds** are the quantitative fitness function. Note: `vitest.config.ts:9-13`
  currently collects v8 coverage with **no thresholds configured** — P0-05 (or its follow-up)
  introduces them; new modules must not lower the current covered-line ratio.

---

## 2. The Operating Loop (per work item)

The AI executes exactly this loop. One item at a time.

```
SELECT → CONTEXT → SPEC → TEST-RED → IMPLEMENT → EVALUATE → TRACK
```

1. **SELECT** — Pick the highest-priority item with `status: not-started`
   (P0 before P1 before P2; within a priority, lowest id first). Verify no other item is
   `in-progress` (rule R5.2). Set `status: in-progress`, `owner: <agent/session id>`,
   `updated: <today>` in the item frontmatter. Read the item file **fully**.
2. **CONTEXT** — Read the item's context pack in order, plus the referenced knowledge-base
   entries. Then **restate the requirement back** in your own words (problem, impact,
   invariants) before touching anything.
3. **SPEC** — Confirm the BDD scenarios against the code you just read; refine wording if
   reality drifted (correct stale `file:line` evidence in the item file). If any scenario is
   ambiguous, **ask the human** — do not improvise acceptance behavior. → G1.
4. **TEST-RED** — Write the failing tests named in the item's §4 *Tests to write first*.
   Run them; confirm they fail for the right reason. → G2.
5. **IMPLEMENT** — Minimal change, inside May-touch, obeying Must-not and all AFFs.
   Tests pass. → G3.
6. **EVALUATE** — Run all gates (§1 Stage 4). Fill the security + honesty checklists in the
   item file. Re-run the full suite. → G4.
7. **TRACK** — Update item frontmatter (`status`, `updated`, `pr`), tick acceptance-criteria
   checkboxes, and append **one line** to the dashboard changelog in
   `docs/work-plan/README.md` (`| date | item | title | status | pr |`). → G5.

If EVALUATE fails: loop back to IMPLEMENT (or SPEC if the scenario was wrong). Never
"fix the test to match the code" without an ADR.

---

## 3. Gate Definitions

| Gate | Name | Meaning | Checked by |
|---|---|---|---|
| G0 | item-ready | Item file complete: UC ids, context pack, BDD, constraints, evaluation section; evidence spot-checked. | SELECT |
| G1 | spec-approved | BDD scenarios exist, are unambiguous, and cover the named edge cases. | SPEC (human on ambiguity) |
| G2 | tests-red | The named tests exist and fail for the right reason. | TEST-RED |
| G3 | implementation-green | Named tests pass; diff inside May-touch; no AFF violated. | IMPLEMENT |
| G4 | all-gates-pass | `pnpm lint`, `pnpm test`, `pnpm build`, targeted vitest all pass; security + honesty checklists filled. | EVALUATE |
| G5 | tracked-done | Frontmatter updated, acceptance criteria ticked, changelog line appended, status `in-review` or `done`. | TRACK |

An item is **done** only at G5 *with* human/PR acceptance. An AI session may reach G4 and
set `status: in-review`; setting `done` requires merge/approval.

---

## 4. Status Transition Rules

```
not-started ──SELECT──▶ in-progress ──G4 pass──▶ in-review ──merged──▶ done
                            │                        ▲
                            └──gate fail / external dependency──▶ blocked
blocked ──blocker removed──▶ not-started (owner reset to unassigned)
```

- R5.1 `status` is one of: `not-started | in-progress | in-review | done | blocked`.
- R5.2 **Exactly one item may be `in-progress` per AI session.** Starting a second item
  before the first reaches `in-review`/`blocked` is a process violation.
- R5.3 `blocked` requires a `blocked_reason:` note added to the item file body (what, and
  what unblocks it).
- R5.4 Only the human (or merge event) moves `in-review → done`.
- R5.5 `owner` is set on SELECT and cleared when an item returns to `not-started`.

---

## 5. Prompt Template (human → AI agent)

Copy-paste, replacing the id:

```text
Execute work item P1-04 per docs/work-plan/AI_PROCESS.md.

Rules:
- Follow the Operating Loop (SELECT → CONTEXT → SPEC → TEST-RED → IMPLEMENT → EVALUATE → TRACK).
- Do not start implementation before G1; do not mark done before G5.
- Stay inside the item's May-touch paths; obey every Must-not and the global AFFs.
- If a constraint must be broken, STOP and write an ADR in docs/work-plan/adr/ first.
- If a BDD scenario is ambiguous, ask me before proceeding.
- Report gate results (G1–G5) and the exact commands you ran in your final summary.
```

Optional add-ons: `… and stop after TEST-RED for my review`, or `… dry-run: produce the
plan and test list only`.

---

## 6. When the Process Itself Changes

Changes to this file, the glossary, the UC catalog semantics, or the gate set are themselves
work: they require a PR and, when they alter a constraint or retire a fitness function, an
ADR (`docs/work-plan/adr/README.md`). The process is versioned with the repo; agents execute
the version in the branch they are working on.
