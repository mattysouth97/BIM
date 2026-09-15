# BIMFIT — Korean Building Energy Repository

## What This Is

BIMFIT turns incomplete evidence about a Korean building into a defensible energy
and retrofit assessment. The 건축물대장 (building register) is the primary entry:
pick a real building and its register row becomes a multi-storey baseline energy
model with no further input, which the user then refines toward a digital twin with
drawings, plans and MEP data while watching the energy delta move.

From v6.0 the product grows a second face. The single-building assessment becomes the
generator for a **building energy repository**: a calibrated corpus of Korean building
energy baselines, published as versioned datasets with stated provenance and error
bands, anchored by a small set of measured reference models.

## Core Value

Every number the product states can be traced to either a cited source or a named,
visible, reversible assumption — and that guarantee holds when the same method is
applied to one building or to a population.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ 건축물대장 search and register-to-baseline energy model — v1.0–v5.0, extended through the 2026 ledger-first pivot
- ✓ Source-traceable design-stage energy diagnosis with provenance facts and assumption ledger — P0-06
- ✓ Seven integrated reference models with measured envelopes, material bindings and MEP inventory — 2026-09
- ✓ Published per-building energy datasets (JSON/CSV, schema 1.3.0) with licences, hashes, units, inputs and assumptions
- ✓ Catalogue and per-building dataset endpoints under `/api/reference-buildings`
- ✓ Retrofit measure selection by physical work, with DCF economics (NPV/IRR/payback/knapsack) and 그린리모델링 cost data
- ✓ Measured roof-plane photovoltaic layout replacing bounding-box placement
- ✓ Canonical MEP graph engine with coordination, clash and connectivity validation
- ✓ Evidence-to-CAD reconstruction for buildings with no drawing (ADR-003)
- ✓ Landing gallery as the model showcase, register lookup at `/diagnostics/new?method=ledger` (ADR-004)

### Active

<!-- v6.0 Building Energy Repository. Hypotheses until shipped. -->

- [ ] Grow the reference-model anchor set: Korean buildings, buildings with measured consumption, missing typologies, further licensed sources
- [ ] Collapse the two hand-synced model registries into one derived source of truth
- [ ] Make lighting, photovoltaic and heat-recovery measures move the modeled energy and the grade
- [ ] Replace the return-focused retrofit panel with energy, carbon, corpus position and evidence
- [ ] Return economics priced only off real modeled savings
- [ ] Establish whether the register can be swept at scale, and on what quota
- [ ] Generate corpus baselines at scale and calibrate them against the measured anchors
- [ ] Publish the corpus as versioned dataset releases with a stated error band and a read-only API

### Out of Scope

- Subsidy and support-program financing controls — removed at user request 2026-09-07; the domain functions remain but no reachable control selects them
- A fifth workflow step or a second front door — the four-step shape is a settled product decision (2026-08-27); the repository is an outlet of the existing steps, not a parallel entry
- Metered-energy claims for reference models — no meter series is ingested; every published energy figure is modeled, and the dataset says so
- Photorealistic rendering — the goal is structural unambiguity, not architectural visualisation
- The v6.0 Audit Deliverables plan (undo/redo, element IDs, annotations, auto-views, schedules, PDF sheets) — superseded 2026-09-15; partial work archived, not deleted
- The v7.0 Prediction plan (portfolio forecasting via trained model and Parquet releases) — superseded 2026-09-15; its dataset-release idea is absorbed into this milestone, its ML approach is not

## Current Milestone: v6.0 Building Energy Repository

**Goal:** Turn BIMFIT from a single-building diagnosis tool into a building energy
repository, where a calibrated corpus of Korean building baselines is the product, the
measured reference models are its calibration anchors, and the retrofit panel reports
honest energy, carbon and corpus position instead of proxy-priced return.

**Target features:**
- Grow the anchor set with Korean, metered, typology-gap and further licensed models
- Collapse the duplicate model registries so adding a building is one act, contract-tested
- Fix the delivered-energy split so lighting and renewable measures reach the grade
- Replace the return panel with energy, carbon, corpus position and verification guidance
- Restore economics on real modeled savings only
- Research register sweep feasibility, then generate and calibrate corpus baselines
- Publish versioned corpus releases and a read-only API

## Context

**Planning history.** `.planning/` went stale between 2026-04 and 2026-09 while the real
work was tracked in `docs/work-plan/` and `docs/04_Agent-Handoffs/CURRENT.md`. Two
milestones, v6.0 Audit Deliverables and v7.0 Prediction, were declared in progress and
stalled in April. Both are superseded here. Their phase records are archived, not deleted.
Treat `docs/04_Agent-Handoffs/CURRENT.md` as the authority on verified runtime state.

