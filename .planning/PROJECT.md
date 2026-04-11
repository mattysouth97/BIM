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

## Current Milestone: (none — ready for next milestone)

## Current State

Shipped v2.0 Advanced BIM Authoring with 25,500+ LOC TypeScript across 173 files.

**Capabilities delivered in v2.0:**
- 2D plan view with orthographic camera toggle and wall drawing tools
- Room detection algorithm (DFS cycle detection) with labeled room fills
- Door/window placement with wall-snap and CSG boolean wall openings
- Multi-floor support with per-floor height, copy-floor, floor slabs
- Precision editing: grid/vertex/edge snapping, axis constraints, alignment guides
- Structural analysis overlay: animated load path arrows, stress-colored columns, sizing tooltips
- Test infrastructure: 181 unit tests + 7 E2E tests, error boundaries, input validation
- BIM accuracy verified against Korean building typologies and energy benchmarks

**Known tech debt (from v2.0 audit):**
- Structural overlay reads API BuildingRecipe, not user-drawn plan walls
- StructuralTooltip allocates Raycaster per-frame (performance concern)
- REQUIREMENTS.md traceability table was never updated during execution
- Plan-view components share outer ViewerErrorBoundary (no per-component boundaries)

## Completed Milestones
- v4.0: GIS-Composite Realistic Drafts (3 phases, 7 plans — shipped 2026-04-12)
- v3.0: UX Workflow Overhaul (5 phases, 16 plans — shipped 2026-04-03)
- v2.0: Advanced BIM Authoring (5 phases, 11 plans — shipped 2026-03-28)
- v1.0: Procedural BIM Viewer with Multi-Layer Building Systems (9 phases)

## Tech Stack
Next.js 16 + React 19 + TypeScript + Three.js 0.183 + React Three Fiber 9 + shadcn/ui + Tailwind CSS v4 + Zustand + TanStack Query + three-bvh-csg + Vitest + Playwright

## Evolution

This document evolves at phase transitions and milestone boundaries.

*Last updated: 2026-04-12 after v4.0 milestone completion*
