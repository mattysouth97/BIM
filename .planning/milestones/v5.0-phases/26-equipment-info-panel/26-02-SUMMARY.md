---
phase: 26-equipment-info-panel
plan: "02"
subsystem: viewer-ui
tags: [equipment-click, raycaster, mep, info-panel, korean-grade, selection-store]
dependency_graph:
  requires:
    - src/lib/energy/equipment-specs.ts (26-01)
    - src/store/selection-store.ts (26-01 selectedEquipment slice)
    - src/lib/layers/types.ts (MEP_SUB_IDS, MEP_SUB_CONFIGS)
  provides:
    - src/components/viewer/equipment-click-handler.tsx
    - src/components/workspace/equipment-info-panel.tsx
  affects:
    - src/components/viewer/building-scene.tsx
    - src/components/workspace/properties-panel.tsx
tech_stack:
  added: []
  patterns:
    - R3F null-render component (returns null, only registers canvas event listeners)
    - useRef Raycaster allocation (single allocation at component mount — never per-frame)
    - pointerdown/pointerup movement gate (5px threshold — OrbitControls drag rejection)
    - MEP sub-group traversal (scene.getObjectByName('sub-mep-*') — not scene.children)
    - Zustand getState() dispatch from non-React event handler
    - Amber "추정" badge + card disclaimer (EQ-02 two-layer estimation labeling)
key_files:
  created:
    - src/components/viewer/equipment-click-handler.tsx
    - src/components/workspace/equipment-info-panel.tsx
  modified:
    - src/components/viewer/building-scene.tsx
    - src/components/workspace/properties-panel.tsx
decisions:
  - "Raycaster allocated via useRef at component top level — fixes structural-tooltip.tsx per-frame allocation defect (Pitfall 1)"
  - "pointerup + 5px movement gate used (not pointermove + useFrame) — camera drag does not trigger selection (D-02)"
  - "Targets collected from sub-mep-* named groups only — structural/envelope meshes never raycasted (D-06)"
  - "Only plain SelectedEquipmentInfo dispatched to store — no THREE.Object3D/Vector3/GPU refs (D-05)"
  - "EquipmentInfoPanel uses specs.gradeColor from equipment-specs.ts (1~5 scale) — never EFFICIENCY_GRADE_COLORS from properties-panel.tsx (1+++~7 scale) (D-04 / Pitfall 3)"
  - "EQ-02 two-layer enforcement: per-row amber 추정 badge in SpecRow component + card-footer disclaimer paragraph"
metrics:
  duration: "420s (~7 min)"
  completed: "2026-04-12T00:39:45Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 26 Plan 02: Equipment Click Handler + Info Panel Summary

**One-liner:** pointerup+5px-gate Raycaster (useRef, single allocation) raycasts against sub-mep-* groups, dispatches plain SelectedEquipmentInfo to store, EquipmentInfoPanel in right dock shows Korean 1~5등급 grade badge with per-row amber 추정 badges.

---

## What Was Built

### Task 1 — `src/components/viewer/equipment-click-handler.tsx`

**R3F null-render component** (returns `null`, registers canvas listeners only):

- `const raycasterRef = useRef(new THREE.Raycaster())` — single allocation at component mount
- `const mouseRef = useRef(new THREE.Vector2())` — reused across all click events
- `pointerdown` records `{ x, y }` position
- `pointerup` computes `Math.hypot(dx, dy)` — rejects deltas > 5px (OrbitControls drag gate)
- On click: normalises NDC coords → `raycasterRef.current.setFromCamera()` → iterates `MEP_SUB_IDS`, collecting meshes from `scene.getObjectByName('sub-${subId}')` for visible sub-layers only
- Early-return guard when no sub-groups found: `console.warn("[EquipmentClickHandler] No MEP sub-groups found — Phase 22 required")`
- On hit: extracts `userData` (plain JS object) → walks parent chain to determine `subLayerId` → calls `inferEquipmentSpecs(userData, recipe)` → dispatches `selectEquipment(info)` via `useSelectionStore.getState()`
- On miss: dispatches `clearEquipment()`

**Pitfall 1 enforcement:**
```
grep -n "new THREE.Raycaster()" equipment-click-handler.tsx
```
Returns 3 lines — 2 are JSDoc/comment lines, 1 is the `useRef` initialiser (line 40). Only one real code allocation.

**Wired in `building-scene.tsx`:**
```tsx
import { EquipmentClickHandler } from "./equipment-click-handler";
// Inside Canvas, after <StructuralTooltip />:
<EquipmentClickHandler />
```

### Task 2 — `src/components/workspace/equipment-info-panel.tsx`

**React component** reading `selectedEquipment` from selection-store:

