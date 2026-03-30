---
phase: 18-guidance-energy-feedback
plan: "01"
subsystem: energy-feedback
tags: [energy, climate-data, status-bar, contextual-prompts, regional-hdd]
dependency_graph:
  requires: []
  provides: [regional-climate-lookup, status-bar-component]
  affects: [workspace-shell, energy-metrics-hook]
tech_stack:
  added: []
  patterns:
    - Regional lookup table keyed by 2-digit sido code prefix
    - Contextual prompt mapping from Zustand store state
    - Bilingual (ko/en) prompt display with language flag from app-store
key_files:
  created:
    - src/components/workspace/status-bar.tsx
  modified:
    - src/lib/energy/climate-data.ts
    - src/hooks/use-energy-metrics.ts
    - src/components/workspace/workspace-shell.tsx
decisions:
  - "REGIONAL_CLIMATE table uses 2-digit sido prefix as key — matches GROUND_TEMPERATURES pattern in korean-building-codes.ts"
  - "getClimateData() keeps backward-compatible signature (sigunguCd is optional) — Seoul fallback when no code provided"
  - "StatusBar renders stage-specific idle hints from STAGE_HINTS map — avoids hard-coding per-stage logic in component"
  - "StatusBar uses buildingPk='' placeholder in WorkspaceShell — same pattern as SceneOutliner, wired in integration phase"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_modified: 4
---

# Phase 18 Plan 01: Regional Climate Data + Status Bar Summary

**One-liner:** 17-region KMA HDD/CDD lookup table with bilingual StatusBar showing live tool prompts and approximate energy metrics.

## What Was Built

### Task 1: Regional climate data + hook wiring (commit 3cf5f1c)

Added `REGIONAL_CLIMATE` lookup table to `climate-data.ts` covering all 17 Korean administrative regions (sido codes 11–52) with KMA-sourced approximate HDD/CDD values. Gangwon (code "51") has the highest HDD at 3400, Jeju (code "50") the lowest at 1600.

Updated `getClimateData()` to accept an optional `sigunguCd` parameter. It extracts the 2-digit sido prefix and looks up regional values, falling back to Seoul defaults. Design temperatures and indoor setpoints are shared from SEOUL_CLIMATE (they vary less regionally).

Updated `useEnergyMetrics()` to accept an optional `sigunguCd` parameter and pass it through to `getClimateData()`. The parameter is included in the `useMemo` dependency array to trigger recalculation on region change. All existing callers remain backward-compatible.

### Task 2: StatusBar component + WorkspaceShell wiring (commit fba547a)

Created `src/components/workspace/status-bar.tsx` — a 32–40px bottom shelf component with two sections:

**Left section (contextual tool prompt):**
- Reads `drawingMode` from plan-store and `annotationMode` from authoring-store
- Maps active tool to one-line bilingual prompt with Escape instruction
- Reads `stage` from workflow-store to show idle stage hints when no tool active
- Green dot indicator when tool active, gray when idle

**Right section (energy status bar):**
- Calls `useEnergyMetrics(buildingPk, sigunguCd)`
- Shows grade badge with dynamic color (`gradeColor`), ~kWh/m², ~kgCO₂/m²
- Shows "간이 모델" disclaimer badge per D-08
- Shows "건물 데이터 없음" when metrics are null (no building loaded)

Replaced the `<span>Status bar (Phase 18)</span>` placeholder in `workspace-shell.tsx` with `<StatusBar buildingPk="" />`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `buildingPk=""` in WorkspaceShell means StatusBar always shows "No building data" for the energy section. This is intentional — per Phase 17 decision, the placeholder PK pattern is used until the integration phase wires the actual building PK from route params.

## Self-Check: PASSED

Files verified:
- src/lib/energy/climate-data.ts — FOUND
- src/hooks/use-energy-metrics.ts — FOUND
- src/components/workspace/status-bar.tsx — FOUND
- src/components/workspace/workspace-shell.tsx — FOUND

Commits verified:
- 3cf5f1c — feat(18-01): add 17-region HDD/CDD table
- fba547a — feat(18-01): create StatusBar
