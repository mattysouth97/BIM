# Digital Twin Platform -- Strategic Pivot Plan

**Version:** 1.1
**Date:** 2026-04-05
**Status:** COMPLETE -- 2026-07-02 audit: 31/32 tasks shipped. Deliberate deviations: (1.4) layer system rebuilt as 15 building-systems layers (BAS/telecom/MEP/microgrid) instead of the proposed 5 groups — richer taxonomy, working + tested, kept; (1.5) undo system now fully deleted; (3.2) office curtain-wall shipped in src/lib/procedural. VWorld 3D surface superseded by CAPEX/ROI simulator pivot (f62eaa4).
**Scope:** Full product pivot from BIM Authoring Tool to Automated Digital Twin Platform

---

## RALPLAN-DR Summary

### Principles (5)

1. **Automation First** -- Everything derivable from public data must be automatic. Zero manual steps for Level 1 twins.
2. **Data Integrity** -- Korean public APIs (data.go.kr, VWorld) are the source of truth. All inferences must be traceable to code/era/use-type lookup tables.
3. **Progressive Fidelity** -- Level 1 (public data) must stand alone as a useful product. Levels 2/3 refine, never replace.
4. **Business Value Over Visual Polish** -- Energy audit accuracy, compliance scoring, and retrofit ROI matter more than pixel-perfect UI.
5. **Korean Market Native** -- All certifications (녹색건축물 인증, 에너지효율등급), codes, and API conventions are first-class, not internationalized afterthoughts.

### Decision Drivers (Top 3)

1. **GX Team Revenue Path** -- Commercial offices and factories are the priority segments. The platform must produce actionable energy audit reports that clients will pay for.
2. **Public Data Completeness** -- data.go.kr provides building ledger, energy consumption, and floor data. Combined with VWorld footprints and KMA weather data, this is sufficient for credible Level 1 twins without any client input.
3. **Codebase Maturity** -- The procedural pipeline (recipe.ts, facade-generator.ts, structure-generator.ts) and energy engine (heat-loss.ts, annual-demand.ts, co2-emissions.ts, energy-grade.ts, material-inference.ts) are solid foundations. Manual authoring code is entirely separable.

### Viable Options

**Option A: Incremental Pivot (RECOMMENDED)**
- Remove manual authoring code first (clean foundation)
- Enhance existing pipelines in place (recipes, energy engine, data APIs)
- Add new capabilities (reports, retrofit engine, campus) as new modules
- Pros: Low risk, keeps working product at each phase, leverages existing test coverage
- Cons: Slower to reach full vision, some intermediate states have mixed UX

**Option B: Parallel Rewrite**
- Build new Digital Twin app alongside current codebase, migrate components
- Pros: Clean architecture from day one, no legacy constraints
- Cons: High effort duplication, risk of never completing migration, loses existing test/validation work

**Option C: Feature-Flag Approach**
- Keep manual authoring behind feature flags, build new pipeline alongside
- Pros: Can demo both modes
- Cons: Double maintenance burden, confused product identity, contradicts "remove entirely" decision
- **INVALIDATED**: User explicitly decided to remove manual authoring entirely. Keeping it behind flags contradicts that decision and doubles maintenance.

### ADR: Incremental Pivot

- **Decision:** Option A -- Incremental pivot with clean removal followed by progressive enhancement
- **Drivers:** User's explicit "remove entirely" directive for manual authoring; existing procedural pipeline maturity; need for continuous deployability
- **Alternatives considered:** Parallel rewrite (too risky/slow), feature flags (contradicts removal decision)
- **Why chosen:** Lowest risk path that maintains a working product at every phase while progressively building toward full Digital Twin platform
- **Consequences:** Each phase must be independently deployable. Some intermediate UX states will feel incomplete (e.g., simplified workflow before new dashboard is ready).
- **Follow-ups:** After Phase 3, reassess whether the BuildingRecipe type system needs a deeper refactor for mixed-use/campus support.

---

## Context

### Current State

Next.js 16 + React 19 + Three.js (R3F v9) application with:
- 6 building ledger API proxy routes (`src/app/api/bldrgst/*`)
- VWorld spatial data integration (`src/app/api/vworld/footprint/`)
- KMA weather API proxy (`src/app/api/weather/`)
- Energy consumption API proxy (`src/app/api/energy/consumption/`)
- Procedural building generation pipeline (`src/lib/procedural/` -- 7 draw calls via InstancedMesh)
- Material inference from Korean building codes (`src/lib/material-inference.ts`)
- Energy calculation engine (`src/lib/energy/` -- heat loss, annual demand, CO2, grading)
- ECO2 export (`src/lib/energy/eco2-export.ts`)
- 15-layer building systems visualization (`src/lib/layers/`)
- 5-stage workflow (Select > Assemble > Configure > Analyze > Export)
- Manual BIM authoring tools (wall drawing, room assembly, snap/align, component placement)
- 14 existing test files across energy, procedural, store, and geometry modules

### Target State

Automated Digital Twin Platform that:
1. Generates best-possible building twins from public data alone (Level 1)
2. Accepts optional client data to refine fidelity (Level 2/3)
3. Produces four deliverables: energy audit reports, retrofit recommendations, monitoring dashboards, compliance certification
4. Supports single buildings and campus/complex (5-20 buildings)
5. Prioritizes: commercial offices > factories > public/institutional > residential > mixed-use > warehouses
6. Zero manual authoring -- everything procedural/parametric

---

## Guardrails

### Must Have
- Working product at the end of every phase (no multi-phase broken states)
- All public API integrations use server-side proxy routes (no client-side API keys)
- Energy calculations traceable to Korean building code lookup tables
- VWorld API key moved to environment variable (security fix)
- Existing energy test coverage maintained and expanded

