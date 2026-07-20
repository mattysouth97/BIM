# GreenRetrofit Simulator — Tracked Work Plan

Master dashboard for the remediation plan produced by the full-codebase review of **2026-07-21**
(11 parallel review tracks; gates executed: `pnpm lint` 0 errors, **902/902 tests pass**, `pnpm build` green).
Every work item follows the project's AI development process — read **[AI_PROCESS.md](./AI_PROCESS.md)** before executing any item.

## The process (SW 공학 기반의 AI 에이전트 코딩)

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│  1. Upfront Requirements │   │  2. Spec-Driven Dev't    │   │  3. Constraint-Driven    │   │  4. Eval-Driven Dev't    │
│      Engineering (RE)    │──▶│          (SDD)           │──▶│        Dev't (CDD)       │──▶│          (EDD)           │
│                          │   │                          │   │                          │   │                          │
│ Business process +       │   │ Use Cases → BDD          │   │ BDD + Context → Tests    │   │ TDD + AFFs + Security +  │
│ semantic model →         │   │ Semantic model →         │   │   → TDD (red first)      │   │ Compliance + Honesty +   │
│ Use Cases                │   │ Knowledge base → Context │   │ Design rules + ADR →     │   │ Cost controls → CI/CD    │
│                          │   │                          │   │ Architecture Fitness Fn  │   │                          │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

| Stage | Artifact in this repo |
|---|---|
| 1. RE | [knowledge/domain-glossary.md](./knowledge/domain-glossary.md) (semantic model) · [knowledge/use-cases.md](./knowledge/use-cases.md) (UC-01…UC-10) |
| 2. SDD | Each `items/P*.md` — §2 Specification: context pack + BDD scenarios |
| 3. CDD | Each `items/P*.md` — §3 Constraints: may-touch / must-not / fitness functions · [adr/](./adr/README.md) |
| 4. EDD | Each `items/P*.md` — §4 Evaluation: TDD tests, gates, security & honesty checklist |

**Operating loop per item:** SELECT → CONTEXT → SPEC → TEST-RED → IMPLEMENT → EVALUATE → TRACK (gates G0–G5, exactly one `in-progress` item per AI session).
**Hand an item to an AI agent with:** `Execute work item P1-04 per docs/work-plan/AI_PROCESS.md`

## Status dashboard

Legend — status: ⬜ not-started · 🔵 in-progress · 🟣 in-review · ✅ done · ⛔ blocked

### P0 — Blockers (week 1)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P0-01](./items/P0-01-secure-twin-data-routes.md) | Secure twin-data routes against path traversal and unauthenticated writes | api | M | UC-04, UC-05 | ✅ |
| [P0-02](./items/P0-02-wire-savings-into-report.md) | Wire scenario savings (NPV/IRR/payback) into report outputs | report | M | UC-06, UC-08 | ⬜ |
| [P0-03](./items/P0-03-korean-pdf-font.md) | Register a CJK font so Korean PDF export stops rendering tofu | report | S | UC-08 | ✅ |
| [P0-04](./items/P0-04-polygon-floor-selection.md) | Fix floor selection on the polygon-footprint rendering path | viewer | S | UC-05 | ✅ |
| [P0-05](./items/P0-05-ci-pipeline.md) | Add GitHub Actions CI, coverage thresholds, and close the release-guard hole | infra | M | UC-01, 05–08 | ⬜ |

### P1 — Correctness of the savings engine (month 1)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P1-01](./items/P1-01-knapsack-mutual-exclusion-interaction.md) | Enforce mutually exclusive measures and damp interaction double-counting | retrofit | L | UC-06, UC-07 | ⬜ |
| [P1-02](./items/P1-02-measure-lifetimes.md) | Add measure lifetimes, truncate cash flows, add generator-level tests | retrofit | M | UC-06, UC-07 | ⬜ |
| [P1-03](./items/P1-03-fuel-aware-pricing.md) | Thread heating fuel type into envelope/HVAC generators; price district heating | retrofit | M | UC-06, UC-07 | ⬜ |
| [P1-04](./items/P1-04-fix-system-ratios-use-codes.md) | Correct SYSTEM_RATIOS use-code keys against the real MOLIT 용도코드 table | energy | S | UC-03, UC-06 | ⬜ |
| [P1-05](./items/P1-05-benchmark-units-grading-scale.md) | Fix benchmark unit mismatch and retire dual grading scales | energy | M | UC-03, UC-08 | ⬜ |
| [P1-06](./items/P1-06-api-hardening-sweep.md) | API hardening sweep — traversal, error contracts, proxy factory, batch caps, zod | api | L | UC-01, 02, 04 | ⬜ |
| [P1-07](./items/P1-07-a11y-chart-repair.md) | Accessibility and chart repair — Tab hijack, keyboard-inert rows, black bars | ux | M | UC-01, 03, 05, 06 | ⬜ |
| [P1-08](./items/P1-08-state-consistency.md) | State consistency — one effective-recipe hook, guard-aware stepper, active building | state | L | UC-05, 06, 08 | ⬜ |

