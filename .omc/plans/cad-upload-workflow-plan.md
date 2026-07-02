# CAD Upload Workflow — Footprint-Driven Draft Building

**Status:** COMPLETE -- 2026-07-02: Steps 1-8 shipped incl. docs (src/lib/cad/README.md), QA fixture (docs/samples/sample-footprint.dxf + regression test), CLAUDE.md entry.
**Owner:** GX Team
**Date:** 2026-04-13
**Mode:** direct (plan skill)

## Requirements Summary

Change the current `search → twin → report` workflow to `search → upload → twin → report`. Keep the Korean Building Ledger (건축물대장) region filter and search intact — the user first selects a building via the existing API flow, then uploads a CAD floor plan (DXF or DWG) for that building, then enters the twin stage where a draft 3D building is auto-generated using the CAD's footprint polygon as input to the existing procedural pipeline.

### User-approved decisions

| Decision | Choice |
|---|---|
| CAD formats | DXF + DWG |
| DWG handling | Server-side LibreDWG → DXF conversion |
| Footprint detection | Auto-detect largest closed polyline, with layer-picker fallback |
| Workflow slot | New `upload` stage between `search` and `twin` |
| Generation scope | Footprint polygon only (floor count/heights remain from 건축물대장) |
| Gate strictness | Required — twin is blocked until footprint is parsed |

### In scope

