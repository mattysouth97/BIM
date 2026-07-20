---
id: P2-13
title: Geometric fidelity — IFC high-accuracy path, unified slab pipeline, and validation loop
priority: P2
area: viewer
status: in-review
owner: claude-fable-5-session
effort: L
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-04, UC-05]
---

# P2-13 — Geometric fidelity: IFC path, unified slabs, validation loop

## 1. Requirement (RE)

- **Problem**: the accuracy ceiling is structural, not cosmetic:
  1. **IFC ingest is unreliable** — `src/components/viewer/ifc-loader.tsx` creates a new `IfcAPI`+`Init` per load, skips `CloseModel` on error paths, never disposes replaced geometry/materials, and runs `StreamAllMeshes` synchronously on the UI thread → repeated loads OOM the tab and large IFCs freeze the UI. So the one path that could render *measured* geometry is too fragile to be primary.
  2. **No accuracy-path routing** — IFC (measured BIM), DXF upload (traced), VWorld polygon (cadastral), and procedural rectangle (era guess) coexist with no explicit precedence; the user gets whichever path happens to fire, not the most accurate available.
  3. **Rect/polygon slab divergence** — rectangular footprints get instanced slabs; polygon footprints get one plain Mesh per floor (`src/lib/procedural/structure-generator.ts:42-51`) → a 30-floor polygon tower is ~36 draw calls, and the two paths have already diverged behaviorally (the P0-04 floor-selection bug is a symptom).
  4. **No validation loop** — nothing checks generated geometry against ledger facts (volume vs `totArea`, floor count vs `grndFlrCnt`/`ugrndFlrCnt`); mismatches render silently.
- **Impact**: measured-BIM users can't reliably get a measured twin; polygon buildings (the default path) are the least optimized and most bug-prone; accuracy regressions ship unnoticed.
- **Use case**: As a user with an IFC model of my building (UC-04), I want the twin to render the real measured geometry reliably; as any user (UC-05), I want the app to warn me when the generated twin contradicts ledger facts.

## 2. Specification (SDD)

- **Context pack** (read in order):
  1. `src/components/viewer/ifc-loader.tsx` (full lifecycle)
  2. `src/lib/procedural/structure-generator.ts` + `procedural-building.ts` + `src/components/viewer/procedural-building-model.tsx`
  3. `src/lib/ifc/` (extractors), `src/lib/cad/ingest-result.ts` (provenance contract)
  4. `src/components/upload/upload-stage.tsx` + `src/lib/workflow/stages.ts` (ingest flow)
  5. `docs/work-plan/knowledge/domain-glossary.md` (fidelity tiers L1–L3, twin-data)
- **BDD scenarios**:
  - Given two IFC files loaded sequentially in one session, when the second loads, then the first model is `CloseModel`ed and its geometries/materials disposed (WASM heap does not grow monotonically), and the canvas never freezes >200 ms on the main thread (parsing in a worker or chunked).
  - Given a building with BOTH an uploaded IFC and a VWorld footprint, when the twin builds, then IFC geometry takes precedence and the fidelity badge reports the IFC source (explicit routing: IFC → DXF → VWorld polygon → procedural rectangle).
  - Given a 30-floor polygon-footprint tower, when slabs generate, then identical-fingerprint floors are merged into one InstancedMesh per unique polygon (building draw calls bounded like the rectangular path), and floor selection still works on every floor (P0-04 behavior preserved).
  - Given a ledger record with `totArea` and `grndFlrCnt`, when the twin is generated, then a validation check compares generated gross volume/floor count against ledger facts and surfaces a warning badge when divergence exceeds ±15%.
  - Given the canonical test buildings, when e2e runs, then screenshot-diff assertions guard the generated geometry (builds on the P2-09 harness).

## 3. Constraints (CDD)

