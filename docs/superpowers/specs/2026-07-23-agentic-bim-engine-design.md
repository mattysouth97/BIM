# Agentic BIM Engine — TS-Native Design (Slice 1)

**Date:** 2026-07-23
**Branch:** `feat/digital-twin-pivot`
**Status:** Approved for spec review → planning
**Author:** pm-architect orchestration session

## 1. Context

An enterprise blueprint ("Agentic BIM Generation Engine") proposes a Python stack —
LangGraph, PostgreSQL/PostGIS, IfcOpenShell/OpenCASCADE, SymPy/Z3, Celery, Kubernetes,
Xeokit — to turn heterogeneous AEC inputs (DWG/DXF, OCR floor plans, LiDAR, spec sheets)
into validated IFC4 models with per-element confidence and a human-in-the-loop (HITL)
review gate.

This repository is a **Next.js 16 / React 19 / TypeScript** app deployed on Vercel. The
blueprint's Python runtime and native CAD kernels cannot run inside it. However, ~70% of
the blueprint's *intent* is already implemented here in browser-native TS/WASM:

| Blueprint component | Status in repo | Location |
|---|---|---|
| Vector parser (DWG/DXF → geometry) | Built, with provenance badging | `src/lib/cad/` |
| Multi-modal ingest & fusion | Partial (CAD + VWorld public data) | `src/lib/cad/`, `/api/vworld/footprint` |
| IFC kernel | **Read-only** (extract, not write) | `src/lib/ifc/` |
| QC / validation | Partial | `src/lib/data-quality/`, ledger-fact validation |
| Confidence + HITL | Project-level only | `src/lib/fidelity/` |
| Orchestration state machine | UI stage-gate, not a data pipeline | `src/lib/workflow/stages.ts` |

**Decision (user-approved):** Deliver the engine as a TS-native orchestration layer over
the existing code, not as a Python sidecar. `web-ifc@0.0.77` — already a dependency — can
*write* IFC (CreateModel / WriteLine / SaveModel), so the largest gap (IFC generation)
needs no new runtime or native dependency.

## 2. Goals & Non-Goals

### Goals (Slice 1)

1. A pure, headless engine module `src/lib/engine/` exposing `runEngine(input)` that runs a
   deterministic DAG: **ingest → fuse → generate-IFC → validate → score**.
2. Generate a **valid, downloadable IFC4 file** from footprint + floor data: walls per
   footprint edge (`IfcWallStandardCase`) and slabs per floor (`IfcSlab`), inside a proper
   `IfcProject / IfcSite / IfcBuilding / IfcBuildingStorey` spatial hierarchy.
3. **Per-element** confidence scoring with an explicit weighted formula, emitting HITL flags
   for elements scoring `< 0.85`.
4. Wire the engine into the existing twin stage: an "Export IFC" action and HITL flags
   surfaced through the existing `fidelity-detail-panel` and R3F viewer.
5. Full TDD coverage per module; a golden IFC fixture pinned in tests.

### Non-Goals (explicitly deferred, honestly labeled in UI/docs as future)

- OCR extraction of door/window schedules from raster floor plans.
- LiDAR / point-cloud RANSAC plane detection.
- Z3/SymPy symbolic constraint solving (Slice 1 uses a deterministic resolver).
- PostGIS spatial memory (Slice 1 uses in-memory state + existing Zustand stores).
- `IfcDoor` / `IfcWindow` opening generation (candidate for Slice 2).
- Any LLM call that emits geometry. LLM use, if introduced later, is advisory and
  structured-output-only, honoring the blueprint's "Deterministic Wall Rule."

## 3. Architecture

New module `src/lib/engine/`, framework-free (no React, no store imports), so it is unit
testable and callable headlessly.

```
runEngine(input)                      // engine/orchestrator.ts — reducer chain
   │
   ├─ ingest(input)   → SpatialFeature[]      // engine/steps/ingest.ts
   ├─ fuse(features)  → FusedModel + Conflict[]// engine/steps/fuse.ts
   ├─ generateIfc(m)  → { ifcBytes, elements } // engine/steps/generate-ifc.ts
   ├─ validate(ifc,m) → ValidationReport        // engine/steps/validate.ts
   └─ score(m,val)    → ElementConfidence[] + HitlFlag[] // engine/steps/score.ts
   ▼
BimEngineResult { ifcBytes, elements, hitlFlags, conflicts, report }
```

