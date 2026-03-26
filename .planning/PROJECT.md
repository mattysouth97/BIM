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

## Tech Stack
Next.js 16 + React 19 + TypeScript + Three.js 0.183 + React Three Fiber 9 + shadcn/ui + Tailwind CSS v4 + Zustand + TanStack Query
