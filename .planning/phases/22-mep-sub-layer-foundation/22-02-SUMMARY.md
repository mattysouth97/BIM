---
phase: 22-mep-sub-layer-foundation
plan: 02
subsystem: layer-system
tags: [mep, three-js, scene-graph, layer-manager, building-layers, mep-coordinator]
dependency_graph:
  requires:
    - 22-01 (MepSubLayerId, MEP_SUB_IDS, GENERATOR_TO_MEP_SUB, mepSubVisibility store slice)
  provides:
    - mep-coordinator.ts with setupMepSubGroups() and assignToSubGroup()
    - LayerManager.setMepSubVisible() method
    - BuildingLayers second useEffect syncing mepSubVisibility to Three.js sub-groups
    - Scene graph: layer-mep -> [sub-mep-electrical, sub-mep-hvac, sub-mep-lighting, sub-mep-dhw, unmapped flat]
  affects:
    - src/lib/layers/mep-coordinator.ts
    - src/lib/layers/layer-manager.ts
    - src/components/viewer/building-layers.tsx
tech_stack:
  added: []
  patterns:
    - THREE.Group.getObjectByName() for named sub-group lookup (no custom tree walk)
    - Idempotent sub-group creation (check before create)
    - Dual-dep useEffect [mepSubVisibility, visibility] to restore sub-states after main MEP toggle
    - Fallback warning in assignToSubGroup when setupMepSubGroups not called first
key_files:
  created:
    - src/lib/layers/mep-coordinator.ts
  modified:
    - src/lib/layers/layer-manager.ts
    - src/components/viewer/building-layers.tsx
decisions:
  - setMepSubVisible uses getObjectByName (not groups Map) so sub-groups need no separate tracking
  - useEffect dependency array includes both mepSubVisibility AND visibility to handle MEP off->on restore
  - assignToSubGroup falls back to flat MEP group with console.warn when sub-groups not yet set up
  - setupMepSubGroups is idempotent — safe to call multiple times (layer rebuild path)
metrics:
  duration_minutes: 12
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 3
---

# Phase 22 Plan 02: MEP Sub-Layer Foundation — Scene Wiring Summary

**One-liner:** mep-coordinator routes 7 mapped generator outputs into 4 named THREE.Group sub-children of the MEP layer; LayerManager.setMepSubVisible() + dual-dep BuildingLayers useEffect make sub-layer toggles live with MEP off->on restore.

## Tasks Completed

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Create mep-coordinator.ts with sub-group setup and assignment | Done | acb5369 |
| 2 | Add setMepSubVisible to LayerManager and wire useEffect in BuildingLayers | Done | acb5369 |

## What Was Built

### mep-coordinator.ts (new file)

Two exported functions coordinating the MEP sub-group scene graph:

**`setupMepSubGroups(mepGroup)`** — Iterates `MEP_SUB_IDS` and creates (or reuses) 4 named child groups inside the MEP `THREE.Group`:
- `sub-mep-electrical` — container for layer-1-shell output
- `sub-mep-hvac` — container for layer-3-cooling, layer-4-heating, layer-5-ventilation
- `sub-mep-lighting` — container for layer-7-lighting
- `sub-mep-dhw` — container for layer-6-dhw and layer-9-waste

Idempotent: uses `getObjectByName()` to check existence before creating. Returns `Map<MepSubLayerId, THREE.Group>` for caller convenience.

**`assignToSubGroup(mepGroup, generatorGroupName, generatorOutput)`** — Looks up `generatorGroupName` in `GENERATOR_TO_MEP_SUB`. If mapped, routes `generatorOutput` into the matching sub-group via `getObjectByName()`. If unmapped (layer-8-media, layer-10-bas through layer-14-microgrid), adds directly to `mepGroup` flat — these generators remain under the main MEP toggle with no sub-toggle. Emits `console.warn` if sub-group not found (signals that `setupMepSubGroups()` was not called first).

