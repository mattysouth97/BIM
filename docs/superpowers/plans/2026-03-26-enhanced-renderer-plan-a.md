# Enhanced Parametric Renderer + Material Properties — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the 3D building viewer with PBR materials, era-based facades, roof geometry, and a comprehensive material property system for energy simulation readiness.

**Architecture:** Pure data layer (material-types.ts, korean-building-codes.ts) feeds an inference engine (material-inference.ts) that generates MaterialProperties from building ledger data. The viewer components consume these properties for PBR rendering. A Zustand store persists material data per building. A collapsible panel lets users view and override properties.

**Tech Stack:** Three.js 0.183, @react-three/fiber 9, @react-three/drei 10, Zustand 5, shadcn/ui, Tailwind CSS v4, TypeScript

---

## File Structure

### New Files
- `src/lib/material-types.ts` — All material property interfaces
- `src/lib/korean-building-codes.ts` — U-value/insulation tables by era
- `src/lib/material-inference.ts` — Inference engine: era+structure+use → MaterialProperties
- `src/lib/pbr-materials.ts` — Structure code → Three.js PBR material config
- `src/components/viewer/window-texture.ts` — Canvas-based procedural window grid
- `src/components/viewer/roof-generator.tsx` — Flat/gable/hip roof geometry
- `src/components/viewer/facade-generator.tsx` — Era-based facade mesh generation
- `src/components/viewer/material-panel.tsx` — Property inspector/editor panel
- `src/store/material-store.ts` — Zustand store for material properties per building

### Modified Files
- `src/lib/building-geometry.ts` — Add era-based floor heights, footprint polygon support
- `src/components/viewer/floor-mesh.tsx` — PBR materials, facade textures
- `src/components/viewer/building-model.tsx` — Integrate roof, facade, material store
- `src/components/viewer/building-scene.tsx` — Wire material panel, pass material store
- `src/components/viewer/viewer-overlay.tsx` — Add material panel toggle button

---

### Task 1: Material Property Type Definitions

**Files:**
- Create: `src/lib/material-types.ts`

- [ ] **Step 1: Create all material property interfaces**
- [ ] **Step 2: Commit**

### Task 2: Korean Building Code Data

**Files:**
- Create: `src/lib/korean-building-codes.ts`

- [ ] **Step 1: Create era-based building code lookup tables** (U-values, insulation, window specs, HVAC defaults by permit year + structure + use)
- [ ] **Step 2: Commit**

### Task 3: Material Inference Engine

**Files:**
- Create: `src/lib/material-inference.ts`

- [ ] **Step 1: Implement inferMaterialProperties()** — pure function that takes BrTitleInfo + BrFloorInfo[] and returns MaterialProperties
- [ ] **Step 2: Commit**

### Task 4: PBR Material Config

**Files:**
- Create: `src/lib/pbr-materials.ts`

- [ ] **Step 1: Create structure code → Three.js material params lookup** (roughness, metalness, color, emissive)
- [ ] **Step 2: Commit**

### Task 5: Window Texture Generator

**Files:**
- Create: `src/components/viewer/window-texture.ts`

- [ ] **Step 1: Create canvas-based procedural window grid generator** — takes floor area, era, use type → CanvasTexture with window rectangles
- [ ] **Step 2: Commit**

### Task 6: Roof Geometry Generator

**Files:**
- Create: `src/components/viewer/roof-generator.tsx`

- [ ] **Step 1: Create RoofGenerator component** — flat slab with parapet, gable (triangular prism), hip (truncated pyramid) based on roofCd
- [ ] **Step 2: Commit**

### Task 7: Facade Generator

**Files:**
- Create: `src/components/viewer/facade-generator.tsx`

- [ ] **Step 1: Create FacadeGenerator** — generates per-floor facade meshes with era-appropriate window patterns and materials
- [ ] **Step 2: Commit**

### Task 8: Update Building Geometry

**Files:**
- Modify: `src/lib/building-geometry.ts`

- [ ] **Step 1: Add era detection from pmsDay, era-specific floor heights, footprintPolygon support, PBR material params per floor**
- [ ] **Step 2: Commit**

### Task 9: Material Property Store

**Files:**
- Create: `src/store/material-store.ts`

- [ ] **Step 1: Create Zustand store** — stores MaterialProperties per building PK, supports overrides
- [ ] **Step 2: Commit**

### Task 10: Material Property Panel

**Files:**
- Create: `src/components/viewer/material-panel.tsx`

- [ ] **Step 1: Create collapsible panel** — shows wall/window/roof/HVAC properties for selected element, editable with source labels
- [ ] **Step 2: Commit**

### Task 11: Wire Into Viewer

**Files:**
- Modify: `src/components/viewer/floor-mesh.tsx`
- Modify: `src/components/viewer/building-model.tsx`
- Modify: `src/components/viewer/building-scene.tsx`
- Modify: `src/components/viewer/viewer-overlay.tsx`

- [ ] **Step 1: Update floor-mesh with PBR materials and facade textures**
- [ ] **Step 2: Update building-model with roof generator and facade generator**
- [ ] **Step 3: Update building-scene to initialize material store and pass to panel**
- [ ] **Step 4: Update viewer-overlay with material panel toggle**
- [ ] **Step 5: Commit**

### Task 12: Build Verification

- [ ] **Step 1: Run `pnpm build` and fix any type errors**
- [ ] **Step 2: Test in browser — verify PBR materials, roof geometry, material panel**
- [ ] **Step 3: Final commit**