### Must NOT Have
- No manual wall drawing, room editing, or component placement
- No feature flags for removed authoring code
- No client-side API key storage for government APIs
- No architecture redesign of the procedural pipeline (enhance, don't rewrite)
- No internationalization work (Korean market only for now)

---

## Resolved Decisions (from open questions)

| # | Decision | Choice | Impact on Plan |
|---|----------|--------|----------------|
| 1 | PDF library | Hybrid: `@react-pdf/renderer` now, server-side later | Phase 8: client-side PDF generation, no puppeteer dependency |
| 2 | Green cert version | Support both old and 2024 standards | Phase 5: certification-types.ts needs version selector, dual scoring tables |
| 3 | Cost database | KICT published data | Phase 6: cost-database.ts sources from KICT annual indices |
| 4 | Solar tariff rates | User-configurable input | Phase 6: solar-potential.ts takes user-supplied rate, no hardcoded defaults |
| 5 | Campus scope | Multi-block / custom boundary | Phase 2.3 & 7: user-defined bounding area, not just 법정동 block queries |
| 6 | IFC extraction depth | Deep investment (Revit + ArchiCAD) | Phase 4.3: robust IfcMaterialLayerSet + IfcPropertySet parsing for two authoring tools |
| 7 | Undo system | Remove entirely | Phase 1: delete `src/lib/undo/` completely (command-history.ts, types.ts, all commands) |
| 8 | Layer system | Rebuild for Digital Twin | Phase 1 or 3: replace 15 component layers with ~5 purpose-driven layers (Envelope, Structure, MEP, Energy Zones, Retrofit Targets) |
| 9 | Deployment | Vercel (serverless) | Phase 8: PDF must be client-side; API routes stay within 10s timeout |
| 10 | Data retention | Server-side storage | Phase 4: needs auth + storage backend for uploaded client data (energy bills, IFC, floor plans) |

---

## Phase 1: Cleanup and Foundation

**Goal:** Remove all manual BIM authoring code, simplify workflow, fix security issues. Establish a clean foundation for the Digital Twin platform.

**Estimated Complexity:** MEDIUM (broad file removal, surgical edits to building-scene.tsx)

### Task 1.1: Remove Manual Authoring Components

**Files to DELETE entirely:**
- `src/components/viewer/wall-drawer.tsx`
- `src/components/viewer/plan-view.tsx`
- `src/components/viewer/plan-grid.tsx`
- `src/components/viewer/room-fills.tsx`
- `src/components/viewer/snap-indicator.tsx`
- `src/components/viewer/alignment-guides.tsx`
- `src/components/viewer/opening-drawer.tsx`
- `src/components/viewer/placed-components.tsx`
- `src/components/viewer/component-palette.tsx`
- `src/components/viewer/transform-gizmo.tsx`
- `src/components/viewer/annotation-tools.tsx`
- `src/components/viewer/element-selector.tsx`
- `src/components/viewer/wall-generator.tsx`
- `src/components/workspace/component-catalog.tsx`

**Files to DELETE entirely (lib):**
- `src/lib/plan/room-detector.ts` + `room-detector.test.ts`
- `src/lib/plan/room-types.ts`
- `src/lib/plan/snap-engine.ts`
- `src/lib/wall-geometry.ts`
- `src/lib/components/component-types.ts`
- `src/lib/components/door-generator.ts`
- `src/lib/components/window-generator.ts`
- `src/lib/components/stair-generator.ts`
- `src/lib/components/mep-fixture-generator.ts`
- `src/lib/undo/commands/plan-commands.ts`
- `src/lib/undo/commands/component-commands.ts`
- `src/lib/undo/command-history.ts` (undo system removed entirely per Decision #7)
- `src/lib/undo/types.ts`
- `src/lib/undo/commands/` (entire directory)

**Stores to DELETE:**
- `src/store/plan-store.ts` + `src/store/__tests__/plan-store.test.ts`
- `src/store/component-store.ts`
- `src/store/authoring-store.ts`
- `src/store/undo-store.ts` (if exists — undo system removed entirely)

**Acceptance Criteria:**
- `pnpm build` passes with zero type errors
- `pnpm test` passes (remaining tests unaffected)
- No imports of deleted files remain anywhere in `src/`
- Building scene renders procedural model without errors

### Task 1.2: Simplify Workflow Stages

Replace the 5-stage workflow with a 3-stage automated flow:

| Old Stage | New Stage | Purpose |
|-----------|-----------|---------|
| Select | **Search** | Find building by address/region |
| Assemble | _(removed)_ | Was manual authoring |
| Configure | **Twin** | View 3D twin, adjust parameters, see energy metrics |
| Analyze | _(merged into Twin)_ | Energy analysis is always visible |
| Export | **Report** | Generate reports, export data |

**Files to MODIFY:**
- `src/lib/workflow/stages.ts` -- Redefine `WorkflowStage` as `"search" | "twin" | "report"`
- `src/lib/workflow/toolbar-configs.ts` -- Remove assemble groups, simplify configure/analyze into twin
- `src/store/workflow-store.ts` -- Update initial state, guards
- `src/store/__tests__/workflow-store.test.ts` -- Update tests
- `src/components/workspace/workflow-stepper.tsx` -- 3-step stepper
- `src/components/workspace/contextual-toolbar.tsx` -- Remove all authoring toolbar items, opening preset imports

**Files to MODIFY (remove authoring references):**
- `src/components/viewer/building-scene.tsx` -- Remove ~15 imports (WallDrawer, PlanView, RoomFills, OpeningDrawer, PlacedComponents, ComponentPalette, TransformGizmo, AnnotationTools, ElementSelector, PlanGrid, FloorSlabs) and their JSX/conditional rendering. Remove usePlanStore, useAuthoringStore, useComponentStore subscriptions.
- `src/components/workspace/scene-outliner.tsx` -- Remove plan-store/component-store imports
- `src/components/workspace/properties-panel.tsx` -- Remove plan-store/component-store imports
- `src/components/workspace/status-bar.tsx` -- Remove plan-store/authoring-store imports

**Acceptance Criteria:**
- Workflow stepper shows 3 stages: Search > Twin > Report
- Toolbar shows only view controls + config/layer panel toggles in Twin stage
- `pnpm build` and `pnpm test` pass

### Task 1.3: Security Fix -- VWorld API Key

**File:** `src/app/api/vworld/footprint/route.ts`

Move hardcoded `VWORLD_API_KEY = "98E6A75B-..."` to environment variable.

**Changes:**
- Read from `process.env.VWORLD_API_KEY`
- Add to `.env.local.example` with placeholder
- Return 500 if not configured
- Add `VWORLD_API_KEY` to CLAUDE.md environment documentation

**Acceptance Criteria:**
- No hardcoded API keys in source code
- `grep -r "98E6A75B" src/` returns zero results
- VWorld footprint API still works when env var is set

### Task 1.4: Rebuild Layer System for Digital Twin (Decision #8)

Replace the 15 component-based layers with ~5 purpose-driven Digital Twin layers.

**Current:** `src/lib/layers/layer-manager.ts` with 15 layers (walls, columns, slabs, openings, roof, MEP-pipe, MEP-duct, MEP-electrical, structural-analysis, annotations, etc.)

**New Layer Scheme:**
| Layer | Contents | Purpose |
|-------|----------|---------|
| Envelope | Walls, roof, windows, doors | Thermal boundary visualization |
| Structure | Columns, slabs, foundation | Load-bearing elements |
| MEP | All MEP systems (combined) | Building services overview |
| Energy Zones | Floor-level energy zones, heat loss coloring | Energy audit visualization |
| Retrofit Targets | Highlighted elements recommended for upgrade | Retrofit recommendation overlay |

**Files to MODIFY:**
- `src/lib/layers/layer-manager.ts` — Redefine layer definitions from 15 → 5
- `src/lib/layers/layer-types.ts` — Update `LayerId` type
- `src/lib/layers/__tests__/layer-manager.test.ts` — Update tests
- `src/components/workspace/layer-panel.tsx` — Simplified 5-layer toggle UI

**Acceptance Criteria:**
- Layer panel shows 5 purpose-driven layers
- Each layer toggles visibility of its grouped elements
- All existing geometry still renders (just grouped differently)
- `pnpm build` and `pnpm test` pass

### Task 1.5: Remove Undo System Entirely (Decision #7)

**Files to DELETE:**
- `src/lib/undo/` — entire directory (command-history.ts, types.ts, commands/)
- Any undo-related store or hook references

**Files to MODIFY:**
- `src/components/workspace/contextual-toolbar.tsx` — Remove undo/redo buttons
- `src/store/workspace-store.ts` — Remove any undo-related state
- Keyboard shortcut config — Remove Ctrl+Z/Y bindings

**Acceptance Criteria:**
- No imports from `src/lib/undo/` remain in codebase
- No undo/redo UI elements visible
- `pnpm build` passes

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Building scene breaks after authoring removal | HIGH | Remove imports incrementally, `pnpm build` after each batch |
| Contextual toolbar has deep authoring coupling | MEDIUM | Rewrite toolbar-configs.ts for new 3-stage workflow first, then update component |
| Existing tests reference removed stores | LOW | Delete corresponding test files alongside stores |
| Layer regrouping breaks existing viewer functionality | MEDIUM | Map old layer IDs to new groups; verify all geometry renders in each new group |
| Undo removal leaves orphan keyboard shortcuts | LOW | Grep for all Ctrl+Z/Y references and remove |

---

## Phase 2: Enhanced Public Data Pipeline

**Goal:** Expand data sources to maximize Level 1 twin quality. Add batch querying for campus support. Implement data quality scoring.

**Estimated Complexity:** MEDIUM

### Task 2.1: Enhance Energy Consumption API Integration

The route `src/app/api/energy/consumption/route.ts` already proxies `getBdEnergyUse`. Build the client-side hook and UI integration.

**New Files:**
- `src/hooks/use-actual-energy.ts` -- Already exists but needs enhancement for multi-year fetching and data normalization
- `src/lib/energy/consumption-normalizer.ts` -- Normalize raw API response (monthly gas/electric/district-heating) into comparable annual kWh

**Modify:**
- `src/hooks/use-energy-metrics.ts` -- Accept optional actual consumption data, compute predicted-vs-actual delta
- `src/components/viewer/energy-cards.tsx` -- Show actual vs predicted comparison when data available

**Acceptance Criteria:**
- Hook fetches 3 years of energy consumption for a building PK
- Normalizer converts gas (MJ), electric (kWh), district heating (Gcal) to common kWh
- Energy cards show "Predicted: X kWh/m2" vs "Actual: Y kWh/m2" when API data available
- Graceful fallback when energy API returns no data (common for older/smaller buildings)

### Task 2.2: Weather Data Integration for Energy Calculations

Route `src/app/api/weather/route.ts` already proxies KMA ASOS. Build the client hook and integrate with energy engine.

**New Files:**
- `src/hooks/use-weather-data.ts` -- Fetch annual weather summary for nearest station
- `src/lib/energy/weather-processor.ts` -- Convert raw ASOS data to HDD/CDD values (replacing static `climate-data.ts` lookup)

**Modify:**
- `src/lib/energy/climate-data.ts` -- Add function to accept dynamic HDD/CDD from weather API, fall back to static table
- `src/hooks/use-energy-metrics.ts` -- Accept optional dynamic climate data

**Acceptance Criteria:**
- Weather hook fetches previous year's data for station nearest to building location
- HDD/CDD calculation matches Korean standard (base 18.3C heating, 24C cooling)
- Energy metrics automatically use API weather data when available, static lookup as fallback
- Test: `weather-processor.test.ts` validates HDD/CDD from sample ASOS response

### Task 2.3: Batch Query for Campus/Complex

Enable fetching multiple buildings from the same area (shared 법정동코드 + 번지 range).

**New Files:**
- `src/hooks/use-campus-buildings.ts` -- Fetch all buildings in a 법정동 block or address range
- `src/lib/campus/campus-types.ts` -- `CampusData` type (array of `BrTitleInfo` with relative positions)

**Modify:**
- `src/app/api/bldrgst/title/route.ts` -- Support `batchMode=true` parameter to fetch all buildings in a block
- `src/hooks/use-building-footprint.ts` -- Support fetching multiple footprints in one bounding box (VWorld already supports bbox search)

**Acceptance Criteria:**
- User can search for an address and see all buildings on that block
- Each building gets its own `BrTitleInfo` + footprint polygon
- Building list is sortable by floor area, use type, or era
- VWorld footprint request uses expanded bbox when in campus mode

### Task 2.4: Data Quality Scoring

Score how complete public data is for each building, so users know what to expect.

**New Files:**
- `src/lib/data-quality/quality-scorer.ts` -- Pure function: `BrTitleInfo + floors + footprint + energy -> QualityScore`
- `src/lib/data-quality/quality-types.ts` -- `QualityScore` type with per-field completeness

**Quality Dimensions:**
- Geometry completeness: footprint polygon (from VWorld), floor count, heights, total area
- Code completeness: structure code, main use code, permit date (era classification)
- Energy data: actual consumption available? (years of data)
- Material confidence: how well can we infer U-values from era+code? (pre-1970 = low, 2010+ = high)

**Scoring:**
- 0-25%: "Minimal" -- basic geometry only
- 25-50%: "Partial" -- geometry + codes but no energy data
- 50-75%: "Good" -- geometry + codes + some energy data
- 75-100%: "Excellent" -- full data with actual consumption

**Acceptance Criteria:**
- `quality-scorer.ts` is a pure function with no API calls
- Test: `quality-scorer.test.ts` with 4 fixture buildings covering each quality tier
- Score displayed as badge in building header and search results

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Energy consumption API returns empty for most buildings | MEDIUM | Design UI to gracefully degrade; consumption is an enhancement, not requirement |
| Weather API requires separate service key registration | LOW | Already noted in `route.ts` comments; document in setup guide |
| Batch query returns too many buildings (dense urban blocks) | LOW | Cap at 20 buildings per campus, paginate |
| VWorld API key in env var breaks if not configured | LOW | Add clear error message + setup documentation |

---

## Phase 3: Advanced Procedural Modeling

**Goal:** Extend the recipe system to handle commercial offices, factories, mixed-use, and campus layouts with higher fidelity.

**Estimated Complexity:** HIGH

### Task 3.1: Factory/Manufacturing Building Recipes

Current recipe.ts `getUseCategory` maps `mainPurpsCd` 17000/18000 to "factory" but uses generic parameters.

**Modify:**
- `src/lib/procedural/recipe.ts` -- Add `getFactoryConfig()` with:
  - Large column spans (9-15m)
  - High floor heights (4.5-12m based on `heit` field)
  - Loading dock bays on one facade
  - Sawtooth/clerestory roof option
  - Minimal window ratio on 3 sides, office section on one side
- `src/lib/procedural/types.ts` -- Add `FactoryZone` type (process area, office area, warehouse area)

**New Files:**
- `src/lib/procedural/factory-recipe.ts` -- Dedicated factory recipe builder (separated for complexity)

**Acceptance Criteria:**
- Factory building with `mainPurpsCd=17000` generates visually distinct model (large spans, high ceilings, sawtooth roof)
- Column spacing respects structure code (steel = 12m, RC = 9m, mixed = 10m)
- Loading dock visible on one facade (extruded bays at ground level)
- Test: `factory-recipe.test.ts` with 3 factory configurations

### Task 3.2: Commercial Office Building Recipes

Enhance office buildings (mainPurpsCd=14000) with modern commercial typology.

**Modify:**
- `src/lib/procedural/recipe.ts` -- Add `getOfficeConfig()` with:
  - Curtain wall facade for post-2000 era (high window ratio, minimal mullion)
  - Core-and-shell layout (central core, open floor plate)
  - Podium + tower form for tall buildings (>10 floors)
  - Ground floor retail differentiation (higher floor height, different facade)
- `src/lib/procedural/facade-generator.ts` -- Support curtain wall mode (continuous glass, structural mullion grid)

**Acceptance Criteria:**
- 2010+ office building generates curtain wall facade (>70% glass)
- Buildings >10 floors show podium (3-floor base with different facade) + tower
- Ground floor has distinct treatment (higher ceiling, larger openings)
- Pre-2000 offices retain current punched-window facade

### Task 3.3: Mixed-Use Building Support

Support podium-tower or stacked-use configurations where lower floors differ from upper.

**New Files:**
- `src/lib/procedural/mixed-use-recipe.ts` -- Split building into sections, each with its own sub-recipe

**Modify:**
- `src/lib/procedural/types.ts` -- Add `BuildingSection` type (floor range, use code, sub-recipe)
- `src/lib/procedural/procedural-building.ts` -- Compose multiple sections into one model

**Acceptance Criteria:**
- Mixed-use building (detected from floor data with different `mainPurpsCd` per floor range) generates distinct sections
- Each section has appropriate facade, floor height, and material treatment
- Energy calculation treats each section with its own occupancy/HVAC defaults

### Task 3.4: Enhanced Roof Variety

Current `getRoofConfig()` always returns flat roof.

**Modify:**
- `src/lib/procedural/recipe.ts` -- `getRoofConfig()` selects roof type based on use + era:
  - Residential pre-2000: gable/hip
  - Factory: sawtooth (clerestory) or flat with skylights
  - Commercial: flat (default, correct for most)
  - Institutional: hip or mansard for older buildings
- `src/lib/procedural/types.ts` -- Expand `RoofConfig.type` to `"flat" | "gable" | "hip" | "sawtooth" | "mansard"`
- `src/components/viewer/roof-generator.tsx` -- Add geometry for sawtooth and hip roofs

**Acceptance Criteria:**
- Factories generate sawtooth roofs
- Pre-2000 residential buildings generate gable/hip roofs
- Commercial buildings keep flat roofs
- All roof types cast correct shadows

### Task 3.5: Campus Site Layout

Position multiple buildings relative to each other on a shared ground plane.

**New Files:**
- `src/lib/campus/site-layout.ts` -- Convert VWorld footprint polygons (already in local meters) to relative positions
- `src/lib/campus/campus-scene.ts` -- Orchestrate multiple ProceduralBuilding instances on shared ground

**Modify:**
- `src/components/viewer/ground-plane.tsx` -- Scale to campus extents, show building footprints as floor markings
- `src/components/viewer/building-scene.tsx` -- Support rendering array of buildings (campus mode)

**Acceptance Criteria:**
- Campus of 3+ buildings renders with correct relative positions from VWorld data
- Shared ground plane encompasses all buildings
- Camera auto-frames to campus extents
- Each building is independently selectable for detail inspection

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Factory recipe complexity bloats recipe.ts | MEDIUM | Extract to `factory-recipe.ts` module |
| Mixed-use detection unreliable from floor data | MEDIUM | Fall back to single-use recipe if floor-level use codes unavailable |
| Campus rendering performance with 20 buildings | HIGH | Each building is already 7 draw calls (InstancedMesh). 20 buildings = 140 draw calls. Monitor, add LOD if needed. |
| Sawtooth roof geometry is complex | LOW | Start with simple extruded triangles, refine later |

---

## Phase 4: Tiered Twin Fidelity (Level 1/2/3)

**Goal:** Implement the progressive fidelity model where Level 1 is automatic, and higher levels accept client data.

**Estimated Complexity:** HIGH

### Task 4.1: Fidelity Level System

**New Files:**
- `src/lib/fidelity/fidelity-types.ts` -- `FidelityLevel` (1|2|3), `FidelityReport` (what's available, what's missing)
- `src/lib/fidelity/fidelity-assessor.ts` -- Pure function: assess current fidelity from available data sources
- `src/lib/fidelity/upgrade-checklist.ts` -- Generate "provide these N items to reach Level X" list

**Acceptance Criteria:**
- Assessor correctly classifies: public data only = Level 1, uploaded floor plans/bills = Level 2, IFC + sensors = Level 3
- Upgrade checklist is specific: "Upload monthly energy bills (gas + electric) from 2023-2025 to reach Level 2"
- Fidelity level displayed prominently in twin view

### Task 4.2: Level 2 -- Client Data Upload

Enable clients to upload supplementary data that refines the twin beyond public data.

**New Files:**
- `src/components/upload/data-upload-wizard.tsx` -- Multi-step upload for: floor plans (PDF/image), energy bills (CSV/image), equipment schedules (structured form)
- `src/lib/upload/energy-bill-parser.ts` -- Parse Korean utility bill CSV format (한전, 도시가스)
- `src/lib/upload/floor-plan-metadata.ts` -- Extract room count, area from uploaded plan metadata (manual input, not OCR -- OCR is future scope)
- `src/store/twin-data-store.ts` -- Zustand store for uploaded supplementary data

**New Files (server-side storage per Decision #10):**
- `src/app/api/twin-data/upload/route.ts` -- Server-side upload endpoint (energy bills, floor plans, IFC files)
- `src/app/api/twin-data/[buildingId]/route.ts` -- Retrieve uploaded data per building
- `src/lib/storage/twin-storage.ts` -- Storage abstraction (Vercel Blob or S3-compatible)
- `src/lib/auth/` -- Basic auth layer for GX team (required for server-side data persistence)

**Modify:**
- `src/lib/material-inference.ts` -- Accept optional overrides from uploaded data (actual U-values, equipment specs)
- `src/hooks/use-energy-metrics.ts` -- Use actual bill data for calibration when available

**Acceptance Criteria:**
- Upload wizard accepts CSV energy bills and parses monthly consumption
- Uploaded data overrides inferred values in material properties
- Energy metrics show "calibrated" badge when actual data supplements estimates
- Uploaded data persists server-side (Vercel Blob storage), accessible across devices
- Basic authentication gates upload/retrieval (GX team members only)
- Files stored with building ID key, retrievable on any device after login

### Task 4.3: Level 3 -- IFC/BIM Model Integration

The IFC loader already exists (`src/components/viewer/ifc-loader.tsx`). Enhance it to extract material and geometry data for energy simulation.

**Modify:**
- `src/components/viewer/ifc-loader.tsx` -- Extract wall areas, window areas, material properties from IFC model
- `src/lib/material-inference.ts` -- Accept IFC-derived material properties as highest-confidence source

**New Files (Deep IFC investment per Decision #6):**
- `src/lib/ifc/ifc-material-extractor.ts` -- Parse IFC IfcMaterialLayerSet into MaterialProperties format
- `src/lib/ifc/revit-property-map.ts` -- Revit-specific IfcPropertySet mappings (thermal conductivity, U-values, glazing SHGC)
- `src/lib/ifc/archicad-property-map.ts` -- ArchiCAD-specific property mappings (different property naming conventions)
- `src/lib/ifc/ifc-geometry-extractor.ts` -- Extract wall/window/roof areas from IFC geometry for accurate heat loss calculation
- `src/lib/ifc/__tests__/ifc-material-extractor.test.ts` -- Test with sample Revit + ArchiCAD IFC fragments

**Acceptance Criteria:**
- IFC upload populates material properties with actual U-values from model
- Material source shows "ifc-model" instead of "code-estimate"
- Energy calculation uses IFC-derived values, falling back to inference for missing fields
- Revit IFC exports: extracts IfcMaterialLayerSet, thermal conductivity from IfcPropertySet, glazing properties
- ArchiCAD IFC exports: maps ArchiCAD-specific property names to standard material properties
- Handles partial data gracefully (some properties present, others missing → hybrid IFC + inference)

### Task 4.4: Fidelity Indicator UI

**New Files:**
- `src/components/twin/fidelity-badge.tsx` -- Level 1/2/3 indicator with color coding
- `src/components/twin/fidelity-detail-panel.tsx` -- Expandable panel showing what data is available, what's missing, confidence levels

**Acceptance Criteria:**
- Badge shows Level 1 (blue), Level 2 (green), Level 3 (gold) with tooltip
- Detail panel lists every data category with "available/missing/estimated" status
- "Upgrade to Level 2" button opens upload wizard

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Korean utility bill CSV formats vary by provider | HIGH | Start with KEPCO (한전) and city gas formats only; add others incrementally |
| IFC material extraction is complex | MEDIUM | Use web-ifc (already in deps) IfcMaterialLayerSet; accept partial extraction |
| Floor plan OCR is extremely hard | N/A | Explicitly out of scope for Level 2; use manual metadata input instead |

---

## Phase 5: Energy Audit and Compliance Engine

**Goal:** Produce automated energy audit reports and Korean green building compliance scoring.

**Estimated Complexity:** HIGH

### Task 5.1: Predicted vs. Actual Comparison

When Level 2+ data provides actual energy consumption, compare against the model's predictions.

**New Files:**
- `src/lib/energy/calibration.ts` -- Calculate calibration ratio (actual/predicted), identify largest discrepancy sources
- `src/lib/energy/benchmark.ts` -- Korean building energy benchmark database (kWh/m2 by use type, era, region)

**Acceptance Criteria:**
- Calibration report shows % deviation per energy end-use (heating, cooling, lighting, DHW)
- Benchmark comparison shows where building ranks vs. similar buildings
- "This building uses 30% more energy than similar 2005 offices in Seoul" type insights

### Task 5.2: Korean Green Building Certification Scoring (녹색건축물 인증)

**New Files (dual-version support per Decision #2):**
- `src/lib/compliance/green-certification.ts` -- Scoring engine for 녹색건축물 인증 (G-SEED equivalent), supports both pre-2024 and 2024 updated standards
- `src/lib/compliance/certification-types.ts` -- Score categories, weights, thresholds with version discriminator
- `src/lib/compliance/certification-weights-legacy.ts` -- Pre-2024 category weights and thresholds
- `src/lib/compliance/certification-weights-2024.ts` -- 2024 updated category weights and thresholds

**Categories (based on Korean standard):**
1. Land Use and Transportation (토지이용 및 교통)
2. Energy and Environmental Pollution (에너지 및 환경오염)
3. Materials and Resources (재료 및 자원)
4. Water Management (물순환 관리)
5. Maintenance (유지관리)
6. Ecological Environment (생태환경)
7. Indoor Environment (실내환경)
8. Innovation (혁신적 설계)

**Acceptance Criteria:**
- Scoring engine calculates points for categories assessable from available data (primarily #2, #6 partial, #7 partial)
- Categories requiring site visit data marked as "not assessable from remote data"
- Overall score maps to certification level: Excellent/Best/Good/General
- Test: `green-certification.test.ts` with known-score building fixtures

### Task 5.3: Energy Efficiency Rating (건축물 에너지효율등급)

The grading system already exists in `src/lib/energy/energy-grade.ts`. Enhance it to produce the full official rating report format.

**New Files:**
- `src/lib/compliance/efficiency-rating.ts` -- Full rating calculation per Korean standard (primary energy demand, not just delivered energy)
- `src/lib/energy/primary-energy.ts` -- Convert delivered energy to primary energy (apply Korean conversion factors: electricity 2.75, gas 1.1, district heating 0.728)

**Modify:**
- `src/lib/energy/energy-grade.ts` -- Support both delivered and primary energy grading

**Acceptance Criteria:**
- Primary energy conversion uses official Korean conversion factors
- Rating report includes: primary energy demand, delivered energy demand, grade, breakdown by end-use
- Test: `primary-energy.test.ts` validates conversion factors against official standard

### Task 5.4: Building Energy Benchmarking

**New Files:**
- `src/lib/energy/benchmark-database.ts` -- Korean building energy benchmark data (from KEMCO/KBEC published data)
- `src/lib/energy/benchmark-comparison.ts` -- Compare building against peers (same use type, era, climate zone)

**Acceptance Criteria:**
- Benchmark shows percentile ranking (e.g., "This building is in the 65th percentile for energy use among 2000s commercial offices in Seoul")
- Visual: bar chart showing building vs. 25th/50th/75th percentile
- Data source noted as "KEMCO published averages" with year

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Green certification scoring is complex with 70+ sub-criteria | HIGH | Scope to "energy-assessable" categories only (~30% of total score); clearly label partial assessment |
| Primary energy conversion factors change periodically | LOW | Source from official MOTIE/KEMCO publications; version the factors |
| Benchmark data may be outdated | MEDIUM | Use most recent KEMCO publication; show data vintage |

---

## Phase 6: Retrofit Recommendation Engine

**Goal:** Generate actionable retrofit recommendations with cost/benefit analysis and ROI calculations.

**Estimated Complexity:** HIGH

### Task 6.1: Envelope Retrofit Recommendations

**New Files:**
- `src/lib/retrofit/envelope-retrofits.ts` -- Generate recommendations for: window replacement, wall insulation, roof insulation
- `src/lib/retrofit/retrofit-types.ts` -- `RetrofitMeasure` type (description, cost estimate, energy saving, payback period, CO2 reduction)
- `src/lib/retrofit/cost-database.ts` -- Korean construction cost estimates (per m2 for insulation, per unit for windows, etc.)

**Logic:**
- Compare current U-values against 2020+ standards
- For each below-standard element, calculate:
  - Cost to upgrade to standard (cost/m2 * area)
  - Energy saving (heat loss reduction * HDD * 24 / efficiency)
  - Simple payback = cost / annual saving
  - CO2 reduction = energy saving * emission factor

**Acceptance Criteria:**
- Generates 0-N recommendations based on building condition
- Each recommendation has: description (ko/en), estimated cost (KRW), annual energy saving (kWh), payback (years), CO2 reduction (tCO2)
- Recommendations sorted by payback period (best ROI first)
- Test: `envelope-retrofits.test.ts` with pre-1990 building fixture (should generate window + wall + roof recommendations)

### Task 6.2: HVAC and Lighting Retrofits

**New Files:**
- `src/lib/retrofit/hvac-retrofits.ts` -- HVAC system replacement recommendations
- `src/lib/retrofit/lighting-retrofits.ts` -- LED conversion recommendations

**HVAC Logic:**
- Compare current heating/cooling efficiency against modern standards
- Recommend: heat pump conversion, boiler upgrade, VRF system, heat recovery ventilation
- Cost estimates from Korean market data

**Lighting Logic:**
- If lamp type != LED, recommend full conversion
- Calculate: LED fixture cost * floor area * LPD ratio, energy saving from reduced LPD

**Acceptance Criteria:**
- Old boiler (pre-2000) generates heat pump recommendation
- Non-LED lighting generates LED conversion recommendation
- Each recommendation includes Korean government subsidy information where applicable

### Task 6.3: Renewable Energy Potential

**New Files:**
- `src/lib/retrofit/solar-potential.ts` -- Solar PV potential from roof area + orientation + regional irradiance
- `src/lib/retrofit/renewable-types.ts` -- Solar PV system sizing and economics

**Logic:**
- Usable roof area = footprint area * utilization factor (flat: 0.7, gable: 0.5)
- System size (kWp) = usable area * panel efficiency (0.21 for mono-Si)
- Annual generation = system size * regional peak sun hours * performance ratio (0.75)
- Economics: installation cost (KRW/kWp), annual revenue (self-consumption + feed-in tariff), payback

**Acceptance Criteria:**
- Solar potential calculated for every building with flat or gable roof
- Regional irradiance from Korean solar resource map (by sido)
- Economics use current Korean feed-in tariff rates
- Test: `solar-potential.test.ts` for 500m2 flat roof in Seoul

### Task 6.4: Retrofit Report Assembly

**New Files:**
- `src/lib/retrofit/retrofit-report.ts` -- Assemble all recommendations into prioritized report
- `src/components/report/retrofit-summary.tsx` -- Visual summary of all recommendations

**Acceptance Criteria:**
- Report shows total investment, total annual savings, portfolio payback period
- Recommendations grouped by category (envelope, HVAC, lighting, renewable)
- Priority ranking: highest ROI measures first
- Cumulative savings chart: "If you do measures 1-3, savings = X; if 1-5, savings = Y"

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Korean construction costs vary significantly by region/project | HIGH | Use KICT published average costs; label as "estimated range" not exact quotes |
| Government subsidy programs change annually | MEDIUM | Make subsidy data configurable; add update date |
| Solar irradiance data needs to be accurate per region | LOW | Use KMA published annual irradiance by station; 17 cities sufficient |

---

## Phase 7: Campus/Complex Support

**Goal:** Full multi-building campus view with portfolio-level dashboards and cross-building analysis.

**Estimated Complexity:** MEDIUM (builds on Phase 2.3 batch query and Phase 3.5 site layout)

### Task 7.1: Portfolio Energy Dashboard

**New Files:**
- `src/components/campus/portfolio-dashboard.tsx` -- Aggregate energy metrics across all buildings
- `src/lib/campus/portfolio-aggregator.ts` -- Sum/average energy metrics, find outliers

**Acceptance Criteria:**
- Dashboard shows: total campus area, total energy demand, average grade, total CO2
- Each building shown as card with grade badge and key metrics
- "Worst performers" section highlights buildings with lowest grades
- Sort/filter by: energy grade, demand/m2, CO2/m2, building age

### Task 7.2: Cross-Building Comparison

**New Files:**
- `src/components/campus/comparison-view.tsx` -- Side-by-side comparison of 2-4 buildings
- `src/lib/campus/comparison-engine.ts` -- Normalize metrics for fair comparison (per m2 basis)

**Acceptance Criteria:**
- User selects 2-4 buildings from campus for comparison
- Bar charts compare: energy demand/m2, CO2/m2, heat loss/m2, grade
- Radar chart shows envelope performance (wall U, roof U, window U, airtightness) normalized

### Task 7.3: Site-Level Energy Optimization

**New Files:**
- `src/lib/campus/load-diversity.ts` -- Calculate campus load diversity factor
- `src/lib/campus/shared-renewables.ts` -- Optimize solar PV placement across campus buildings

**Acceptance Criteria:**
- Load diversity calculation shows peak demand reduction from temporal diversity
- Shared renewables analysis shows optimal PV distribution across campus rooftops
- Report includes: "Campus-level optimization saves X% vs. building-by-building approach"

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Portfolio view performance with 20 buildings + 3D | MEDIUM | Portfolio dashboard is 2D only; 3D campus view optional |
| Load diversity calculation requires hourly profiles | LOW | Use standard Korean occupancy schedules (already in material-inference.ts) |

---

## Phase 8: Report Generation and Export

**Goal:** Produce professional PDF/HTML reports for all four deliverables.

**Estimated Complexity:** MEDIUM

### Task 8.1: PDF Report Generation Engine (Decision #1: Hybrid, client-side first)

**New Dependencies:** `@react-pdf/renderer` (client-side React component → PDF, compatible with Vercel serverless per Decision #9)

**New Files:**
- `src/lib/report/report-engine.ts` -- Orchestrate report generation from building data + metrics (client-side)
- `src/lib/report/report-types.ts` -- Report templates, sections, data bindings
- `src/lib/report/pdf-renderer.tsx` -- React PDF components using `@react-pdf/renderer`
- `src/lib/report/chart-to-image.ts` -- Convert chart components to static images for PDF embedding

**Note:** No server-side PDF generation endpoint needed — `@react-pdf/renderer` runs entirely in the browser. If design quality is insufficient, migrate to server-side puppeteer when/if deployment moves off Vercel.

**Acceptance Criteria:**
- Energy audit report generates as downloadable PDF entirely client-side
- Report includes: building info, 3D model screenshot, energy metrics, grade, heat loss breakdown, recommendations
- Korean language report with proper formatting (Korean date format, currency, units)
- PDF generation completes in <10 seconds for a typical Level 1 twin
- Charts rendered as static images (PNG) embedded in PDF

### Task 8.2: Energy Audit Report Template

**New Files:**
- `src/lib/report/templates/energy-audit.ts` -- Full energy audit report structure
- `src/components/report/energy-audit-preview.tsx` -- In-app preview before download

**Report Sections:**
1. Building Overview (address, use type, era, area, floors)
2. Twin Fidelity Summary (Level 1/2/3, data sources used)
3. Envelope Analysis (U-values by element, comparison to standard)
4. Energy Performance (predicted demand, actual if available, grade, benchmarking)
5. Heat Loss Breakdown (pie chart by element)
6. CO2 Emissions (total, per m2, comparison to standard)
7. Retrofit Recommendations (prioritized list with economics)
8. Appendices (material properties, calculation methodology, data sources)

**Acceptance Criteria:**
- Report is min 8 pages for a typical commercial building
- All data values traceable to source (public data, inferred, uploaded)
- Compliance section references specific Korean standards
- Report generates in <10 seconds for Level 1 twin

### Task 8.3: Enhanced ECO2 Export

**Modify:**
- `src/lib/energy/eco2-export.ts` -- Add fields for actual consumption, calibration ratio, retrofit scenarios

**New Files:**
- `src/lib/export/csv-export.ts` -- Export energy data as CSV for external analysis
- `src/lib/export/json-export.ts` -- Full building twin data as structured JSON

**Acceptance Criteria:**
- ECO2 export includes all new data fields (actual consumption, primary energy, benchmarks)
- CSV export has one row per building (campus mode) with all key metrics
- JSON export is the complete twin dataset (recipe + materials + metrics + recommendations)

### Task 8.4: Compliance Certification Report

**New Files:**
- `src/lib/report/templates/compliance-report.ts` -- Green certification + energy efficiency rating report
- `src/components/report/compliance-preview.tsx` -- In-app preview

**Acceptance Criteria:**
- Report shows energy efficiency rating (1+++ through 7) with official format
- Green certification partial score with assessable/non-assessable categories clearly marked
- Disclaimer: "This is an automated pre-assessment. Official certification requires authorized assessor."

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `@react-pdf/renderer` styling limitations (no CSS grid, limited fonts) | MEDIUM | Use table-based layouts; embed Korean font (Noto Sans KR). Migrate to server-side later if insufficient |
| 3D screenshot in PDF requires offscreen rendering | MEDIUM | Use Three.js `renderer.domElement.toDataURL()` before report generation |
| Report localization (Korean) | LOW | All content Korean-first; English as secondary |
| Client-side PDF generation may be slow on low-end devices | LOW | Show progress indicator; test on target GX team hardware |

---

## Testing Strategy

### Current State
- 14 test files exist across `src/lib/__tests__/`, `src/lib/energy/__tests__/`, `src/lib/procedural/__tests__/`, `src/store/__tests__/`, `src/lib/layers/__tests__/`
- Vitest configured with `pnpm test` / `pnpm test:watch`
- Playwright configured for e2e (`pnpm test:e2e`)
- Zero e2e tests currently

### Strategy Per Phase

| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| 1: Cleanup | Update existing store tests. Remove plan-store, authoring-store tests. | `pnpm build` as integration gate | Verify 3-stage workflow renders |
| 2: Data Pipeline | weather-processor, quality-scorer, consumption-normalizer | API route tests with mock responses | Search > Twin flow with real API |
| 3: Procedural | factory-recipe, office curtain wall, mixed-use detection | Multi-building rendering | Visual regression for new building types |
| 4: Fidelity | fidelity-assessor, energy-bill-parser | Upload flow integration | Upload wizard e2e |
| 5: Compliance | green-certification, primary-energy, benchmark | Full audit calculation chain | Report preview renders |
| 6: Retrofit | envelope-retrofits, solar-potential, cost calculation | Retrofit report assembly | Recommendation list renders |
| 7: Campus | portfolio-aggregator, load-diversity | Multi-building metrics | Campus view e2e |
| 8: Reports | Report template rendering | PDF generation | Full report download |

### Priority Tests (implement first)
1. `src/lib/energy/__tests__/primary-energy.test.ts` -- Conversion factors are regulatory
2. `src/lib/data-quality/__tests__/quality-scorer.test.ts` -- Core new concept
3. `src/lib/retrofit/__tests__/envelope-retrofits.test.ts` -- Business-critical calculations
4. `src/lib/compliance/__tests__/green-certification.test.ts` -- Regulatory compliance

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Zero references to deleted authoring files in `src/`
- [ ] 3-stage workflow (Search > Twin > Report) functional
- [ ] `pnpm build` and `pnpm test` pass
- [ ] VWorld API key in environment variable

### Phase 2 Complete When:
- [ ] Actual energy consumption shown alongside predicted (when available)
- [ ] Dynamic weather data feeds energy calculation
- [ ] Campus batch query returns multiple buildings
- [ ] Data quality score displayed for every building

### Phase 3 Complete When:
- [ ] Factory buildings visually distinct (high ceilings, sawtooth roof, large spans)
- [ ] Commercial offices show curtain wall facades (post-2000)
- [ ] Mixed-use buildings render distinct sections
- [ ] Campus renders 3+ buildings with correct relative positions

### Phase 4 Complete When:
- [ ] Fidelity level (1/2/3) displayed for every building
- [ ] Upload wizard accepts energy bills and floor plan metadata
- [ ] IFC upload extracts material properties
- [ ] Upgrade checklist generates specific data requests

### Phase 5 Complete When:
- [ ] Predicted vs. actual comparison renders for Level 2+ buildings
- [ ] Green certification partial score calculated
- [ ] Energy efficiency rating uses primary energy conversion
- [ ] Benchmark comparison shows percentile ranking

### Phase 6 Complete When:
- [ ] Envelope retrofit recommendations generated with cost/payback
- [ ] HVAC and lighting retrofits recommended
- [ ] Solar PV potential calculated per building
- [ ] Prioritized retrofit report assembled

### Phase 7 Complete When:
- [ ] Portfolio dashboard shows aggregate campus metrics
- [ ] Cross-building comparison with charts
- [ ] Load diversity calculation functional

### Phase 8 Complete When:
- [ ] PDF energy audit report downloadable
- [ ] Compliance certification report generated
- [ ] Enhanced ECO2 + CSV + JSON exports functional
- [ ] All four deliverables producible from the platform

---

## Dependency Graph

```
Phase 1 (Cleanup) ──> Phase 2 (Data Pipeline) ──> Phase 3 (Procedural)
                                                         │
                                                         v
                  Phase 4 (Fidelity) <──────────────────┘
                         │
                         v
                  Phase 5 (Compliance) ──> Phase 6 (Retrofit)
                         │                        │
                         v                        v
                  Phase 7 (Campus) ──────> Phase 8 (Reports)
```

- Phases 1-3 are sequential (each depends on prior cleanup/foundation)
- Phase 4 depends on Phase 2 (data pipeline) and Phase 3 (procedural models for Level 1)
- Phase 5 depends on Phase 4 (fidelity levels determine what's assessable)
- Phase 6 depends on Phase 5 (retrofit recommendations need baseline audit)
- Phase 7 can start after Phase 3 (campus layout) but benefits from Phase 5 (portfolio metrics)
- Phase 8 depends on Phases 5+6 (report content comes from audit + retrofit engines)

---

## File Inventory Summary

| Category | Keep | Remove | New | Modify |
|----------|------|--------|-----|--------|
| Viewer Components | 12 | 14 | 0 | 2 |
| Workspace Components | 3 | 1 | 0 | 4 |
| Lib (procedural) | 5 | 0 | 3 | 3 |
| Lib (energy) | 7 | 0 | 6 | 3 |
| Lib (plan/components) | 0 | 8 | 0 | 0 |
| Lib (new modules) | 0 | 0 | ~25 | 0 |
| Stores | 5 | 3 | 1 | 2 |
| API Routes | 9 | 0 | 1 | 1 |
| Hooks | 7 | 1 | 3 | 2 |
| Report Components | 0 | 0 | ~8 | 0 |
| Tests | 10 | 3 | ~12 | 2 |

**Total: ~55 new files, ~30 removals, ~20 modifications across 8 phases**