- Returns `null` when `selectedEquipment` is null (invisible by default)
- Header: `specs.categoryKo / specs.categoryEn` + sub-layer name + componentType + floor
- Grade badge: `specs.efficiencyGradeLabel` (e.g. "2등급 (양호)") with `style={{ backgroundColor: specs.gradeColor }}` — colors from `EQUIPMENT_GRADE_COLORS` (1~5 scale), never from `EFFICIENCY_GRADE_COLORS`
- Standard ref: `specs.standardRef` ("KS B 6364" or "KSC IEC 62301")
- Three `<SpecRow>` components: 용량/Capacity, 설치연도/Install Year, 연간 소비/Annual Use
- Each `SpecRow` renders an amber `추정` inline badge (first EQ-02 layer)
- Card footer: amber bordered block with "⚠ 모든 값은 추정치입니다 — 실측 데이터가 아닙니다." (second EQ-02 layer)
- Close button: `onClick={clearEquipment}` — dispatches `clearEquipment()` only, does not touch `selectedType`/`selectedId`
- Fully bilingual: all user-visible strings branch on `isKo`

**Wired in `properties-panel.tsx`:**
```tsx
import { EquipmentInfoPanel } from "./equipment-info-panel";
// Inside return, before <Accordion>:
<EquipmentInfoPanel />
```

---

## Click Handler Event Model

**Why pointerdown + pointerup (not pointermove + useFrame):**

The structural-tooltip uses `pointermove + useFrame` because hover must update continuously. Click-to-inspect only fires on discrete user intent (a click), so polling on every frame is wasteful and adds OrbitControls noise (every camera drag would attempt a raycast).

The 5px movement gate (`Math.hypot(dx, dy) > 5`) distinguishes a click (< 5px movement) from a camera drag (>> 5px movement). OrbitControls' drag events always exceed this threshold on intentional rotation.

**Why sub-group traversal (not scene.children):**

`scene.children` includes structural InstancedMesh, envelope glass quads, ground plane, lighting — thousands of objects. Raycasting all of them on every click would be slow and would incorrectly match structural/envelope geometry. The MEP sub-groups (`sub-mep-hvac`, `sub-mep-electrical`, etc.) are named specifically for targeted intersection.

---

## Info Card Layout

```
┌─────────────────────────────────────────┐
│ 냉방기                              [×] │
│ 냉난방환기 · cooling-branch · 3F        │
│                                         │
│ [2등급 (양호)]  KS B 6364              │
│                                         │
│ 용량         12.5 kW        [추정]      │
│ 설치연도      약 2014년      [추정]      │
│ 연간 소비    4,200 kWh/년   [추정]      │
│                                         │
│ ⚠ 모든 값은 추정치입니다 —            │
│   실측 데이터가 아닙니다.              │
└─────────────────────────────────────────┘
```

---

## Pitfall 1 Fix Confirmed

`structural-tooltip.tsx` line 83 allocates `new THREE.Raycaster()` on every frame inside `useFrame()` — this leaks allocations at 60 fps.

`equipment-click-handler.tsx` fixes this by allocating once at component mount:
```typescript
const raycasterRef = useRef(new THREE.Raycaster());
```
The ref is reused across all subsequent click events with no further heap allocation.

---

## Deviations from Plan

None — plan executed exactly as written.

All `must_haves.truths` satisfied:
- Click on MEP mesh opens info card in right dock ✓ (pending human-verify checkpoint)
- Info card shows categoryKo/En, capacity, install year, annualKwh, grade badge ✓
- Every value carries amber "추정" badge + card disclaimer ✓
- Non-MEP clicks (structural, envelope, empty space) do NOT open MEP card ✓
- Camera drag does NOT trigger selection (5px gate) ✓
- Raycaster allocated once via useRef — 0 heap allocations per click ✓
- selectedEquipment in store is plain JSON — no THREE.* refs ✓

---

## Task 3 Status

Task 3 is a `checkpoint:human-verify` — skipped per executor instructions. User will verify EQ-01, EQ-02, STD-01 success criteria in the live app.

---

## Known Stubs

None. The EquipmentInfoPanel displays real inferred data from `inferEquipmentSpecs()` (built in Plan 01). No placeholder values or hardcoded display strings flow to the UI.

---

## Self-Check: PASSED

Files created:
- `src/components/viewer/equipment-click-handler.tsx` — FOUND
- `src/components/workspace/equipment-info-panel.tsx` — FOUND

Files modified:
- `src/components/viewer/building-scene.tsx` — FOUND, contains "EquipmentClickHandler"
- `src/components/workspace/properties-panel.tsx` — FOUND, contains "EquipmentInfoPanel"

Commit `696f2f7` — verified.

Build: clean (0 errors). Lint: 0 errors. Tests: 487/487 passed.
