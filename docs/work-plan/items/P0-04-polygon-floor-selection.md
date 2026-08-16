---
id: P0-04
title: Fix floor selection on the polygon-footprint rendering path
priority: P0
area: viewer
status: done
owner: claude-fable-5-ultrawork
effort: S
created: 2026-07-21
updated: 2026-07-21
use_cases: [UC-05]
---

# P0-04 — Fix floor selection on the polygon-footprint rendering path

## 1. Requirement (RE)

- **Problem**: Click-to-select-floor silently no-ops on the default polygon rendering path.
  - `src/components/viewer/procedural-building-model.tsx:113-118` — `handleClick` bails at
    `:115` (`if (!event.object || !('instanceId' in event)) return;`) unless the raycast
    event carries `instanceId`.
  - `src/lib/procedural/structure-generator.ts:36-57` — when `recipe.footprintPolygon` is
    present (the default whenever a VWorld cadastral footprint loads), `generateSlabs`
    returns a `THREE.Group` of **plain `THREE.Mesh`** children (`:45`), and raycast events
    on plain meshes never carry `instanceId`.
  - `src/lib/procedural/procedural-building.ts:92-96` — `getFloorFromInstanceId`'s Group
    branch expects `instanceId` → child-index, so it is **unreachable from the UI**; only
    the rectangular `InstancedMesh` fallback path (`structure-generator.ts:59+`) works.
  - Net effect: on real cadastral geometry — the headline building shape — the core
    interaction (click floor → info card) does nothing, with no error surfaced.
- **Spot-check refinement** (corrects the brief): slab meshes on the polygon path
  **already** carry `userData.floorNo` — `structure-generator.ts:48` sets
  `mesh.userData = { type: "slab", floorNo: floor.floorNo }`, and `:55` preserves
  `group.userData.floors`. The missing piece is purely that `handleClick` never reads that
  fallback. No generator change is strictly required; do not regress the existing
  `userData` contract.
- **Impact**: For the majority of real buildings (polygon footprints), users cannot open
  the floor info card — the primary inspection workflow is dead on arrival.
- **Use case**: As a user inspecting a real cadastral building, I want to click any floor
  slab and see its info card, so that I can inspect per-floor details regardless of how
  the building geometry was generated.

## 2. Specification (SDD)

- **Context pack** (read first, in order):
  1. `src/components/viewer/procedural-building-model.tsx:1-26,50-134` — component setup, `floorSpecToGeometry` (`:24-26`), `handleClick` (`:113-134`), toggle-off behavior (`:124`).
  2. `src/lib/procedural/structure-generator.ts:32-96` — polygon Group path (`:36-57`, incl. `userData` at `:48,54-55`) vs rectangular InstancedMesh path (`:59+`).
  3. `src/lib/procedural/procedural-building.ts:82-99` — `getFloorFromInstanceId` both branches; also note `getSlabMesh()` used there.
  4. `src/lib/procedural/types.ts` — `FloorSpec` shape (`floorNo`, `y`, …).
  5. `src/lib/procedural/__tests__/recipe.test.ts` — existing procedural test style (the only tests near this code; there is no `src/components/viewer/__tests__/` yet).
- **BDD scenarios**:
  1. *Polygon floor click selects*: Given a building with `footprintPolygon` (Group slab path), When the user clicks the slab mesh for floor 3, Then `onFloorSelect` fires once with the `FloorGeometry` whose `floorNo === 3`.
  2. *Polygon click toggles off*: Given floor 3 is already selected, When the same slab is clicked again, Then `onFloorSelect(null)` fires (mirrors `:124` toggle semantics).
  3. *Rectangular path regression*: Given a rectangular building (InstancedMesh path), When a slab instance is clicked, Then selection resolves through `getFloorFromInstanceId` exactly as today.
  4. *Non-slab click ignored*: Given a click on a facade/roof mesh (no `userData.type === "slab"` and no instanceId), When `handleClick` runs, Then nothing fires and nothing throws.
  5. *Missing floorNo guard*: Given a slab-typed object whose `userData.floorNo` is absent/not a number, When clicked without `instanceId`, Then nothing fires (no crash, no false selection).

## 3. Constraints (CDD)

