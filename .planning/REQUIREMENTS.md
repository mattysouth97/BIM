# Requirements: Korea BIM Energy Management System

**Defined:** 2026-03-30
**Core Value:** Structurally accurate 3D building visualization with intuitive guided authoring for energy simulation

## v3.0 Requirements

Requirements for UX Workflow Overhaul milestone. Each maps to roadmap phases.

### Workspace Layout

- [x] **LAYOUT-01**: User sees a viewport-dominant layout with the 3D view as the primary element and panels docked around it
- [x] **LAYOUT-02**: User can resize left, right, and bottom dock panels by dragging
- [x] **LAYOUT-03**: User can collapse/expand dock panels to maximize viewport space

### Workflow Pipeline

- [x] **FLOW-01**: User sees a guided authoring stepper showing 5 stages: Select Building → Assemble → Configure → Analyze → Export
- [x] **FLOW-02**: User sees a persistent mode indicator showing the current tool/action (e.g., "Draw Wall", "Place Door")
- [x] **FLOW-03**: User sees a status bar with contextual one-line prompts (e.g., "Click to place — Escape to cancel")

### Contextual UI

- [x] **CTX-01**: User clicks a wall, component, or room and the right panel immediately shows its properties
- [x] **CTX-02**: User sees toolbar items that change based on the current workflow stage
- [x] **CTX-03**: Existing viewer-overlay.tsx is decomposed into stage-keyed toolbar configs

### Discoverability

- [x] **DISC-01**: User can browse floors, rooms, and components in a tree outliner panel
- [x] **DISC-02**: User can drag components from a filtered catalog (door/window/MEP/stair) into the scene
- [ ] **DISC-03**: First-time users see a guided onboarding tour highlighting key UI areas

### Undo/Redo

- [x] **UNDO-01**: User can undo/redo authoring actions with Ctrl+Z / Ctrl+Y across wall drawing, component placement, and material edits
- [x] **UNDO-02**: Compound operations (e.g., draw wall + auto-detect rooms) undo as a single step

### Energy Feedback

- [x] **ENRG-01**: User sees a persistent energy status bar showing live kWh/m² as properties change
- [x] **ENRG-02**: User sees inline delta annotations on property sliders showing energy impact of changes
- [x] **ENRG-03**: Energy calculations use regional climate data (not Seoul-only HDD)

## v3.1+ Requirements

Deferred to future release. Tracked but not in current roadmap.

### UX Polish

- **KEYS-01**: Centralized keyboard shortcut system via react-hotkeys-hook with scope isolation
- **INFER-01**: Korean building code inference values surfaced as "suggested" badges user can accept or override
- **EXPORT-01**: Export-readiness checklist showing ECO2 field completeness
- **PERSIST-01**: Workspace panel layout saved to localStorage across sessions
- **SYNC-01**: Dual-view 2D/3D live sync with shared geometry store

## Validated (from previous milestones)

### v2.0 — Advanced BIM Authoring
- ✓ **PLAN-01**: User can draw walls in 2D plan view — v2.0 Phase 11
- ✓ **PLAN-02**: User can create room boundaries from enclosed wall segments — v2.0 Phase 11
- ✓ **PLAN-03**: Drawn 2D plan extrudes to 3D geometry automatically — v2.0 Phase 11
- ✓ **PLAN-04**: User can place doors and windows on walls in plan view — v2.0 Phase 11
- ✓ **PLAN-05**: User can switch between 3D perspective and 2D plan view — v2.0 Phase 11
- ✓ **SNAP-01**: Elements snap to grid — v2.0 Phase 12
- ✓ **SNAP-02**: Elements snap to edges and vertices — v2.0 Phase 12
- ✓ **SNAP-03**: Axis constraints lock movement — v2.0 Phase 12
- ✓ **SNAP-04**: Alignment guides show — v2.0 Phase 12
- ✓ **STRUCT-01–04**: Structural analysis overlay — v2.0 Phase 13
- ✓ **QA-01–07**: Test infrastructure and BIM accuracy — v2.0 Phases 10, 10.1

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Grasshopper-style node graph | GX team are auditors, not parametric designers; use sliders instead |
| Revit-style multi-tab ribbon | Cognitive overhead for 20 tools; contextual toolbar is sufficient |
| Photorealistic rendering | Conflicts with PROJECT.md structural clarity goal |
| Real-time collaboration | CRDT infrastructure for zero current-user benefit |
| AI geometry generation | Undermines ground-truth Korean ledger data validity |
| Free-form mesh sculpting | Not a mesh editor; unrepresentable in IFC |
| Full FEA simulation | Simplified structural viz only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 15 | Complete |
| LAYOUT-02 | Phase 15 | Complete |
| LAYOUT-03 | Phase 15 | Complete |
| FLOW-01 | Phase 17 | Complete |
| FLOW-02 | Phase 16 | Complete |
| FLOW-03 | Phase 18 | Complete |
| CTX-01 | Phase 17 | Complete |
| CTX-02 | Phase 16 | Complete |
| CTX-03 | Phase 16 | Complete |
| DISC-01 | Phase 17 | Complete |
| DISC-02 | Phase 17 | Complete |
| DISC-03 | Phase 18 | Pending |
| UNDO-01 | Phase 17 | Complete |
| UNDO-02 | Phase 17 | Complete |
| ENRG-01 | Phase 18 | Complete |
| ENRG-02 | Phase 18 | Complete |
| ENRG-03 | Phase 18 | Complete |

**Coverage:**
- v3.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after v3.0 roadmap creation*
