# Korea BIM Energy Management System

## Vision
A web-based Building Information Management system for the GX (Green Transformation) team that provides structurally accurate 3D building visualization with comprehensive material properties, enabling energy simulation and integration with ECO2 evaluation software. The system queries Korean government building data, renders interactive 3D models, and allows users to configure building systems for energy analysis.

## Current State (Brownfield)
The application has a functional foundation:
- Building ledger search (data.go.kr BldRgstHubService) with 250 district coverage
- 3D parametric viewer (Three.js + React Three Fiber) with PBR materials, era-based facades, post-processing
- Material property system with Korean building code inference engine
- IFC/glTF file upload and rendering
- VWorld cadastral footprint integration
- Material property panel with thermal/HVAC/glazing data

## Key Problems to Solve (User-Identified)

### A. Dashboard Layout
The app uses a page-per-building layout. Needs a **dashboard format** with a larger 3D viewport as the primary interface, not buried under metadata cards.

### B. Interactive Configuration Panel
Users need a **node-graph or slide panel** for configuring building parameters in real-time — adjusting wall properties, HVAC settings, window specs — and seeing the 3D model update live. This enables realistic simulation.

### C. Calculation Engine
As building properties change (walls, insulation, windows, HVAC), the **energy efficiency calculations must update dynamically**. The material inference engine needs to become a live calculation engine that responds to user input.

### D. Architectural Infrastructure in 3D
The parametric model lacks **structural components** that EMS needs: walls with thickness, floor slabs, column grids, ductwork routing zones, pipe runs. Without these, the model can't represent HVAC distribution or thermal bridges.

### E. Wall Thickness
Walls are rendered as flat planes. They need **actual thickness** representing wall assemblies (concrete + insulation + finish = 300mm+). This is critical for both visual accuracy and thermal calculation.

### F. Better Environment/Textures
Need higher quality **PBR textures and HDR environments** from sources like Poly Haven, Quixel, or AmbientCG. Current materials are flat colors.

### G. Structural Clarity Over Photorealism
The goal is NOT photorealistic rendering — it's **structural unambiguity**. Every component needs clear dimensionality. Walls should look like walls (with thickness), floors like slabs, windows like glazing systems. The aesthetic is "clear technical visualization" not "architectural rendering."

## Target Users
- GX (Green Transformation) team members
- Building energy auditors
- Facility managers

## Key Integrations
- data.go.kr BldRgstHubService (building ledger)
- VWorld (cadastral footprints, spatial data)
- ECO2 (desktop energy evaluation — future export)
- Korean Building Energy Code (inference engine)

## Current Milestone: v6.0 Audit Deliverables

**Goal:** Ship visible BIM features that make the tool feel professional for GX auditors — wire annotations + auto-generated views (plan/elevation/section) + schedules + PDF sheet export + undo/redo + stable element IDs. Part 1 of 5-milestone Revit-benchmarked uplift (v6.0 → v9.0).

**Target features:**
- Ctrl+Z / Ctrl+Shift+Z undo across all authoring actions (port unmerged worktree code)
- Stable ElementId on every wall/slab/column/window/door/MEP instance
- Store-backed annotations with undo (wire existing stubs: dimension-line, area-label, level-marker, section-cut)
- Auto-generated plan/elevation/section views from single 3D model via view-engine
- Live, filterable schedule tables (Wall, Window/Door, MEP, Room) with CSV export
- A1/A3 sheet composition with Korean title block → PDF export

**Reference:** Full v6.0 → v9.0 roadmap at `.planning/v6-to-v9-ROADMAP-BENCHMARK.md`

## Current State

Shipped v5.0 Energy Systems Observability & Control — 7 phases, 16 plans, 10/10 requirements satisfied.

**Capabilities delivered in v5.0:**
- 4 individually togglable MEP utility sub-layers (electrical, HVAC, lighting, DHW)
- Per-floor energy model with system-level attribution (HVAC/lighting/DHW/plug)
- Energy breakdown dashboard with horizontal recharts BarChart and amber estimated badges
- Energy consumption heatmap on 3D building (Korean grade color scale)
- Equipment info panel — click any MEP object for inferred specs + Korean efficiency grade (1~5등급)
- ECO2 export extended with sub-system data fields
- Distinct procedural 3D models for chiller/boiler/AHU/DHW/lighting/electrical equipment
- Equipment configuration tab with real-time procedural parameter sliders
- Critical gap fix: MEP layer generators wired into BuildingLayers (were defined but never invoked)

**Known tech debt (from v5.0 audit):**
- MEP density slider in LayersTab is non-functional (BuildingLayers hardcodes density=1.0)
- All v5.0 phases lack Nyquist VALIDATION.md (discovery only, not blocking)
- perFloor uses uniform distribution (not per-floor metered data) — by design

## Completed Milestones
- v5.0: Energy Systems Observability & Control (7 phases, 16 plans — shipped 2026-04-12)
- v4.0: GIS-Composite Realistic Drafts (3 phases, 7 plans — shipped 2026-04-12)
- v3.0: UX Workflow Overhaul (5 phases, 16 plans — shipped 2026-04-03)
- v2.0: Advanced BIM Authoring (5 phases, 11 plans — shipped 2026-03-28)
- v1.0: Procedural BIM Viewer with Multi-Layer Building Systems (9 phases)

## Tech Stack
Next.js 16 + React 19 + TypeScript + Three.js 0.183 + React Three Fiber 9 + shadcn/ui + Tailwind CSS v4 + Zustand + TanStack Query + three-bvh-csg + Vitest + Playwright

## Evolution

This document evolves at phase transitions and milestone boundaries.

*Last updated: 2026-04-12 after v5.0 milestone shipped*