- **Design constraints**:
  - Fallback order in `handleClick`: (1) if `instanceId` is present → existing `getFloorFromInstanceId` flow unchanged; (2) else read `event.object.userData.floorNo`; validate it is a finite number; resolve the `FloorSpec` from the builder (add a `getFloorByFloorNo(floorNo: number): FloorSpec | null` lookup on `ProceduralBuilding`, sourced from the recipe floors it already holds — do not duplicate floor state into the component).
  - Keep the existing `userData?.type !== "slab"` gate (`:118`) working for both object kinds: on the polygon path `event.object` is the child mesh (its `userData.type === "slab"`, `structure-generator.ts:48`), so the gate passes — verify, don't assume, in tests.
  - Extract the pick-resolution into a pure, exported helper (e.g. `resolvePickedFloor(eventObject, instanceId, builder)` colocated in `src/lib/procedural/` or exported from the component module) so it is unit-testable without a WebGL context.
  - Toggle semantics (`selectedRef.current === floorNo ? null : floorNo`, `:124`) must behave identically on both paths.
- **May touch**:
  - `src/components/viewer/procedural-building-model.tsx`
  - `src/lib/procedural/procedural-building.ts` (additive `getFloorByFloorNo` only)
  - new tests: `src/lib/procedural/__tests__/` (exists) and/or `src/components/viewer/__tests__/` (does not exist — create only if needed)
- **Must not**:
  - Do not change `structure-generator.ts` geometry/material logic (the `userData` contract at `:48,54-55` already satisfies the fallback; leave it intact).
  - Do not change `floorSpecToGeometry` (`:24-26`) or the `onFloorSelect` prop signature.
  - Do not touch selection-highlight rendering, `InfoEdges`, or layer-visibility logic.
  - No new dependencies; no `@react-three/fiber` event-system changes.
- **Fitness functions**:
  - A synthetic pick event `{ object: <mesh with userData {type:'slab', floorNo:3}> }` (no `instanceId`) resolves to floor 3 through the new helper — proven by unit test.
  - A synthetic event with `instanceId` against an `InstancedMesh` resolves through the old path — proven by unit test.
  - `getFloorFromInstanceId` behavior byte-identical for existing callers (regression test stays green).
  - No `"use client"` added under `src/lib/**`.

## 4. Evaluation (EDD)

- **Tests to write first (TDD)**:
  - `src/lib/procedural/__tests__/floor-picking.test.ts` (new): construct a minimal recipe with `footprintPolygon` (triangle/quad — see `recipe.test.ts` for recipe fixtures) and one without; generate via `ProceduralBuilding`; assert (a) polygon: `getFloorByFloorNo(n)` returns the `FloorSpec` with `floorNo === n` and `null` for unknown n; (b) the pure pick helper resolves a fake mesh event (plain object with `userData`) to the right spec on the polygon path; (c) the helper resolves an `instanceId` event on the rectangular path; (d) helper returns null for non-slab objects and for missing/invalid `floorNo`.
  - Component-level test (optional, only if a light render harness already exists — do not add a WebGL-heavy setup for this item): assert `onFloorSelect` wiring with mocked builder.
- **Gates**:
  - `pnpm test -- procedural`
  - `pnpm test` (full suite)
  - `pnpm lint && pnpm build`
  - Manual smoke: `pnpm dev`, load a building with a real VWorld footprint, click a mid slab → info card appears; click again → deselects. Repeat on a rectangular fallback building.
- **Security / honesty checklist**:
  - Unknown/invalid `floorNo` yields no selection (no crash, no fabricated floor).
  - No console errors on polygon-path clicks.
  - Manual smoke covers both geometry paths; PR states which was tested.
- **Acceptance criteria**:
  - [x] `handleClick` falls back to `event.object.userData.floorNo` when `instanceId` is absent.
  - [x] `ProceduralBuilding.getFloorByFloorNo` resolves specs on the polygon path.
  - [x] Toggle-off works on the polygon path.
  - [x] Rectangular instanced path behavior unchanged (regression test green).
  - [x] Unit tests cover both paths + guard cases; full suite, lint, build green.
- **Done when**: Clicking a floor slab selects/deselects it on both polygon and rectangular buildings, with unit tests proving both pick paths.

### Evaluation notes (2026-07-21, claude-fable-5-ultrawork)

- New pure helper `src/lib/procedural/floor-picking.ts` (`resolvePickedFloor` + `FloorLookup`
  interface); additive `ProceduralBuilding.getFloorByFloorNo`; `handleClick` now routes both
  pick paths through the helper. Toggle-off unchanged — it keys on `floorSpec.floorNo`, which
  is now populated on both paths. `structure-generator.ts` untouched (userData contract intact).
- Gates: `vitest run floor-picking procedural` 52/52 · `pnpm test` 946 passed / 1 skipped ·
  `pnpm lint` 0 errors · `pnpm build` green.
- Honesty note: the **manual dev-server smoke (click floors on a real VWorld footprint) was
  NOT performed in this session** — both pick paths are proven by unit tests only (real
  generated Group/InstancedMesh objects, synthetic pick events). Visual confirmation
  recommended at next dev-server session.