**The single gate on honest retrofit physics.** `src/lib/energy/delivered-from-demand.ts`
splits modeled demand into fuels with `electric = cooling + 0.15 × total`,
`gas = heating + 0.10 × total` and `renewable = 0`. Because the lighting share is a flat
ratio and renewable is a literal zero, no lighting or photovoltaic measure can move the
headline intensity or the grade, however real its own savings formula is. This is
self-documented in four places in the source and in the current handoff. It is the
precise target of the physics work in this milestone.

**Two economics input paths that can disagree.** The twin reads material-store plus
scenario-store, the 간이 모델 path. Diagnostics reads a frozen engine payload. Both end at
the same generators and the same DCF engine, so the same building can be priced two ways.
The twin's energy is still not the canonical traceable engine, which remains the top open
issue in the handoff.

**Two registries for one roster.** `REFERENCE_BUILDING_IDS` in
`src/lib/reference-buildings/manifest.ts` and `GALLERY_ITEMS` in `src/lib/landing/gallery.ts`
are hand-synced, joined only by an href string, and the clinic's identifiers differ between
them. Around fifteen test files loop the first registry as de facto contract tests, but only
the clinic card is cross-checked against its generated manifest. The rest are hand-typed
literals, recorded as debt in ADR-004.

**The corpus generator already exists in embryo.** `buildLedgerBaselineModel` is a pure,
version-stamped function that reports insufficiency rather than guessing, and the register
proxy already pages buildings per 법정동 and reports a total count. The caps in the current
route are product safety limits, not upstream ones. What is unknown is quota at sweep scale.

**Dead code adjacent to the work.** `src/components/twin/capex-input.tsx` has no production
importer, and `DEFAULT_CAPEX_BUDGET_KRW` in `src/store/scenario-store.ts` is exported and
never imported. Both sit in the surface this milestone reworks.

## Constraints

- **Tech stack**: Next.js 16.2 App Router, React 19.2, TypeScript, Three.js 0.182 with React Three Fiber 9, Zustand 5, TanStack Query 5, Tailwind 4, shadcn/ui, Vitest 4, Playwright — established and not under review this milestone
- **Product shape**: 건물 검색 → 도면 업로드 → 디지털 트윈 → 보고서 is fixed; build inside it
- **Traceability**: `createEnergyFact` throws unless a fact cites sources, names an assumption, or is explicit user input — a convenience helper that attaches register references to a defaulted value would kill the guarantee
- **Data source**: data.go.kr 건축HUB requires `bjdongCd`; the shared demo key is rate-limited per address; the four register endpoints fail independently and must never all be required
- **Deployment**: functions pinned to Seoul (`icn1`) in `vercel.json`; VWorld refuses other egress regions
- **Licensing**: no reference-building artifact ships without an established licence and rights holder
- **Test suite**: around 380 tests across 29 files exercise retrofit economics; around fifteen files loop the model registry. Changes here are contract changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| The corpus is the product; reference models are calibration anchors; datasets and API are the outlet | A hand-curated library does not scale into software, but register-generated baselines do, and the measured models are the only way to state how wrong they are | — Pending |
| Economics returns, priced only off real modeled savings | Removing money loses the professional decision; keeping proxy-priced money loses credibility | — Pending |
| Reclaim the v6.0 number and restart phase numbering at 1 | The old v6.0 and v7.0 plans stalled in April and are superseded; a clean restart marks the pivot honestly | — Pending |
| Fix `delivered-from-demand.ts` before anything downstream | Until lighting and renewable reach the grade, every energy, carbon and benchmark figure built on it is decoration | — Pending |
| Register sweep feasibility is researched before any phase commits to scale | Quota, not capability, is the open risk; committing first would be planning on an assumption | — Pending |

## Completed Milestones

- v5.0: Energy Systems Observability & Control (7 phases, 16 plans — shipped 2026-04-12)
- v4.0: GIS-Composite Realistic Drafts (3 phases, 7 plans — shipped 2026-04-12)
- v3.0: UX Workflow Overhaul (5 phases, 16 plans — shipped 2026-04-03)
- v2.0: Advanced BIM Authoring (5 phases, 11 plans — shipped 2026-03-28)
- v1.0: Procedural BIM Viewer with Multi-Layer Building Systems (9 phases)

Work between 2026-04 and 2026-09 shipped outside this planning system and is recorded in
`docs/work-plan/` and `docs/04_Agent-Handoffs/`.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-15 after starting milestone v6.0 Building Energy Repository*