### P2 — Model completeness & product coherence (quarter)

| ID | Title | Area | Effort | UC | Status |
|---|---|---|---|---|---|
| [P2-01](./items/P2-01-infiltration-ventilation-loss.md) | Add infiltration/ventilation heat loss to energy model | energy | M | UC-05, UC-06 | ⬜ |
| [P2-02](./items/P2-02-per-fuel-co2.md) | Per-fuel CO2 factors and fuel-split demand result | energy | S | UC-07, UC-08 | ⬜ |
| [P2-03](./items/P2-03-app-router-conventions.md) | Adopt App Router conventions (error/loading/not-found, metadata, fonts, link) | infra | M | UC-01, UC-03 | ⬜ |
| [P2-04](./items/P2-04-readme-product-identity.md) | Rewrite README and retitle landing hero to the GreenRetrofit identity | docs | S | UC-01 | ⬜ |
| [P2-05](./items/P2-05-ml-release-honesty.md) | Make the v0.1.0 ML release honest — build the pipeline or strip the metrics | ml | M | UC-10 | ⬜ |
| [P2-06](./items/P2-06-i18n-consolidation.md) | Consolidate i18n onto a single t(ko,en) catalog honoring the language store | ux | L | UC-01, 05–08 | ⬜ |
| [P2-07](./items/P2-07-persistence-hardening.md) | Harden persisted stores — versioning, API-key policy, building-scoped annotations | state | M | UC-04, 05, 06 | ⬜ |
| [P2-08](./items/P2-08-dead-code-doc-drift.md) | Delete dead code, fix doc drift, remove stray artifacts | infra | M | UC-05 | ⬜ |
| [P2-09](./items/P2-09-e2e-rewrite.md) | Rewrite e2e suite around the real user journey with mocked APIs | infra | M | UC-01, 03, 05, 08 | ⬜ |
| [P2-10](./items/P2-10-financial-model-refinements.md) | Financial model refinements — loan-term buy-down, rate honesty, solar fixes, sourced costs | retrofit | L | UC-06, 07, 08 | ⬜ |

## Sequencing constraints

- **P0-01 before P1-06** — both touch API routes; land the twin-data security fix first.
- **P1-01 → P1-02 → P1-03** — all touch `src/lib/retrofit/` generators and `economic-model.ts`; land sequentially in this order (one session each).
- **P1-08 before P1-05** — both edit `src/hooks/use-energy-metrics.ts`; P1-08 consolidates the hook first. Inside P1-08, follow its internal order (c) → (a) → (d) → (b).
- **P1-04 before P2-01 / P2-02** — energy-engine corrections land before model extensions build on them.
- **P0-02 before P2-10** — the report wiring establishes the data path that P2-10's rate-honesty fixes then refine.
- **P0-05 early** — once CI lands, every later item is gate-enforced automatically (EDD stage becomes self-policing).
- **P2-08 last** — dead-code deletion is safest after the items that might touch those files have landed.

## Changelog

| Date | Item | Change | Agent/session |
|---|---|---|---|
| 2026-07-21 | all | Work plan created from 11-track code review (23 items; process + knowledge base seeded) | orchestrator swarm |
| 2026-07-21 | P0-01 | Twin-data routes hardened: slug+containment validation, timing-safe POST auth (fail-closed), 64 KB cap, no path leak, honest lastUpdated | claude-fable-5-ultrawork |
| 2026-07-21 | P0-04 | Polygon-path floor clicks now select via userData.floorNo fallback (resolvePickedFloor helper + getFloorByFloorNo); manual viewer smoke still pending | claude-fable-5-ultrawork |
| 2026-07-21 | P0-03 | NotoSansKR (subset OTF, OFL) registered for PDF export; all 7 Helvetica refs replaced; toast.error on PDF failure; embedding proven by PDF-bytes test | claude-fable-5-ultrawork |