### Module contracts

| Module | Signature (intent) | Reuses |
|---|---|---|
| `engine/types.ts` | `SpatialFeature`, `FusedModel`, `ElementConfidence`, `HitlFlag`, `BimEngineInput`, `BimEngineResult`, `SourceKind` | — |
| `engine/orchestrator.ts` | `runEngine(input: BimEngineInput): Promise<BimEngineResult>` | — |
| `engine/steps/ingest.ts` | `ingest(input): SpatialFeature[]` | `cad/ingest-result`, `fidelity/input-provenance`, ledger facts, VWorld attrs |
| `engine/steps/fuse.ts` | `fuse(features): { model: FusedModel; conflicts: Conflict[] }` | `cad/line-stitcher` tolerance snapping |
| `engine/steps/generate-ifc.ts` | `generateIfc(model, session): Promise<{ ifcBytes: Uint8Array; elements: GeneratedElement[] }>` | `gis/earcut-extrude`, `procedural/recipe`, extended `ifc/ifc-session` |
| `engine/steps/validate.ts` | `validate(ifcBytes, model, session): Promise<ValidationReport>` | `data-quality/quality-scorer`, ledger-fact validation |
| `engine/steps/score.ts` | `score(model, validation): { elements: ElementConfidence[]; hitlFlags: HitlFlag[] }` | `fidelity/*` |

### Source-resolution hierarchy (fuse step, deterministic)

Priority for geometry & dimensions, highest first:

1. CAD vector (`exact` > `converted` > `traced`) — footprint outline & angular orientation.
2. VWorld measured attributes (`LT_C_SPBD`: `buld_hg`, floor counts) — height/floors.
3. Building ledger facts (건축물대장) — floors, area, use.
4. Era estimate (recipe defaults) — last-resort fallback.

Conflicts (e.g., CAD-derived height vs. VWorld measured beyond tolerance) are recorded as
`Conflict[]` with the losing source noted; they lower affected elements' confidence but do
not block generation in Slice 1.

## 4. IFC Generation (the new capability)

`generate-ifc.ts` uses `web-ifc`'s write API through an **extended** `ifc-session.ts` shim.
The current shim only types read methods (`OpenModel`, `StreamAllMeshes`, `GetGeometry`);
we add the write surface (`CreateModel`, `WriteLine` / raw line writing, `SaveModel` /
`ExportFileAsIFC`). The implementing agent MUST verify the exact web-ifc 0.0.77 API against
its shipped `.d.ts` before coding (per `AGENTS.md`: read the docs first).

Geometry is **deterministic**, built by TS/kernel code, never by an LLM:

