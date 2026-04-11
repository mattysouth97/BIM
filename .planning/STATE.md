---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: GIS-Composite Realistic Drafts
status: verifying
stopped_at: Completed 21-02-PLAN.md (BuildingScene prop wiring + composite loading overlay) — awaiting human-verify checkpoint
last_updated: "2026-04-11T20:54:21Z"
last_activity: 2026-04-12 — Completed 21-02-PLAN.md (remove internal footprint fetch, add Loader2 overlay)
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 23
  completed_plans: 23
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Instantly generate realistic building drafts by compositing Korean government data with VWorld GIS layers
**Current focus:** Phase 20 — Footprint Extrusion (3 of 3 plans complete — awaiting human visual verify at checkpoint)

## Current Position

Phase: 21 of 21 (Composite Pipeline)
Plan: 02 (complete — awaiting human-verify checkpoint)
Status: Phase 21 plan 02 complete — BuildingScene reads footprintData from prop only; internal useBuildingFootprint removed; composite loading overlay added
Last activity: 2026-04-12 — Completed 21-02-PLAN.md (remove internal footprint fetch, add Loader2 overlay)

Progress: [██████████] 96%

## Performance Metrics

**Velocity:**

- Total plans completed: 2 (v4.0)
- Average duration: ~5 minutes
- Total execution time: 0.2 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

- v4.0 start: VWorld footprint endpoint already exists at /api/vworld/footprint — extend, don't rebuild
- v4.0 start: Procedural building generator keeps current facade/material logic — footprint polygon replaces rectangular base only
- v4.0 start: Float32 precision risk with EPSG:5179 (~1M magnitude) — local origin subtraction is mandatory in gis-transform.ts
- v4.0 start: VWorld 3D building API permanently closed (July 2019) — synthesize LOD1 context from 2D footprints + buldHg height
- v4.0 start: Only 2 new npm packages needed: proj4 + earcut — no second WebGL context, no CesiumJS/Mapbox
- [Phase 19]: Used site-specific TM (not EPSG:5179) centered on building centroid — keeps Three.js coords under 100m with no manual subtraction
- [Phase 20-01]: earcut 3.x exports flatten as named export — `import earcut, { flatten as earcutFlatten } from "earcut"`, not `earcut.flatten()`
- [Phase 20-01]: earcut returns CW winding in XZ plane (viewed from +Y) — bottom cap uses raw indices (downward normal), top cap reverses them (upward normal)
- [Phase 20-02]: extractPolygon() now returns raw WGS84 [lng,lat] rings — equirectangular projection removed from server route entirely
- [Phase 20-02]: footprintPolygon type is [number,number][][] (GeoJSON-style rings) throughout the pipeline — first ring outer, subsequent holes
- [Phase 20-02]: earcut@3 ships no TypeScript declarations and @types/earcut doesn't exist — added src/types/earcut.d.ts module declaration
- [Phase 20-03]: generateSlabs() return type widened to InstancedMesh|Group — Group for polygon path (one Mesh per floor), InstancedMesh preserved for rectangular fallback
- [Phase 20-03]: getPolygonFaces() uses side:'front' for all polygon edges — prevents 0.6× side-ratio reduction applied to rectangular "left"/"right" faces
- [Phase 20-03]: generateColumns() and generateRoof() unchanged — rectangular bbox variants acceptable for v4.0; polygon variants deferred to v4.1 per ARCHITECTURE.md
- [Phase 21-01]: useCompositeBuilding fires 4 ledger + 1 footprint query in a single useQueries call; footprint enabled only when address provided
- [Phase 21-01]: isError covers ledger queries only (0-3); footprint errors are soft and surface via footprintData.error instead
- [Phase 21-01]: BuildingScene keeps internal useBuildingFootprint as fallback (disabled when footprintData prop supplied) — full removal in Plan 02
- [Phase 21-01]: FootprintResult type declared locally in building-scene.tsx to avoid cross-module coupling until Plan 02 consolidates types
- [Phase 21-02]: BuildingScene no longer fetches footprint internally — all data flows via footprintData prop from page level
- [Phase 21-02]: isCompositeLoading is optional so BuildingScene remains self-contained in campus/standalone contexts
- [Phase 21-02]: Loading overlay uses absolute inset-0 z-20 above Canvas — disappears when isCompositeLoading becomes false

### Pending Todos

None yet.

### Blockers/Concerns

- VWorld `buldHg` height field coverage unknown in practice — may need flrCnt × 3m fallback in Phase 21
- VWorld WFS `size` parameter limit for bbox queries — current proxy returns size=1, needs investigation before Phase 21

## Session Continuity

Last session: 2026-04-11T20:54:21Z
Stopped at: Completed 21-02-PLAN.md (BuildingScene prop wiring + composite loading overlay) — awaiting human-verify checkpoint
Resume file: None
