# Twin Authoring — Execute Plan

Date: 2026-08-15
Status: Executing in the current worktree (not a Graphite PR stack — the workspace already has unrelated landing work on `master`).

## Goal

Author the twin as **fidelity upgrade**, not a BIM editor. Persist corrections. Give `층 편집` / `객체 편집` one job each. Use the CAD plan as a core, not only a silhouette. Wire fidelity to real ingest. Keep four workflow stages and the existing energy/retrofit engines.

## Authoring loop

```
대장 + 지적          →  a building you can see
도면에서 코어 지정     →  systems that belong to this plate
설비 사양 3줄 확인    →  추정 becomes 입력, grade moves
저장                 →  tomorrow it is still that twin
```

## Invariants

- No fifth workflow stage.
- No second energy engine.
- No freeform 3D place/move/rotate.
- Demo never calls data.go.kr or VWorld.
- Korean-first instrument chrome.

## DAG (implementation order)

### 1. Persist + merge (foundation)

- Persist `recipe-store.overrides`, `material-store.properties`, `equipment-store.params` (not base recipes).
- `mergeRecipeOverrides` applies `floorCount`, `floorHeight`, `floorEdits`, `serviceCore` and rebuilds floor `y` / `totalHeight`.
- Energy metrics and properties panel consume `mergeRecipeOverrides` (stop hand-rolled merges).

### 2. Provenance + fidelity

- `twin-provenance-store` per building: CAD footprint/plan, IFC, equipment schedule, CAD frame origin.
- `useTwinFidelity` derives `assessFidelity` options from stores + actual energy + IFC source. Stop hardcoding `hasFloorPlans: false`.

### 3. CAD plan → service core

- `classifyPlanPolylines`: outline / core / room from closed polylines.
- `computeCoreLayout` honours `recipe.serviceCore`.
- Upload commit auto-pins classified core. Viewer: **서비스 코어로 지정**.

### 4. Floor-edit + object-edit

- Floor-edit: stack (height, 용도, exclude). Writes `floorEdits`.
- Object-edit: equipment spec confirm (capacity / year / plant type → `material-store`, source `user-input`) + 2D slot plan to nudge the core.

### 5. Docks + site

- Left dock: layers + MEP subs, then retrofit recs (job 2 stays).
- Right dock: selection / correction first, then 등급 / 충실도.
- Parcel-scaled ground, north mark (+Z = south), demo neighbor boxes only (no VWorld).

### 6. Equipment schedule ingest

- CSV/TSV paste: type, capacity, year, fuel, efficiency → HVAC materials + `hasEquipmentSchedule`.

## Out of scope

- Walls-with-thickness, trim/extend, freeform MEP placement.
- Live neighboring 지적 fetch (campus already has bbox; this slice uses demo context only).
- BMS / sensors (fidelity still reports unavailable).
- Growing `elementRegistry` until generated instances are registered.