- New `upload` workflow stage with stepper integration and guard function.
- DXF parser (`dxf-parser` npm package) — client-side.
- DWG → DXF conversion on Next.js API route using LibreDWG (wasm or native binary).
- Footprint auto-detection with fallback layer picker UI.
- Persisting parsed footprint polygon on the `recipe-store`, keyed by `buildingPk`, so the existing `footprintPolygon` code path in [structure-generator.ts:36](src/lib/procedural/structure-generator.ts#L36) is used.
- Unit + scale handling (DXF `$INSUNITS`, bbox centering).
- Error states: unsupported file, parse failure, no closed polyline found, DWG conversion failure.

### Out of scope

- Interior walls, rooms, door/window extraction (future iteration).
- Multi-floor CAD (one floor plan per floor) — this plan assumes one outline for the whole building.
- Converting existing IFC/glTF/GLB uploader; this new stage is additive.
- PDF / raster floor plan support.
- Server-side persistence of uploaded CAD files beyond request lifetime (stored in IndexedDB client-side via existing `src/lib/model-storage.ts` pattern).

## Acceptance Criteria

1. Given a selected building on the `search` stage, when the user attempts to navigate forward, they land on the new `upload` stage (never directly on `twin`).
2. Dropping a `.dxf` file with a closed LWPOLYLINE produces a parsed footprint polygon in `recipe-store.overrides[buildingPk].footprintPolygon` within **≤ 2s p95** (file ≤ 10MB).
3. Dropping a `.dwg` file triggers POST to `/api/cad/convert`, receives DXF text, and completes parsing within **≤ 5s p95** (file ≤ 10MB).
4. If the DXF has multiple closed polylines, a layer-picker dialog appears listing each candidate layer with a preview count; the user's selection becomes the footprint.
5. When the user advances to `twin`, the procedural building uses the uploaded polygon (`footprintPolygon`) — verifiable in the rendered slabs, which follow the polygon instead of the rectangular box.
6. Attempting to leave `upload` without a successfully parsed footprint blocks navigation (guard returns false) and surfaces a visible error toast.
7. File size > 50MB returns a clear error message; unsupported extensions (not `.dxf` / `.dwg`) return a clear error message.
8. Unit tests: DXF parser returns `[][]` `footprintPolygon` in meters for fixtures at mm/cm/m scales. Test coverage for unit conversion, multi-candidate dispatch, and empty-file failure.
9. `pnpm build` passes with no new type errors; `pnpm lint` passes; `pnpm test` passes including 3 new test files.

## Implementation Steps

### Step 1 — Workflow plumbing

Files touched:
- [src/lib/workflow/stages.ts](src/lib/workflow/stages.ts) — add `"upload"` to `WorkflowStage` union, `STAGE_ORDER`, `STAGE_LABELS`, and `STAGE_GUARDS`.
- [src/lib/workflow/toolbar-configs.ts](src/lib/workflow/toolbar-configs.ts) — add upload-stage toolbar entry.
- [src/store/workflow-store.ts](src/store/workflow-store.ts) — no schema change; stage type derives from stages.ts.
- [src/components/workspace/workflow-stepper.tsx](src/components/workspace/workflow-stepper.tsx) — verify stepper renders 4 steps.
- [src/components/workspace/workspace-shell.tsx](src/components/workspace/workspace-shell.tsx) — mount a new `<UploadStage />` when `stage === "upload"`.

Changes:
```ts
// stages.ts
export type WorkflowStage = "search" | "upload" | "twin" | "report";
export const STAGE_ORDER: WorkflowStage[] = ["search", "upload", "twin", "report"];
export const STAGE_LABELS = {
  search: { ko: "건물 검색", en: "Search" },
  upload: { ko: "도면 업로드", en: "Upload CAD" },
  twin:   { ko: "디지털 트윈", en: "Twin" },
  report: { ko: "보고서", en: "Report" },
};

export const STAGE_GUARDS: Partial<Record<WorkflowStage, (ctx: GuardContext) => boolean>> = {
  search: () => true,
  upload: (ctx) => Boolean(ctx.footprintPolygon),  // NEW — blocks forward until footprint exists
  twin:   () => true,
};
```

Note: `STAGE_GUARDS` currently takes no args — extend to accept a `GuardContext` that carries the current `buildingPk` and `footprintPolygon`. Update all call sites found by grepping `STAGE_GUARDS`.

Acceptance test: `src/store/__tests__/workflow-store.test.ts` — add case asserting you cannot leave `upload` without a footprint.

### Step 2 — DXF parser module (pure, testable)

New file: `src/lib/cad/dxf-parser.ts`

```ts
import DxfParser from "dxf-parser";
import type { Polygon2D } from "@/lib/procedural/types";

export interface ParsedDxf {
  candidates: FootprintCandidate[];
  unitScaleToMeters: number;  // multiplier so output is meters
}

export interface FootprintCandidate {
  layer: string;
  vertexCount: number;
  areaSqm: number;            // after unit conversion
  polygon: Polygon2D;         // [x, z] pairs, centered at bbox origin, meters
}

export function parseDxfText(text: string): ParsedDxf {
  // 1. DxfParser().parseSync(text)
  // 2. Read $INSUNITS (0=unitless, 1=inches, 4=mm, 5=cm, 6=m, ...) → unitScaleToMeters
  // 3. Iterate entities: LWPOLYLINE + POLYLINE with closed flag
  // 4. For each closed polyline: compute signed area, filter out < 10m² (noise)
  // 5. Convert vertices to meters, center polygon at bbox origin
  // 6. Sort candidates by area descending
  // 7. Return all candidates; caller picks largest or user selects
}
```

Dependencies to add to `package.json`:
- `dxf-parser` (MIT, widely used)

Tests: `src/lib/cad/__tests__/dxf-parser.test.ts`
- Fixture: simple rectangular DXF in mm → expect single candidate, area ≈ fixture area in m².
- Fixture: multi-layer DXF with 3 closed polylines → expect 3 candidates sorted by area.
- Fixture: unitless DXF → expect `unitScaleToMeters === 1` and warning logged.
- Fixture: empty DXF → expect `candidates.length === 0`.

Fixture generation: check in `.dxf` files to `src/lib/cad/__tests__/fixtures/`.

### Step 3 — DWG → DXF conversion API route

New file: `src/app/api/cad/convert/route.ts`

```ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file || !file.name.toLowerCase().endsWith(".dwg")) {
    return Response.json({ error: "DWG file required" }, { status: 400 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return Response.json({ error: "File > 50MB" }, { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const dxf = await convertDwgToDxf(buf);   // libredwg-web wasm
  return new Response(dxf, { headers: { "Content-Type": "text/plain" } });
}
```

Implementation choice — **LibreDWG-web (WebAssembly):**
- Package: `libredwg-web` (GPL-3, OK for internal GX use). Verify license with team.
- Alternative if GPL is blocking: ship native `libredwg` binary in a serverless-friendly location or drop DWG support (ask user to re-export as DXF).

New file: `src/lib/cad/dwg-convert.ts` — wraps libredwg-web load + conversion.

Tests: `src/lib/cad/__tests__/dwg-convert.test.ts` — integration test with a real small DWG fixture (≤ 100KB).

### Step 4 — UploadStage component

New file: `src/components/upload/upload-stage.tsx`

Layout: full viewport panel with:
- **Dropzone** (reuse the pattern from [model-uploader.tsx:83-116](src/components/viewer/model-uploader.tsx#L83-L116)) accepting `.dxf,.dwg`.
- **Status region**: parsing → layer-picker (if multiple candidates) → success preview (2D SVG outline of footprint) → "Continue to Twin" button.
- **Cancel** button → back to `search` stage.

Component tree:
```
<UploadStage>
  ├── <Dropzone accept=".dxf,.dwg" onFile={handleFile} />
  ├── <ParseStatus loading|error|multiCandidate|ready />
  ├── <LayerPicker candidates={...} onPick={...} />  // shown when >1 candidate
  ├── <FootprintPreview polygon={...} />             // SVG 2D outline
  └── <Button onClick={advance}>Continue to Twin</Button>
```

File upload flow:
```
file.ext === "dxf" → read as text → parseDxfText()
file.ext === "dwg" → POST /api/cad/convert → receive DXF text → parseDxfText()
→ candidates.length === 1 ? auto-select : show picker
→ setRecipeOverride(buildingPk, { footprintPolygon })
→ enable Continue
```

### Step 5 — Recipe store integration

Files touched:
- [src/store/recipe-store.ts](src/store/recipe-store.ts) — confirm `overrides[buildingPk].footprintPolygon` is already in the override schema (it should be, per structure-generator usage). If not, add it.
- No changes to `procedural-building.ts` or `structure-generator.ts` — the polygon path already exists at [structure-generator.ts:36-57](src/lib/procedural/structure-generator.ts#L36-L57).

Acceptance test: `src/store/__tests__/recipe-store.test.ts` — set `footprintPolygon`, read it back, confirm merged into effective recipe.

### Step 6 — Wire upload stage into workspace shell

File: [src/components/workspace/workspace-shell.tsx](src/components/workspace/workspace-shell.tsx)

```tsx
const stage = useWorkflowStore((s) => s.stage);
{stage === "report" ? <ReportStage />
 : stage === "upload" ? <UploadStage />
 : children /* twin canvas */}
```

Guard test: render with `stage="upload"` and no footprint → navigating to `twin` stays on `upload` with visible toast.

### Step 7 — Scale & orientation sanity checks

- Centering: all polygons are centered at bbox origin in `parseDxfText` so they align with existing rectangular procedural output.
- Unit scale: If `$INSUNITS` is 0 (unitless), default to meters with a warning in the parse status.
- Orientation: DXF Z is up; we map DXF XY → world XZ (flip Y → Z). Verify by dropping a fixture with a recognizable L-shape and confirming the top slab in the twin matches visually.

### Step 8 — Docs + cleanup

- Update [CLAUDE.md](CLAUDE.md) — add "CAD upload pipeline" to architecture section.
- Update [AGENTS.md](AGENTS.md) or [src/lib/cad/README.md](src/lib/cad/README.md) — one-paragraph description of the parser module.
- Add a seed fixture `docs/samples/sample-footprint.dxf` so QA can test end-to-end without hunting for a file.

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| LibreDWG-web (GPL-3) license incompatible with internal/commercial use | High | Confirm license with GX team before Step 3; fallback to "reject DWG, ask for DXF export" per earlier Option C in the interview. |
| DXF without `$INSUNITS` header produces wrong-scale footprint | Med | Log warning, surface a unit picker in the layer-picker UI so user can manually select mm/cm/m/in/ft. |
| Parser chokes on exotic DXF (splines, blocks, huge files) | Med | Constrain to LWPOLYLINE/POLYLINE entities; show "no supported geometry" error for spline-only files. Max 50MB. |
| Guard change to `STAGE_GUARDS` signature breaks existing callers | Low | Grep `STAGE_GUARDS` usage before editing; update all call sites in one atomic commit. |
| Users without CAD files get stuck at upload stage | Med | Provide a built-in "use rectangular footprint" escape hatch button labeled "Skip — use approximate footprint", which sets a synthetic rectangle in `footprintPolygon` so the guard passes. (Contradicts "required" choice slightly; resolve with user or add feature flag.) |
| Footprint polygon offset from site origin causes siting/ground mismatch | Low | Parse module centers the polygon at its bbox origin; ground plane & lighting already reference origin. Add visual regression test. |
| Multi-floor buildings need per-floor CAD but this plan only supports one | Low | Explicit "out of scope" entry; future iteration will layer multi-CAD support. |

## Verification Steps

After implementation:

1. Run `pnpm build` → zero type errors, zero warnings on new files.
2. Run `pnpm lint` → clean.
3. Run `pnpm test` → all tests pass including the 3 new test files (dxf-parser, dwg-convert, workflow guard).
4. Run `pnpm dev` → manual flow:
   a. Pick any building in search.
   b. Advance → land on upload stage.
   c. Drop `docs/samples/sample-footprint.dxf` → see candidate + SVG preview.
   d. Click "Continue to Twin" → twin renders with non-rectangular slabs following the polygon.
   e. Restart, try a 건축물대장 building again and drop a real DWG → conversion succeeds, twin reflects the outline.
5. Smoke test guard: try to skip upload → blocked with toast.
6. Regression check: existing IFC/glTF upload dialog ([model-uploader.tsx](src/components/viewer/model-uploader.tsx)) still works — this plan does not touch it.

## Follow-ups / Future Work

- Per-floor CAD upload (multi-floor buildings with variable footprints).
- Interior wall + room extraction from DXF.
- Door/window placement on facade from DXF block references.
- PDF / raster floor plan ingestion with scale calibration.
- Persist uploaded DXF to server so different users can view the same twin.

---

**Next step:** Run `/oh-my-claudecode:ralph` with this plan, or request changes before execution.
