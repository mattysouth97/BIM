---
phase: 22-mep-sub-layer-foundation
plan: 03
subsystem: layer-panel-ui
tags: [mep, layer-panel, chevron, sub-toggle, react, lucide]
dependency_graph:
  requires:
    - 22-01 (MepSubLayerId types, MEP_SUB_CONFIGS, mepSubVisibility store slice)
    - 22-02 (scene-graph sub-group wiring)
  provides:
    - Expandable MEP row with ChevronDown in LayerPanel
    - 4 indented sub-toggle rows (electrical, HVAC, lighting, DHW)
    - Local mepExpanded useState for chevron expand/collapse
  affects:
    - src/components/viewer/layer-panel.tsx
tech_stack:
  added: []
  patterns:
    - Fragment wrapper in map() to allow adjacent sibling rows without extra DOM nodes
    - e.stopPropagation() on chevron click to prevent parent button toggleLayer from firing
    - Local useState for transient UI state (not persisted to store)
    - Conditional inline style with borderColor/backgroundColor for colored dot toggle
key_files:
  created: []
  modified:
    - src/components/viewer/layer-panel.tsx
decisions:
  - Used React Fragment (keyed) to wrap each layer row + optional sub-rows as siblings inside map()
  - ChevronDown placed inside the parent MEP button with stopPropagation to decouple expand from toggle
  - mepExpanded is local useState (resets on panel re-mount) — not persisted, per plan spec
  - Sub-dot uses size-2 (vs parent size-2.5) to establish visual hierarchy
  - No useHydration guard needed — mepSubVisibility defaults all-true, no SSR mismatch
metrics:
  duration_minutes: 5
  completed_date: "2026-04-12"
  tasks_completed: 1
  files_modified: 1
---

# Phase 22 Plan 03: MEP Sub-Layer UI — Expandable Chevron + 4 Sub-Toggle Rows

**One-liner:** ChevronDown on MEP layer row expands 4 indented sub-toggle buttons (electrical/HVAC/lighting/DHW) with colored dots, bilingual labels, and per-sub toggleMepSub calls — all wired to layer-store's mepSubVisibility slice from Plan 01.

## Tasks Completed

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Add expandable MEP sub-toggle rows to LayerPanel | Done | 53348da |

## What Was Built

### layer-panel.tsx changes

**New imports:**
- `Fragment, useState` from `"react"`
- `ChevronDown` added to existing `X` import from `"lucide-react"`
- `MEP_SUB_IDS, MEP_SUB_CONFIGS` added to existing types import

**New store selectors (inside component):**
- `mepSubVisibility` — reads per-sub-layer visibility booleans
- `toggleMepSub` — action called when a sub-toggle row is clicked

**Local expand state:**
- `const [mepExpanded, setMepExpanded] = useState(false)` — transient, resets on re-mount

**MEP row modification:**
- `ChevronDown` appended inside the MEP button (after label span), rotated `-90deg` when collapsed, `0deg` when expanded
- `e.stopPropagation()` on chevron click prevents `toggleLayer("mep")` from firing
- All rows wrapped in `<Fragment key={id}>` to support adjacent sub-row siblings

**Sub-toggle rows (rendered when `id === "mep" && mepExpanded`):**
- 4 rows iterating `MEP_SUB_IDS` via `MEP_SUB_CONFIGS`
- Styling: `pl-8 pr-3 py-1.5 text-xs` — indented and compact vs parent `px-3 py-2`
- Dot: `size-2` (smaller than parent `size-2.5`), color from `subConfig.color`
- Label: `font-medium` when active, `text-muted-foreground` when inactive
- No description line (sub-rows are label-only, no second text line)
- Click: `toggleMepSub(subId)` — independent per-sub visibility control

## Verification Results

- `pnpm build` — PASSED, zero TypeScript errors, all 15 routes generated
- All 4 sub-configs (electrical #f59e0b, HVAC #06b6d4, lighting #84cc16, DHW #f97316) present
- Fragment wrapper correctly keys each outer row
- `e.stopPropagation()` isolates chevron click from parent button handler

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All sub-toggle rows are fully wired to live store state (`mepSubVisibility` / `toggleMepSub`). Colors, labels, and click handlers are all real values — no placeholders.

## Self-Check: PASSED

- `src/components/viewer/layer-panel.tsx` — FOUND (written and verified)
- commit 53348da — FOUND (git log confirms)
- `pnpm build` — PASSED (zero errors)