- Footprint ring (meters, XZ-plane, origin-centered — the repo's canonical convention) →
  `IfcArbitraryClosedProfileDef`.
- Walls: one `IfcWallStandardCase` per footprint edge, extruded to storey height via
  `IfcExtrudedAreaSolid`; thickness from recipe/structure defaults.
- Slabs: one `IfcSlab` per floor at its storey elevation, profile = footprint.
- Spatial containment via `IfcRelContainedInSpatialStructure`; storeys under building
  under site under project. Units set to metres (`IfcUnitAssignment`).

Each emitted IFC entity is tracked as a `GeneratedElement { expressId, kind, sourceKind,
storey }` so the score step can attribute confidence per element.

## 5. Confidence Scoring & HITL (per-element)

Adapts the blueprint formula to Slice-1 inputs (OCR/point-cloud terms absent, weights
renormalized; documented as such):

```
Sconf(element) = w_geom · S_geom + w_height · S_height − P_topology
  w_geom = 0.6, w_height = 0.4
  S_geom   : cad-exact 1.0 | cad-converted 0.85 | cad-traced 0.70 | vworld 0.80 | estimate 0.50
  S_height : ledger 1.0 | vworld-measured 0.80 | era-estimate 0.50
  P_topology (additive penalty, max 0.2): +0.2 if the element fails a validation check
             (non-closed footprint ring, slab-area mismatch > 2%, non-manifold wall)
```

Elements with `Sconf < 0.85` produce a `HitlFlag { expressId, reason, sconf }`. Flags render
in `fidelity-detail-panel`; the R3F viewer is the review surface (highlight flagged
elements). This preserves the repo's honesty discipline: estimated inputs never masquerade
as measured.

## 6. Validation checks (Slice 1)

- Footprint ring closes (first == last within tolerance).
- Each generated slab area is within 2% of the footprint polygon area.
- Storey count and elevations are monotonic and match the floor spec.
- Re-open the generated `ifcBytes` with the read session and confirm entity counts match
  what was written (round-trip sanity).
- Reuse `data-quality/quality-scorer` for the aggregate project score; keep the existing
  ±15% ledger-fact validation for dimensional plausibility.

## 7. Wiring (user-visible)

- Twin stage calls `runEngine` for the active building; result cached per PK in a thin
  store slice (not persisted — regenerable).
- "Export IFC" control downloads `ifcBytes` as `<title>.ifc`.
- `HitlFlag[]` feed `fidelity-detail-panel`; flagged elements are highlightable in the
  viewer. No new full-screen UI in Slice 1.

## 8. Cleanup scope (targeted, safe)

Not an indiscriminate mass delete. Limited to:

- Dead glue the engine supersedes (verified unreferenced via search before deletion).
- Stale artifacts consistent with the completed P2-08 sweep, only if re-confirmed dead.

Executed **only after** a clean commit checkpoint and **never** touching the uncommitted
P2-24–P2-28 in-review files. Each deletion is justified by a grep showing zero references.

## 9. Testing strategy

- TDD per module (red first). Each step has isolated unit tests against `engine/types.ts`.
- `web-ifc` mocked in unit tests (as `ifc-lifecycle.test.ts` already does); one integration
  test exercises real write→read round-trip behind the existing WASM harness.
- A golden IFC fixture (small rectangular 2-storey building) pins `generate-ifc` output
  structure (entity kinds/counts), tolerant to non-deterministic GlobalIds.
- Gates: `pnpm lint` (0 errors), `pnpm test` (all pass, coverage floors respected),
  `pnpm build` (green). CI (`ci:check`) enforces on push.

## 10. Operational constraints

- A second session is live on this repo (`ddbdb470…`). Engine work lands in **new files**
  under `src/lib/engine/` to minimize collision with concurrent edits.
- Commits stage explicit paths only; never `git add -A` while P2-24–P2-28 are in-review.
- Stay on `feat/digital-twin-pivot`.

## 11. Subagent decomposition (for parallel execution)

1. **Foundation (serial):** `engine/types.ts` — the shared contract. Blocks everything.
2. **Parallel wave (against the frozen contract):**
   - Agent A: `ingest.ts` + tests
   - Agent B: `fuse.ts` + tests
   - Agent C: extend `ifc-session.ts` write shim + `generate-ifc.ts` + tests (verifies
     web-ifc write API first)
   - Agent D: `score.ts` + tests
3. **Integration (serial):** `orchestrator.ts` + `validate.ts` (validate depends on
   generate) + wiring + integration test + golden fixture.
4. **Verification pass (separate lane):** independent reviewer/verifier runs gates and
   reviews the diff before completion. No self-approval in the authoring context.

## 12. Success criteria

- `runEngine` on a footprint + floors produces IFC4 bytes that re-open cleanly in the read
  session and validate against §6.
- Per-element confidence + `<0.85` HITL flags computed and rendered.
- "Export IFC" downloads a file that opens in a standard IFC viewer.
- All gates green; new code TDD-covered; no fake/stub/skip placeholders.
- Deferred capabilities (OCR/LiDAR/Z3/openings) labeled honestly, not stubbed as done.

## 13. Risks

- **web-ifc write API drift** — mitigate by verifying against shipped types before coding.
- **Concurrent-session collision** — mitigate via new-file isolation + explicit-path commits.
- **Confidence weights are heuristic** — documented as Slice-1 renormalization, not
  presented as validated ground truth.