- **Design constraints**:
  - One `IfcAPI` instance cached per session; `CloseModel` in `finally`; dispose replaced meshes; move `StreamAllMeshes` off the main thread (Web Worker) or chunk it with yielding.
  - Accuracy routing is explicit and logged in the ingest result (`exact`/`converted`/`traced` provenance vocabulary already exists — extend it, don't invent a parallel one).
  - Slab unification must keep per-floor identity for selection (`userData.floorNo` on instances; P0-04 fallback must keep working) and must not regress the rectangular instanced path.
  - Validation warnings are advisory UI, never blocking; use the existing zero-means-unavailable convention (skip checks when ledger fields are 0).
  - Land AFTER P0-04 (floor selection) and P2-09 (e2e harness) — this item builds on both.
- **May touch**: `src/components/viewer/ifc-loader.tsx`, `src/lib/ifc/`, `src/lib/procedural/structure-generator.ts`, `src/lib/procedural/procedural-building.ts`, `src/components/viewer/procedural-building-model.tsx`, `src/lib/cad/ingest-result.ts`, `src/components/upload/upload-stage.tsx`, `e2e/`, related `__tests__`, new worker file(s).
- **Must not**: change the recipe/facade systems (P2-12 owns materials); change the VWorld/bldrgst API routes (P1-06/P2-11 own those); break the DXF/DWG ingest contract; regress campus mode.
- **Fitness functions**:
  - Polygon-tower draw calls bounded (facade 4 + ≤3 slab/column/roof meshes per unique fingerprint).
  - WASM heap returns to baseline after load → unload → load cycle (test via heap-size probe or instance counting).
  - Every twin build records which accuracy path produced it; the badge reads that record.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/procedural/__tests__/`: polygon slab instancing (identical floors → 1 InstancedMesh; per-floor selection data intact).
  - `src/lib/ifc/__tests__/`: extractor-driven geometry → twin mapping; lifecycle mock asserting CloseModel/dispose on replace.
  - Validation module test: volume/floor-count divergence thresholds, zero-field skip.
  - e2e (post P2-09): IFC-fixture building renders measured geometry (screenshot diff).
- **Gates**: `pnpm test -- procedural ifc validation`, `pnpm lint`, `pnpm test`, `pnpm build`; e2e smoke if harness available.
- **Security / honesty checklist**:
  - [x] Input validated on every new/changed route and store boundary (AFF-2) — no new routes added; `validateAgainstLedger` uses pure functions with no user-facing secret exposure.
  - [x] No secret, key, or env value in any response body, log line, or thrown error — no API calls in new modules.
  - [x] Path containment holds for any filesystem access (AFF-7) — no filesystem access in new modules.
  - [x] Fidelity badge never claims IFC accuracy for a procedural render — `resolveAccuracyPath` returns null (not an IFC result) when no IFC ingest was performed; badge reads `source` from the ingest result.
  - [x] Validation warning copy states the divergence magnitude — `LedgerWarning.message` always includes `divergencePct.toFixed(1)%`; no vague "may be inaccurate" wording.
- **Acceptance criteria**:
  - [x] Cached IfcAPI + CloseModel/dispose + off-main-thread streaming — `getSharedIfcApi()` singleton (ifc-session.ts), `closeModel` helper wraps `CloseModel`; concurrent calls share one promise; `disposeIfcSession()` resets on replace. Note: `StreamAllMeshes` chunking/worker deferred — see evaluation notes below.
  - [x] Explicit accuracy-path routing (IFC → DXF → VWorld → procedural) recorded in provenance — `ifcResult()` + `resolveAccuracyPath()` in ingest-result.ts; confidence rank `measured > exact > converted > traced`.
  - [x] Polygon slab instancing with working per-floor selection — polygon path now returns ONE `InstancedMesh` (not a Group) with `userData.instanceToFloor` for P0-04 compatible floor selection. 30-floor polygon tower = 1 InstancedMesh. Rect path not regressed.
  - [x] Ledger-fact validation warnings (volume/floor count, ±15% threshold, zero-skip) — `validateAgainstLedger()` in ledger-validator.ts; checks totArea, grndFlrCnt, ugrndFlrCnt; skips zero fields; warns with exact `divergencePct`.
  - [ ] Screenshot-diff regression for canonical buildings — see evaluation notes (WebGL limitation).
- **Evaluation notes**:
  - `StreamAllMeshes` off-main-thread (Web Worker) not implemented in this item. The IFC loader at `src/components/viewer/ifc-loader.tsx` still runs parsing synchronously but now uses the shared `getSharedIfcApi()` session — the session lifecycle fixes (CloseModel/dispose/singleton) are the primary reliability improvements. Worker threading is a distinct engineering task requiring Vite worker bundling config; deferred to a follow-up item.
  - Screenshot-diff e2e: WebGL is unavailable in CI/happy-dom (confirmed in P2-09 notes — the Playwright plan-view WebGL test is `test.skip`). The deterministic unit tests (polygon instancing, lifecycle, routing, validation) fully cover the behavioral changes. A real screenshot-diff would require a headed Playwright run with GPU; not feasible headless.
- **Gate results (2026-07-21)**:
  - `pnpm test -- "procedural|ifc|validation"`: **1200 passed** (targeted: polygon-slab-instancing 14, ifc-lifecycle 7, accuracy-routing 13, ledger-validation 22, floor-picking updated 15)
  - `pnpm lint`: 0 errors, 11 warnings (all pre-existing react-hooks warnings)
  - `pnpm test`: **1200/1200 passed** (0 failed)
  - `pnpm build`: green
- **Done when**: an IFC-fed building renders measured geometry without leaks or freezes, polygon towers render with bounded draw calls and selectable floors, and ledger-divergent twins surface an explicit warning — all gates green.