### layer-manager.ts additions

`setMepSubVisible(subId: MepSubLayerId, visible: boolean)` — New method after `setVisible()`. Gets the MEP group from `this.groups.get("mep")`, then finds the child by `getObjectByName("sub-${subId}")` and sets `.visible`. Returns early if MEP group or child not found (safe before generation). No changes to `setVisible()`, `disposeLayer()`, or any other existing method.

`import type { MepSubLayerId }` added (the import for `MepSubLayerId` was added alongside the method — no other import changes).

### building-layers.tsx additions

Two additive changes to the existing component:

1. `MEP_SUB_IDS` added to the existing `import { ALL_LAYER_IDS, MEP_SUB_IDS }` from types (was already importing `ALL_LAYER_IDS`).

2. `mepSubVisibility` selector: `const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);`

3. Second `useEffect` after the existing visibility sync:
```typescript
useEffect(() => {
  const manager = managerRef.current;
  if (!manager) return;
  for (const subId of MEP_SUB_IDS) {
    manager.setMepSubVisible(subId, mepSubVisibility[subId]);
  }
}, [mepSubVisibility, visibility]);
```

The dependency on `visibility` (not just `mepSubVisibility`) is the key correctness requirement: when the main MEP toggle goes off→on, Three.js re-shows all children, overriding sub-group `.visible` flags. Including `visibility` triggers this effect to re-apply the correct sub-states immediately after the parent group becomes visible again.

The existing `useEffect` for `ALL_LAYER_IDS`, the `useFrame` animation loop, and the cleanup `useEffect` are all unchanged.

## Target Scene Graph (achieved)

```
building-layers (THREE.Group)
├── layer-envelope   (THREE.Group)
├── layer-structure  (THREE.Group)
├── layer-mep        (THREE.Group)           ← .visible controlled by main MEP toggle
│   ├── sub-mep-electrical (THREE.Group)     ← layer-1-shell output
│   ├── sub-mep-hvac       (THREE.Group)     ← layer-3/4/5 output
│   ├── sub-mep-lighting   (THREE.Group)     ← layer-7 output
│   ├── sub-mep-dhw        (THREE.Group)     ← layer-6/9 output
│   └── (layers 8, 10-14 added flat here)   ← no sub-toggle
├── layer-energy-zones (THREE.Group)
└── layer-retrofit-targets (THREE.Group)
```

`ALL_LAYER_IDS` remains exactly 5 entries — sub-groups are children, not new layer entries.

## Verification Results

- `pnpm build` — zero TypeScript errors, all routes generated
- `mep-coordinator.ts` exports `setupMepSubGroups` and `assignToSubGroup` — confirmed
- `LayerManager.setMepSubVisible` uses `getObjectByName("sub-${subId}")` — confirmed
- BuildingLayers second `useEffect` depends on `[mepSubVisibility, visibility]` — confirmed
- `disposeLayer("mep")` unchanged — recursive traverse handles sub-group disposal automatically
- No existing `useEffect`, `useFrame`, or cleanup logic modified

## Deviations from Plan

None — plan executed exactly as written.

All three target files were in their final state when verified (the git working tree had the changes already present but unstaged from a prior partial execution). No additional edits were required. Files were staged and committed as `acb5369`.

## Known Stubs

None. This plan is Three.js scene wiring and pure logic — no UI rendering, no placeholder data.

## Self-Check: PASSED

- `src/lib/layers/mep-coordinator.ts` — FOUND (exports setupMepSubGroups, assignToSubGroup)
- `src/lib/layers/layer-manager.ts` — FOUND (contains setMepSubVisible using getObjectByName)
- `src/components/viewer/building-layers.tsx` — FOUND (contains second useEffect with [mepSubVisibility, visibility])
- commit acb5369 — FOUND (git log confirms)
- `pnpm build` — PASSED (zero errors, all routes generated)
