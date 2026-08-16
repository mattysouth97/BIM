---
id: P2-11
title: Geometric fidelity — data correctness fixes (parcels, curves, slabs, shadows, AA)
priority: P2
area: viewer
status: done
owner: claude-fable-5-session
effort: M
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-04, UC-05]
---

# P2-11 — Geometric fidelity: data correctness fixes

## 1. Requirement (RE)

- **Problem**: five independent defects make the 3D twin geometrically wrong for real inputs:
  1. **MultiPolygon parcels** — the comment says "largest parcel" but the code takes the first polygon unconditionally (`src/app/api/vworld/footprint/route.ts:243-244`, same pattern at `:300`); on multi-parcel lots the wrong footprint is extruded.
  2. **Curved DXF geometry** — `bulge` is explicitly discarded (`src/lib/cad/dxf-parser.ts:18`), so curved LWPOLYLINE facades become chords; `CIRCLE`/`ELLIPSE`/`SPLINE` outlines are unsupported → wrong shape AND wrong area for curved buildings.
  3. **IFC BASESLAB counted as roof** — `src/lib/ifc/ifc-geometry-extractor.ts:193` includes `predefined === "BASESLAB"` in roof area, inflating envelope metrics that feed the energy model.
  4. **Fixed shadow frustum** — directional shadow camera is hardcoded ±60 m (`src/components/viewer/building-scene.tsx:470-473`); shadows clip on large footprints and in campus mode even though `siteLayout.extents` is computed.
  5. **MSAA silently lost** — `antialias: true` on the Canvas (`building-scene.tsx:446`) does not apply once EffectComposer takes over; no `samples` on the composer target and no FXAA/SMAA pass (`src/components/viewer/outline-post-processing.tsx:45-56`), so composed output aliases.
- **Impact**: the twin misrepresents real buildings on exactly the lots that are non-rectangular or curved; energy metrics inherit the geometry error; visual output looks broken at edges.
- **Use case**: As a building owner (UC-04/UC-05), I want the twin to match my building's actual parcel shape and slab structure so that the retrofit analysis is about MY building.

## 2. Specification (SDD)

- **Context pack** (read in order):
  1. `src/app/api/vworld/footprint/route.ts` (MultiPolygon handling, :230-310)
  2. `src/lib/cad/dxf-parser.ts` (vertex extraction, :1-80, :200-235) + `src/lib/cad/README.md`
  3. `src/lib/ifc/ifc-geometry-extractor.ts` (slab classification, :170-210)
  4. `src/components/viewer/building-scene.tsx` (light/shadow rig, :440-480) and `outline-post-processing.tsx` (composer setup, :12-96)
  5. `docs/work-plan/knowledge/domain-glossary.md` (footprintPolygon, fidelity tiers)
- **BDD scenarios**:
  - Given a VWorld MultiPolygon response with 3 parcels of different areas, when the footprint is extracted, then the rings of the **largest-area** parcel are used and a `parcelCount` note is included in the response metadata.
  - Given a DXF LWPOLYLINE with bulge≠0 segments, when parsed, then each arc segment is tessellated into ≥8 chords following the true arc (sagitta within 1% of radius), and the closed area matches the analytical arc area within 2%.
  - Given a DXF containing a closed `CIRCLE` outline, when parsed, then it is accepted as an outline polygon (tessellated), not dropped.
  - Given an IFC model with a `BASESLAB` and a flat `ROOF` slab, when envelope areas are extracted, then the BASESLAB area is counted as ground-floor/footprint area, never as roof area.
  - Given a campus site with extent radius 150 m, when the scene renders, then all cast shadows are visible (shadow camera bounds ≥ site extents) with no clipping.
  - Given the composed scene, when rendered at dpr=1, then edges show no visible stair-stepping (composer `samples ≥ 4` or an FXAA/SMAA pass active).

## 3. Constraints (CDD)

- **Design constraints**:
  - Keep the dxf-parser never-throws contract (`src/lib/cad/README.md`): unparseable curves degrade to chords with a warning in the ingest result, never an exception.
  - Arc tessellation must be deterministic (fixed chord count or fixed sagitta tolerance) so tests are stable.
  - Preserve the raw-WGS84-rings API boundary (projection stays client-side, per existing design).
  - MultiPolygon fix must not change the single-Polygon path behavior (byte-identical output for existing fixtures).
- **May touch**: `src/app/api/vworld/footprint/route.ts`, `src/lib/cad/dxf-parser.ts`, `src/lib/cad/__tests__/`, `src/lib/ifc/ifc-geometry-extractor.ts`, `src/lib/ifc/` (new tests), `src/components/viewer/building-scene.tsx`, `src/components/viewer/outline-post-processing.tsx`.
- **Must not**: change the VWorld upstream request shape; change `$INSUNITS` handling; alter the P1-06 vworld error-contract work (land this item AFTER P1-06); refactor the earcut extruder.
- **Fitness functions**:
  - `pnpm test -- dxf-parser` passes including new arc fixtures; total parse time for the 50 MB fixture class does not regress >10%.
  - IFC extractor has its first unit tests (this repo currently has zero for `src/lib/ifc/`).
  - Shadow camera bounds are derived from `siteLayout.extents` — no hardcoded ±60 remains.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/cad/__tests__/dxf-parser.test.ts`: bulge arc tessellation (area within 2% of analytical), closed CIRCLE outline accepted, bulge=0 path unchanged.
  - `src/lib/ifc/__tests__/ifc-geometry-extractor.test.ts` (new): BASESLAB → not roof; ROOF predefined → roof.
  - vworld route test: MultiPolygon picks largest-area parcel (mock upstream response).
- **Gates**: `pnpm test -- dxf-parser ifc-geometry vworld`, `pnpm lint`, `pnpm test`, `pnpm build`.
- **Security / honesty checklist**: no new unvalidated input accepted (NaN vertices still rejected — see `dxf-parser.ts:205-211` NaN-passes-filter hazard and fix it here); unsupported curve types surface an explicit warning, never silent area errors.
- **Acceptance criteria**:
  - [x] Largest-parcel selection with metadata note
  - [x] Bulge arc tessellation + CIRCLE support with area-accuracy tests
  - [x] BASESLAB no longer counted as roof (+ first IFC tests)
  - [x] Shadow camera scales with site extents
  - [x] AA restored (composer samples or FXAA/SMAA)
  - [x] NaN-vertex filter hole closed
- **Done when**: curved/multi-parcel/IFC-input buildings render the correct footprint and slab structure, verified by the new tests, with all gates green.
