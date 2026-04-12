---
phase: 22-mep-sub-layer-foundation
plan: 01
subsystem: layer-system
tags: [mep, types, zustand, persist, layer-store]
dependency_graph:
  requires: []
  provides:
    - MepSubLayerId type union (4 members)
    - MEP_SUB_IDS array
    - MepSubConfig interface
    - MEP_SUB_CONFIGS record (bilingual labels + colors)
    - GENERATOR_TO_MEP_SUB mapping (7 generator names → 4 sub-layer IDs)
    - mepSubVisibility slice in useLayerStore
    - toggleMepSub action
    - setMepSubVisible action
    - persist middleware on layer-store (key: bim-layer-store)
  affects:
    - src/lib/layers/types.ts
    - src/store/layer-store.ts
tech_stack:
  added: []
  patterns:
    - Parallel sub-type (MepSubLayerId alongside LayerId, ALL_LAYER_IDS unchanged)
    - Zustand persist middleware with partialize (persist only mepSubVisibility)
    - Object.fromEntries default builder for Record<MepSubLayerId, boolean>
key_files:
  created: []
  modified:
    - src/lib/layers/types.ts
    - src/store/layer-store.ts
decisions:
  - GENERATOR_TO_MEP_SUB maps layer-9-waste to mep-dhw (CONTEXT.md mis-numbered it as layer-8-special-waste; layer-8 is layer-8-media)
  - partialize persists ONLY mepSubVisibility; visibility/generated/density remain runtime-only (reset on reload)
  - defaultMepSubVisibility uses inline Object.fromEntries rather than buildDefault<T> helper (which iterates ALL_LAYER_IDS, not MEP_SUB_IDS)
metrics:
  duration_minutes: 15
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 22 Plan 01: MEP Sub-Layer Foundation — Type System + Store Persist

**One-liner:** MepSubLayerId parallel type union + MEP_SUB_CONFIGS (4 bilingual configs with industry colors) + useLayerStore persist middleware with mepSubVisibility slice defaulting all-true.

## Tasks Completed

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Add MepSubLayerId type system to types.ts | Done | cbc2a9b |
| 2 | Add mepSubVisibility slice and persist middleware to layer-store.ts | Done | cbc2a9b |

## What Was Built

### types.ts additions (parallel to existing LayerId system)

- `MepSubLayerId` union type: `"mep-electrical" | "mep-hvac" | "mep-lighting" | "mep-dhw"`
- `MEP_SUB_IDS: MepSubLayerId[]` — 4 entries for iteration
- `MepSubConfig` interface: `{ name: string; nameKo: string; color: string }`
- `MEP_SUB_CONFIGS` record with all 4 configs:
  - electrical: "Electrical" / "전기" / #f59e0b (amber/yellow)
  - hvac: "HVAC" / "냉난방환기" / #06b6d4 (cyan)
  - lighting: "Lighting" / "조명" / #84cc16 (lime)
  - dhw: "DHW/Plumbing" / "급탕/배관" / #f97316 (orange)
- `GENERATOR_TO_MEP_SUB: Record<string, MepSubLayerId>` — maps 7 generator group names to 4 sub-layer IDs

`ALL_LAYER_IDS` is unchanged at exactly 5 entries.

### layer-store.ts changes

- Added `persist` import from `"zustand/middleware"`
- Added `MepSubLayerId` type import and `MEP_SUB_IDS` value import
- Extended `LayerState` interface with `mepSubVisibility`, `toggleMepSub`, `setMepSubVisible`
- Added `defaultMepSubVisibility` constant (all 4 sub-layers default to `true`)
- Wrapped `create<LayerState>()` in `persist()` middleware:
  - Storage key: `"bim-layer-store"`
  - `partialize` persists ONLY `mepSubVisibility` — `visibility`, `generated`, `density` remain runtime-only
- Added `mepSubVisibility: { ...defaultMepSubVisibility }` initial state
- Added `toggleMepSub` (flips exactly one sub-layer boolean, leaves others unchanged)
- Added `setMepSubVisible` (sets one sub-layer to explicit boolean)
- Updated `resetAll` to also reset `mepSubVisibility` to defaults

All existing actions (`toggleLayer`, `setLayerVisible`, `setGenerated`, `setDensity`) are unchanged.

## Verification Results

All 9 automated checks passed:
- ALL_LAYER_IDS entries: 5 — PASS
- MEP_SUB_IDS entries: 4 — PASS
- GENERATOR_TO_MEP_SUB entries: 7 — PASS
- persist key "bim-layer-store" — PASS
- partialize only contains mepSubVisibility — PASS
- electrical color #f59e0b — PASS
- hvac color #06b6d4 — PASS
- lighting color #84cc16 — PASS
- dhw color #f97316 — PASS
- `pnpm build` — zero TypeScript errors

## Deviations from Plan

None — plan executed exactly as written.

The one clarification applied: CONTEXT.md referred to "layer-8-special-waste" but the actual file is `layer-9-waste.ts` (layer-8 is `layer-8-media.ts`). The PLAN.md already documents this correction and specifies `layer-9-waste` → `mep-dhw`. This is not a deviation — the plan's own action text already corrected for it.

## Known Stubs

None. This plan is pure type definitions and store state — no UI rendering, no data sources, no stubs possible.

## Self-Check: PASSED

- `src/lib/layers/types.ts` — FOUND (verified content)
- `src/store/layer-store.ts` — FOUND (verified content)
- commit cbc2a9b — FOUND (git log confirms)
- `pnpm build` — PASSED (zero errors, all routes generated)
