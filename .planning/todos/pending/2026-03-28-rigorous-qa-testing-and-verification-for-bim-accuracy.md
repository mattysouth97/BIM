---
created: "2026-03-28T00:15:00.000Z"
title: Rigorous QA testing and verification for BIM accuracy
area: testing
files: []
---

## Problem

The application simulates a BIM/Digital Twin but has NO automated tests, NO error boundaries, and NO verification that the 3D representations are geometrically accurate. This is both a UX and software production issue:

### Accuracy gaps (BIM fidelity)
- Procedural building geometry not validated against real Korean building dimensions
- Heat loss calculations (U×A×ΔT) not verified against known benchmark buildings
- Energy grade thresholds not cross-checked with official Korean 에너지효율등급 documents
- 14-layer building systems are visual representations — no verification they match actual infrastructure placement rules
- Wall drawing tool has no dimensional validation (minimum wall length, max span without columns)
- Component placement (doors/windows) lacks Korean building code compliance checks

### UX gaps
- No error boundaries — R3F Canvas crash takes down entire page
- No loading states for heavy operations (layer generation, building rebuild on recipe change)
- No user feedback for authoring operations (no toast/notification when wall drawn, component placed)
- No validation on config panel inputs (can set impossible values: 0m wall thickness, 200% WWR)
- No undo confirmation for destructive actions (delete component, clear annotations)

### Testing gaps
- Zero test files in the project
- No unit tests for energy calculations (heat-loss.ts, annual-demand.ts, energy-grade.ts, co2-emissions.ts)
- No unit tests for procedural generators (recipe.ts, facade-generator, structure-generator)
- No integration tests for API proxy routes
- No snapshot tests for component rendering
- No E2E tests for critical user flows (search building → view 3D → edit config → see energy update)
- No visual regression tests for 3D renderer output

### Process gaps
- Phases 5-10 executed without any test creation
- Verification was limited to "pnpm build passes" — type safety only, no behavioral verification
- No test infrastructure set up (Vitest, Playwright, testing-library)

## Solution

This should be a dedicated phase (or inserted as Phase 10.1) before continuing v2.0 feature work:

### 1. Test infrastructure setup
- Install Vitest + @testing-library/react + happy-dom
- Install Playwright for E2E tests
- Add test scripts to package.json
- Create test utilities for Three.js mocking (R3F test renderer)

### 2. Unit tests (pure functions — highest ROI)
- src/lib/energy/*.ts — heat loss, annual demand, energy grade, CO2 (benchmark against known values)
- src/lib/procedural/recipe.ts — getRecipe() produces correct dimensions for each era/structure
- src/lib/building-geometry.ts — toRecipe() converts API data correctly
- src/lib/korean-building-codes.ts — WALL_LAYERS thickness sums, U-value calculations
- src/lib/layers/types.ts — LAYER_CONFIGS has all 14 entries with correct properties
- src/store/*.ts — Zustand store actions produce expected state transitions

### 3. Integration tests
- API proxy routes return expected structure
- Config panel slider changes → store updates → energy recalculation
- Component placement → component-store update

### 4. E2E tests (Playwright)
- Search building → select → 3D renders
- Toggle layers on/off
- Switch plan view ↔ 3D view
- Draw wall in plan view
- Export ECO2 file

### 5. Error boundaries + input validation
- React ErrorBoundary around Canvas, ConfigPanel, EnergyCards
- Input validation on all config sliders (min/max/step enforcement)
- Graceful fallback when API returns no data
- WebGL context loss recovery

### 6. BIM accuracy validation
- Compare procedural building output against known Korean apartment typologies
- Verify energy calculations against published Korean building energy benchmarks
- Cross-reference structure codes with actual Korean building code documents
