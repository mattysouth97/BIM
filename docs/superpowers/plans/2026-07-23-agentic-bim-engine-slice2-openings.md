# Agentic BIM Engine — Slice 2: IFC Window Openings

> Extends Slice 1 (`src/lib/engine/`). Same discipline: pure modules, strict TDD, honest
> provenance, verified by the real `web-ifc-node.wasm` round-trip test.

**Goal:** Generate real `IfcWindow` openings (hosted in the generated walls) from the
procedural facade recipe, scored honestly as estimated (era-default placement → HITL-flagged).

## Global constraints
- Coordinates meters/XZ/origin-centered. Engine modules stay PURE (no React/WASM at module scope).
- web-ifc entity codes/field shapes for `IfcOpeningElement`, `IfcRelVoidsElement`, `IfcWindow`,
  `IfcRelFillsElement` MUST be verified against `node_modules/web-ifc/web-ifc-api.js` — do NOT guess.
- Windows are estimated (facade recipe = era defaults). They MUST score `< 0.85` (HITL-flagged),
  never presented as measured.
- Do NOT touch `src/lib/campus/**`, `src/hooks/use-campus-buildings.ts`,
  `src/app/api/vworld/footprint/route.ts` (concurrent session).
- Gates: `pnpm exec vitest run src/lib/engine` green + the real round-trip integration test green.
- Do NOT git commit — the controller commits.

## LANE A — contract + pure logic (do first; blocks Lane B)

Files: `src/lib/engine/types.ts`, `src/lib/engine/steps/fuse.ts`, `src/lib/engine/steps/ingest.ts`,
`src/lib/engine/steps/score.ts`, `src/lib/engine/build-engine-input.ts`, and their `__tests__`.

- **types.ts:**
  - `ElementKind` gains `"window"`.
  - Add `export interface FacadeParams { windowWidth: number; windowHeight: number; sillHeight: number; windowSpacing: number; }`.
  - `BimEngineInput` gains `facade?: FacadeParams`.
  - `FusedModel` gains `facade: FacadeParams | null` and `facadeSource: SourceKind`.
  - `GeneratedElement` gains optional `facadeSource?: SourceKind` (set only on windows).
  - `ValidationCheck.id` union gains `"openings-hosted"`.
  - Add `ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE = 0.5` and `DEFAULT_FACADE: FacadeParams`
    = `{ windowWidth: 1.2, windowHeight: 1.5, sillHeight: 0.9, windowSpacing: 1.5 }`.
- **fuse.ts:** copy `input.facade ?? null` → `model.facade`; `model.facadeSource = "era-estimate"`
  (recipe defaults are era-based). No conflict logic for facade.
- **ingest.ts:** unchanged behavior for footprint/height/floors (facade is a direct passthrough via
  input, not a scored feature) — but add a passthrough note. (If you prefer, leave ingest untouched
  and have fuse read `input.facade` directly; either is fine — keep it pure.)
- **score.ts:** for `kind === "window"`, `geomScore = min(GEOM_SCORE[geomSource] ?? 0, facadeScore)`
  where `facadeScore = FACADE_SCORE[element.facadeSource ?? "era-estimate"]` and
  `FACADE_SCORE = { "era-estimate": ENGINE_CONSTANTS.FACADE_ESTIMATE_SCORE (0.5), "cad-exact": 0.9, ... }`.
  Walls/slabs unchanged. Windows must end up `< 0.85`. Reason string for a flagged window names
  "facade (estimated window placement)".
- **build-engine-input.ts:** pass `facade: recipe.facade ? { windowWidth: recipe.facade.windowWidth,
  windowHeight: recipe.facade.windowHeight, sillHeight: recipe.facade.sillHeight,
  windowSpacing: recipe.facade.windowSpacing } : undefined` into the returned `BimEngineInput`
  (for all three real-footprint branches). `recipe.facade` is `FacadeConfig` (see
  `src/lib/procedural/types.ts`).
- Tests: fuse carries facade + facadeSource "era-estimate"; score flags a window
  (`sconf === 0.6*min(geom,0.5)+0.4*height` → for cad-exact geom & ledger height:
  `0.6*0.5 + 0.4*1.0 = 0.7 < 0.85` → flagged); build-engine-input includes facade params.

## LANE B — geometry + validation (after Lane A)

Files: `src/lib/engine/steps/generate-ifc.ts`, `src/lib/engine/steps/validate.ts`,
their `__tests__`, and `src/lib/engine/steps/__tests__/generate-ifc-roundtrip.integration.test.ts`.

- **generate-ifc.ts:** after each wall, if `model.facade` is set, place a row of windows along that
  wall edge: count `n = max(0, floor(edgeLength / (facade.windowWidth + facade.windowSpacing)))`,
  centered/evenly distributed, at local height `facade.sillHeight`, size
  `facade.windowWidth × facade.windowHeight`, depth = through the wall (`wallThicknessM`).
  For each window emit, VERIFYING field shapes against web-ifc-api.js first:
  `IfcOpeningElement` (a rectangular void solid positioned in the wall's local frame) +
  `IfcRelVoidsElement { RelatingBuildingElement: wall, RelatedOpeningElement: opening }` +
  `IfcWindow` (with `OverallHeight`/`OverallWidth`) placed at the opening +
  `IfcRelFillsElement { RelatingOpeningElement: opening, RelatedBuildingElement: window }`.
  Track each window as a `GeneratedElement { kind: "window", storey, geomSource:
  model.footprintSource, heightSource: model.heightSource, facadeSource: model.facadeSource }`.
  Windows are contained in the storey (add to `storeyProducts`). Keep geometry deterministic.
- **validate.ts:** add `checkOpeningsHosted` → passes when every generated window count is
  consistent (each storey has `edges × windowsPerEdge` windows, and windows only exist when a
  facade was supplied). Update `element-count` expected total to include windows. Update tests.
- **round-trip integration test:** extend the existing real-WASM test to also assert
  `GetLineIDsWithType(IFCWINDOW).size()` and `GetLineIDsWithType(IFCOPENINGELEMENT).size()` are
  `> 0` and equal, for a facade-bearing input. Verify the file still re-opens cleanly.

## Report (each lane)
status, files changed, exact test commands + counts, IFC round-trip outcome (windows/openings
counts observed), concerns.
