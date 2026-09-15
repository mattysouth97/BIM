# Requirements: Korea BIM Energy Management System

**Defined:** 2026-04-12
**Core Value:** Audit-grade BIM deliverables for Korean GX auditors and architects — views, schedules, annotations, sheets, undo.

## v6.0 Requirements

Requirements for Audit Deliverables milestone (phases 29-34).

### Undo & Element Identity

- [ ] **UNDO-01**: User can press Ctrl+Z to undo the last authoring action (wall edit, equipment param change, annotation placement, layer toggle) and Ctrl+Shift+Z or Ctrl+Y to redo, across 50 steps of history
- [ ] **BIM-01**: Every authoring-relevant element (wall, slab, column, window, door, MEP instance, annotation) carries a stable ElementId that persists across sessions and is referenced by downstream features (annotations, schedules, views)

### Annotations

- [ ] **ANN-01**: User can place dimension lines, area labels, level markers, and section planes in the 3D scene via toolbar, with snap-to-element anchoring
- [ ] **ANN-02**: Annotations auto-update when their anchored elements change (e.g., wall moves → dimension text updates), and are automatically removed when the anchored element is deleted

### Views

- [ ] **VIEW-01**: User can switch between auto-generated plan views (one per level), 4 elevation views, and ad-hoc section views from a view switcher UI — each with correct camera + clipping configuration
- [ ] **VIEW-02**: Section markers placed in a plan view spawn a new section view on click, and view state (active view, camera, clipping) round-trips through serialization

### Schedules

- [ ] **SCH-01**: User can view live, filterable schedule tables for 4 categories (Wall, Window/Door, MEP Equipment, Room) derived from the element registry, with sort/filter controls and CSV export
- [ ] **SCH-02**: Editing any element property (wall thickness, window U-value, equipment capacity) updates the corresponding schedule row within one render frame

### Sheets

- [ ] **SHT-01**: User can compose multi-page A1/A3 sheets with drag-to-place viewports (views + schedules) and a Korean GX-format title block, exportable as PDF
- [ ] **SHT-02**: Exported PDF renders views at correct scale (1:50 / 1:100) with vector SVG for line drawings and is under 5MB for a 3-floor building

## v6.x Deferred

Items intentionally out of scope for v6.0 but planned for later milestones:

- **SEM-01** (v7.0): Family / Type / Instance semantic hierarchy
- **PARAM-01** (v7.0): Typed parameter registry with calculated parameters
- **LVL-01** (v7.0): Levels and grids as first-class BIM entities
- **CONS-01** (v8.0): 2D geometric constraint solver
- **FAM-01** (v8.0): In-app family editor
- **IFC-01** (v8.0): IFC4 round-trip export
- **PHASE-01** (v8.0): Existing/demo/new phasing axis
- **COLLAB-01** (v8.0): Yjs multi-user editing
- **VIZ-01** (v8.5): Sun/shadow studies, path-traced rendering
- **NET-01** (v9.0): MEP connected networks with flow calculations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native RVT file read on client | ODA licensing prohibits; server-side conversion only (deferred to v9.0) |
| Client-side full structural FEA | Nonlinear/seismic analysis requires desktop-class compute; export analytical model only |
| Revit-parity Dynamo graphical scripting | Out of scope — leverage AI copilot instead (v9.0) |
| Point cloud ingestion at ReCap scale | Not in core user workflow |
| Offline-first desktop installer (Electron) | Web-native commitment — no Electron pivot |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UNDO-01 | Phase 29 | Pending |
| BIM-01 | Phase 30 | Pending |
| ANN-01 | Phase 31 | Pending |
| ANN-02 | Phase 31 | Pending |
| VIEW-01 | Phase 32 | Pending |
| VIEW-02 | Phase 32 | Pending |
| SCH-01 | Phase 33 | Pending |
| SCH-02 | Phase 33 | Pending |
| SHT-01 | Phase 34 | Pending |
| SHT-02 | Phase 34 | Pending |

**Coverage:**
- v6.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after v6.0 milestone definition*
