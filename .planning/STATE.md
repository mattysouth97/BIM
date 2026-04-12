---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Energy Systems Observability & Control
status: verifying
stopped_at: Completed 28-procedural-mep-equipment-models/28-01-PLAN.md
last_updated: "2026-04-12T01:05:41.569Z"
last_activity: 2026-04-12
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 16
  completed_plans: 11
  percent: 69
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Energy systems observability and control for building energy management
**Current focus:** Phase 22 — MEP Sub-Layer Foundation

## Current Position

Phase: 22 of 27 (MEP Sub-Layer Foundation)
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-04-12

Progress: [█░░░░░░░░░] 5% (0/6 phases complete, 1 plan done)

## Performance Metrics

**Velocity:**

- Total plans completed: 1 (v5.0)
- Average duration: ~15 min
- Total execution time: ~15 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 22 (1/3) | 1 | ~15 min | ~15 min |

*Updated after each plan completion*
| Phase 22-mep-sub-layer-foundation P03 | 5 | 1 tasks | 1 files |
| Phase 22-mep-sub-layer-foundation P02 | 12 | 2 tasks | 3 files |
| Phase 23-per-floor-energy-model P01 | 195 | 2 tasks | 2 files |
| Phase 23-per-floor-energy-model P02 | 178 | 2 tasks | 2 files |
| Phase 25-energy-consumption-heatmap P01 | 5 | 2 tasks | 4 files |
| Phase 24-energy-breakdown-dashboard P01 | 25 | 3 tasks | 5 files |
| Phase 26-equipment-info-panel P01 | 315s | 2 tasks | 4 files |
| Phase 26-equipment-info-panel P02 | 420 | 2 tasks | 4 files |
| Phase 27-eco2-sub-system-export P01 | 8 | 3 tasks | 3 files |
| Phase 28-procedural-mep-equipment-models P01 | 12 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- v5.0 roadmap: MEP sub-layers kept as parallel MepSubLayerId type — ALL_LAYER_IDS stays at 5
- v5.0 roadmap: Energy heatmap on dedicated THREE.Mesh floor planes, never on structural InstancedMesh
- v5.0 roadmap: EnergyDataSource type enforced at TypeScript level — every estimated value carries amber label
- v5.0 roadmap: Scenario/equipment state is transient — excluded from Zustand persist partialize
- v5.0 roadmap: Zero new Zustand store files — all state as additive slices in existing stores
- 22-01: layer-9-waste maps to mep-dhw (CONTEXT.md mis-numbered it as "layer-8-special-waste"; layer-8 is layer-8-media)
- 22-01: partialize persists only mepSubVisibility — visibility/generated/density remain runtime-only (reset on reload)
- 22-01: defaultMepSubVisibility uses inline Object.fromEntries (buildDefault<T> helper iterates ALL_LAYER_IDS not MEP_SUB_IDS)
- [Phase 22-mep-sub-layer-foundation]: Fragment wrapper in ALL_LAYER_IDS map() to support adjacent MEP sub-row siblings; ChevronDown stopPropagation decouples expand from toggleLayer; mepExpanded is local useState (not persisted)
- [Phase 22-mep-sub-layer-foundation]: setMepSubVisible uses getObjectByName (not groups Map) — sub-groups need no separate tracking in LayerManager
- [Phase 22-mep-sub-layer-foundation]: BuildingLayers second useEffect depends on [mepSubVisibility, visibility] to restore sub-states after MEP off->on toggle
- [Phase 23-per-floor-energy-model]: EnergyDataSource = actual | estimated-ratio | estimated-inferred (CONTEXT.md D4 — modeled variant from RESEARCH.md superseded)
- [Phase 23-per-floor-energy-model]: HVAC anchored to calculateAnnualDemand().totalDemand; others scaled so total = hvac / hvac_ratio
- [Phase 23-per-floor-energy-model]: SYSTEM_RATIOS keyed by 2-char mainPurpsCd prefix; office ratios 55/25/10/10 per CONTEXT.md D6
- [Phase 23-per-floor-energy-model]: Override-merge block kept byte-identical to use-energy-metrics.ts lines 56-83 with SYNC NOTE comment
- [Phase 23-per-floor-energy-model]: @testing-library/react already installed — no new devDependency required for renderHook tests
- [Phase 23-per-floor-energy-model]: Stability test uses === referential equality to guard Phase 25 60fps heatmap rebuild
- [Phase 25-energy-consumption-heatmap]: kwhmToColor delegates to getEnergyGrade+getGradeColor (D-03) — green-to-crimson gradient, no blue anchor
- [Phase 25-energy-consumption-heatmap]: disposeHeatmapGroup targets named child only — not disposeLayer('energy-zones') (D-06)
- [Phase 24-energy-breakdown-dashboard]: LabelList formatter typed as full RenderableText union — recharts 3.x LabelFormatter is stricter than plan's (v: number) annotation
- [Phase 24-energy-breakdown-dashboard]: useMemo placed before null guard to satisfy React Rules of Hooks — plan early-return-first ordering corrected
- [Phase 24-energy-breakdown-dashboard]: chartConfig uses hsl(var(--chart-N)) colors; ChartStyle injects --color-{key} CSS vars at runtime for Cell fills
- [Phase 26-equipment-info-panel]: EquipmentEfficiencyGrade (1|2|3|4|5) is a distinct union from EnergyGrade (1+++…7) with zero cross-import (D-04 enforced)
- [Phase 26-equipment-info-panel]: SelectedEquipmentInfo is plain JSON with no THREE.* fields; selection-store imports no three (D-05 enforced)
- [Phase 26-equipment-info-panel]: clearSelection() updated to also clear selectedEquipment (composite clear)
- [Phase 26-equipment-info-panel]: Raycaster allocated via useRef at component top level — fixes structural-tooltip.tsx per-frame allocation defect (Pitfall 1)
- [Phase 26-equipment-info-panel]: pointerup + 5px movement gate used — camera drag does not trigger MEP selection (D-02)
- [Phase 26-equipment-info-panel]: EquipmentInfoPanel uses equipment-specs EQUIPMENT_GRADE_COLORS (1~5 scale) — never EFFICIENCY_GRADE_COLORS from properties-panel (1+++~7 scale) (D-04 / Pitfall 3)
- [Phase 27-eco2-sub-system-export]: Reused EnergyDataSource union from system-breakdown.ts for subSystems provenance — no new vocabulary
- [Phase 27-eco2-sub-system-export]: subSystems is additive-optional on ECO2ExtraOptions — all existing 3-arg callers compile unchanged
- [Phase 27-eco2-sub-system-export]: buildSubSystems reads materials verbatim, not re-derived from era (Pitfall 2 guard)
- [Phase 28-procedural-mep-equipment-models]: overrideParam initializes from DEFAULT on missing pk — prevents silent write drops unlike material-store pattern
- [Phase 28-procedural-mep-equipment-models]: No persist middleware in equipment-store — params are session-local era-derived defaults, persisting causes stale override regression

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 27 (ECO2 Sub-System Export): KS F 1900 schema for system data fields unverified — requires dedicated research pass before planning Phase 27

## Session Continuity

Last session: 2026-04-12T01:05:41.565Z
Stopped at: Completed 28-procedural-mep-equipment-models/28-01-PLAN.md
Resume file: None
