# UI Integration Plan — Phase 19-26 Backend Modules

**Date:** 2026-04-11
**Scope:** Wire ~60 backend library/engine files into the existing UI
**Complexity:** HIGH (18 unwired modules across 3 workflow stages)
**Parallel Tasks:** 5 independent tasks (non-overlapping files)

---

## Context

The v4.0 Digital Twin Platform has extensive backend libraries (data quality scoring, fidelity assessment, energy calibration, benchmarking, green certification, efficiency rating, retrofit recommendations, report generation, PDF rendering, CSV/JSON export, campus aggregation) but nearly all are dead code — imported by nothing in the UI layer. The 3-stage workflow (Search > Twin > Report) exists and navigates correctly, but most panels show stubs.

### Currently Wired
- `use-actual-energy.ts` feeds EnergyCards (modeled vs actual)
- `status-bar.tsx` shows energy grade + demand + CO2 from `useEnergyMetrics`
- Workflow stepper navigates between search/twin/report stages
- Search forms + results table work end-to-end

### Architecture
- **Search page:** `src/app/page.tsx` — search forms, results table, export dropdown
- **Building page:** `src/app/building/[id]/page.tsx` — `WorkspaceShell` wrapping `BuildingScene`
- **WorkspaceShell:** floating left dock (SceneOutliner), floating right dock (PropertiesPanel), bottom shelf (StatusBar)
- **Workflow store:** `useWorkflowStore` with `stage: "search" | "twin" | "report"`
- **Workspace store:** `useWorkspaceStore` with panel toggle states
- **Selection store:** `useSelectionStore` with selectedType/selectedId

---

## Guardrails

### Must Have
- All imports resolve — no broken module references
- `pnpm build` passes with zero type errors after each task
- Each task is independently mergeable (non-overlapping file edits)
- No new npm dependencies (all libraries already installed)

### Must NOT Have
- No changes to backend library files (pure integration, no logic changes)
- No changes to the 3D viewer/R3F canvas (building-scene.tsx, procedural-building-model.tsx)
- No new route pages except campus (Task I5)
- No mock data — use real function calls; show empty/loading states when data unavailable

---

## Task I1: Search Stage — Data Quality Badges

### Objective
Add a colored quality badge per building row in search results, computed from `scoreDataQuality()`.

### Files Modified
| File | Change |
|------|--------|
| `src/components/search/search-results-table.tsx` | Add quality badge column, import scorer |

### Detailed Steps

1. **Add "Quality" column to the TanStack Table columns array** (insert after the "Approved" column)
   - Import `scoreDataQuality` from `@/lib/data-quality/quality-scorer`
   - Import `QualityTier` from `@/lib/data-quality/quality-types`
   - In the cell renderer, call `scoreDataQuality(row.original)` — no floors/footprint/energy at search time, so it scores geometry + codes + material dimensions only
   - Render a colored `<Badge>` with tier label:
     - `excellent` → green badge
     - `good` → blue badge
     - `partial` → yellow badge
     - `minimal` → gray badge
   - Display the numeric overall score inside the badge (e.g., "Good 62")

2. **Add hover tooltip with dimension breakdown**
   - On badge hover, show a small popover/tooltip with 4 dimension scores:
     - Geometry: XX/100
     - Codes: XX/100
     - Energy: XX/100 (will be 0 at search time — show "N/A" or "0")
     - Material: XX/100
   - Use existing Tooltip component from `@/components/ui/tooltip` or simple title attribute

3. **Memoize scoring per row** — wrap `scoreDataQuality` call in `useMemo` keyed on the row data to avoid recomputation during re-renders/sorts

### Acceptance Criteria
- [ ] Each row in search results shows a colored quality badge
- [ ] Badge color matches the tier (green/blue/yellow/gray)
- [ ] Hovering the badge shows dimension breakdown
- [ ] Sorting by quality column works (sort by `overall` score)
- [ ] `pnpm build` passes with zero type errors
- [ ] No changes to any file outside `search-results-table.tsx`

### Risks & Mitigations
- **Performance with 100+ rows:** `scoreDataQuality` is pure arithmetic (no I/O). Memoize at column cell level. Virtualizer already handles DOM performance.
- **Missing data fields:** The scorer handles missing fields gracefully (scores 0 for missing dimensions). No special error handling needed.

---

## Task I2: Twin Stage — Properties Panel (Fidelity + Compliance + Benchmark)

### Objective
Transform the right-dock PropertiesPanel from a "Select an element" stub into a comprehensive building analytics panel showing fidelity, calibration, benchmark, certification, and efficiency data.

### Files Modified
| File | Change |
|------|--------|
| `src/components/workspace/properties-panel.tsx` | Complete rewrite of panel content |
| `src/app/building/[id]/page.tsx` | Pass `buildingPk` and `sigunguCd` to WorkspaceShell/PropertiesPanel |
| `src/components/workspace/workspace-shell.tsx` | Accept and forward `buildingPk`/`sigunguCd` props |

### Detailed Steps

1. **Thread building context through WorkspaceShell**
   - In `building/[id]/page.tsx`: compute `buildingPk` from the decoded ID components and pass to `<WorkspaceShell buildingPk={pk} sigunguCd={buildingId.sigunguCd}>`
   - In `workspace-shell.tsx`: accept `buildingPk` and `sigunguCd` as optional props, forward to `<PropertiesPanel buildingPk={buildingPk} />` and `<StatusBar buildingPk={buildingPk} sigunguCd={sigunguCd} />`
   - In `workspace-shell.tsx`: also forward `buildingPk` to `<SceneOutliner buildingPk={buildingPk ?? ""} />` (already has prop, just wire actual value)

2. **Rewrite PropertiesPanel as a scrollable analytics dashboard**
   - Accept `buildingPk?: string` prop
   - When no buildingPk, show the existing "Select an element" empty state
   - When buildingPk is present, render accordion sections:

   **Section A: Fidelity Assessment**
   - Import `assessFidelity` from `@/lib/fidelity/fidelity-assessor`
   - Import `generateUpgradeChecklist` from `@/lib/fidelity/upgrade-checklist`
   - Import `FidelityBadge` from `@/components/twin/fidelity-badge`
   - Import `FidelityDetailPanel` from `@/components/twin/fidelity-detail-panel`
   - Call `assessFidelity({ hasPublicData: true, hasFloorData: !!floors, ... })` with available data flags
   - Render `FidelityBadge` at the top + `FidelityDetailPanel` accordion with upgrade checklist
   - "Upgrade to Level 2/3" button opens the upload dialog via `useWorkspaceStore.getState().setUploadDialogOpen(true)`

   **Section B: Energy Calibration**
   - Import `calibrateEnergy` from `@/lib/energy/calibration`
   - Import `useActualEnergy` from `@/hooks/use-actual-energy`
   - Import `useEnergyMetrics` from `@/hooks/use-energy-metrics`
   - When actual energy data is available (from `useActualEnergy`), call `calibrateEnergy(predicted, actual)` and display:
     - Overall delta percentage with color coding (green <5%, yellow 5-15%, red >15%)
     - Calibration ratio
     - Largest discrepancy end-use
     - Insight text
   - When no actual data: show "No actual energy data available — upload bills to calibrate" message

   **Section C: Benchmark Comparison**
   - Import `compareToBenchmark` from `@/lib/energy/benchmark-comparison`
   - Call with the building's demand per m2, use type, era, region
   - Display: percentile gauge (simple colored bar), performance label, p25/p50/p75 reference points, insight text

   **Section D: Green Certification (G-SEED)**
   - Import `scoreGreenCertification` from `@/lib/compliance/green-certification`
   - Add a version toggle (pre-2024 / 2024) using a simple Select or segmented control
   - Display: grade badge, earned/max points, assessable percentage, per-category scores in a compact list
   - Show disclaimer text

   **Section E: Efficiency Rating**
   - Import `calculateEfficiencyRating` from `@/lib/compliance/efficiency-rating`
   - Display: grade badge (large, colored), primary energy per area, grade label in Korean

3. **Wire `useWeatherData` hook into energy metrics pipeline**
   - Import `useWeatherData` from `@/hooks/use-weather-data`
   - Call `useWeatherData()` in PropertiesPanel (uses default Seoul station for now)
   - When weather data is available, display HDD/CDD in the energy section
   - Pass dynamic HDD/CDD to energy demand calculations if the metrics pipeline supports it (check `useEnergyMetrics` interface)

### Acceptance Criteria
- [ ] PropertiesPanel shows 5 collapsible sections when a building is loaded
- [ ] FidelityBadge renders with correct level (L1 for public-data-only buildings)
- [ ] FidelityDetailPanel shows category statuses and upgrade CTA
- [ ] Calibration section shows delta when actual energy data exists, else shows upload prompt
- [ ] Benchmark shows percentile bar with performance label
- [ ] G-SEED shows grade with version toggle (pre-2024/2024)
- [ ] Efficiency rating shows grade badge with primary energy value
- [ ] Weather HDD/CDD values displayed when API key is configured
- [ ] `pnpm build` passes with zero type errors
- [ ] No changes to any backend library files

### Risks & Mitigations
- **Data availability:** Most sections degrade gracefully — show "unavailable" state with upgrade CTA. Fidelity and efficiency always computable from public data.
- **BuildingCertificationInput construction:** Need to derive `wallUValue`, `windowUValue`, `roofUValue` from the material inference pipeline. Use the existing `inferMaterialProperties` function values; if not available, use Korean code defaults from `korean-building-codes.ts`.
- **Prop threading:** Requires changes to 3 files (page, shell, panel). Keep changes minimal — just add optional props with no breaking changes.

---

## Task I3: Twin Stage — Retrofit Recommendations Panel (Left Dock)

### Objective
Repurpose the SceneOutliner (left dock, currently "No elements yet" stub) as a "Twin Insights" panel showing prioritized retrofit recommendations.

### Files Modified
| File | Change |
|------|--------|
| `src/components/workspace/scene-outliner.tsx` | Complete rewrite as retrofit/insights panel |

### Detailed Steps

1. **Rename internal purpose (keep component name for import compatibility)**
   - Keep export name `SceneOutliner` and prop interface to avoid breaking `workspace-shell.tsx`
   - Change internal content from "No elements yet" to a tabbed insights panel

2. **Build retrofit recommendations panel**
   - Import all retrofit generators:
     - `generateEnvelopeRetrofits` from `@/lib/retrofit/envelope-retrofits`
     - `generateHvacRetrofits` from `@/lib/retrofit/hvac-retrofits`
     - `generateLightingRetrofits` from `@/lib/retrofit/lighting-retrofits`
     - `calculateSolarPotential` from `@/lib/retrofit/solar-potential`
   - Import `assembleRetrofitReport` from `@/lib/retrofit/retrofit-report`
   - Import `useEnergyMetrics` from `@/hooks/use-energy-metrics`
   - Compute retrofit measures from building data (needs energy metrics + building geometry)
   - Assemble into `RetrofitReport` via `assembleRetrofitReport(allMeasures)`

3. **Render the retrofit report**
   - **Summary card** at top: total investment (KRW), annual saving, CO2 reduction, portfolio payback
   - **Prioritized measures list** (sorted by payback, shortest first):
     - Each measure as a compact card: name, category icon, cost, annual saving, payback years
     - Color-coded by category (envelope=blue, hvac=orange, lighting=yellow, renewable=green)
   - **Cumulative savings mini-chart**: simple stacked bar or text-based running total
   - **Category tabs** or filter: All / Envelope / HVAC / Lighting / Renewable

4. **Handle empty/loading states**
   - When no buildingPk: show "Load a building to see insights"
   - When computing: show skeleton/spinner
   - When no measures generated: show "No retrofit recommendations for this building profile"

### Acceptance Criteria
- [ ] Left dock panel shows retrofit recommendations when building is loaded
- [ ] Summary card shows aggregate investment, savings, CO2, payback
- [ ] Measures are sorted by payback period (shortest first)
- [ ] Each measure shows name, category, cost, saving, payback
- [ ] Category filter works (All / Envelope / HVAC / Lighting / Renewable)
- [ ] Empty state shows when no building is loaded
- [ ] `pnpm build` passes with zero type errors
- [ ] No changes to any file outside `scene-outliner.tsx`

### Risks & Mitigations
- **Retrofit generator input requirements:** Each generator needs specific building parameters (area, U-values, HVAC type, etc.). Use data from `useEnergyMetrics` and material inference. If some params unavailable, generators should return fewer measures (they handle missing inputs).
- **File name mismatch:** Component file is `scene-outliner.tsx` but now serves as insights panel. Acceptable — renaming would require changes to `workspace-shell.tsx` which is in Task I2's scope. The FloatingPanel title is already configurable ("Scene" in shell).

---

## Task I4: Report Stage — Report Generation + Export

### Objective
Make the Report stage functional: show report type selector, render preview components, wire PDF download and data export buttons.

### Files Modified
| File | Change |
|------|--------|
| `src/components/workspace/workspace-shell.tsx` | Add report stage content overlay |
| `src/lib/workflow/toolbar-configs.ts` | Wire report toolbar action descriptors |
| `src/components/workspace/contextual-toolbar.tsx` | Add report action dispatch handlers |

**Note:** Task I2 also modifies `workspace-shell.tsx` but in a different section (prop threading for PropertiesPanel). Task I4 modifies the report stage content rendering. These can be developed on separate branches and merged without conflict if I2 handles the props section and I4 handles the report content section. To avoid merge conflicts, the recommended execution order is I2 first, then I4.

### Detailed Steps

1. **Add report stage content to WorkspaceShell**
   - Import report preview components:
     - `EnergyAuditPreview` from `@/components/report/energy-audit-preview`
     - `CompliancePreview` from `@/components/report/compliance-preview`
   - Import report engine functions:
     - `assembleEnergyAuditReport`, `assembleComplianceReport`, `assembleRetrofitReport` from `@/lib/report/report-engine`
   - Import PDF renderer: `ReportPDF` from `@/lib/report/pdf-renderer`
   - Import `@react-pdf/renderer`'s `pdf` function for blob generation
   - Import export functions: `generateBuildingCSV` from `@/lib/export/csv-export`, `generateTwinJSON` from `@/lib/export/json-export`
   - When `stage === "report"`, overlay the viewport with a report panel:
     - Show a **report type selector** (tabs or segmented control): Energy Audit / Compliance / Retrofit
     - Render the selected preview component with assembled report data
     - Each preview already has a "Download PDF" button — wire the `onDownloadPdf` callback to:
       1. Assemble `ReportData` via the appropriate `assemble*Report()` function
       2. Render `<ReportPDF data={reportData} />` to blob via `pdf(...).toBlob()`
       3. Create object URL and trigger download
     - Add "Export CSV" and "Export JSON" buttons in the report header area

2. **Wire report toolbar actions**
   - In `toolbar-configs.ts`: add action descriptors for `report-export-data` and `report-generate`
   - `report-export-data`: dispatch to a workspace store method or use a custom handler
   - `report-generate`: switch to report generation mode
   - In `contextual-toolbar.tsx`: add handling for report stage actions (these are currently no-ops because TOOLBAR_ACTIONS has no entries for report IDs)

3. **Implement CSV/JSON export flow**
   - CSV export: assemble `BuildingExportData` from current building metrics, call `generateBuildingCSV([data])`, create blob, trigger download
   - JSON export: assemble `TwinExportData` from current building data + metrics, call `generateTwinJSON(data)`, create blob, trigger download
   - Both use the standard blob-download pattern: `URL.createObjectURL(blob)` + `<a>` click + `URL.revokeObjectURL()`

### Acceptance Criteria
- [ ] Navigating to Report stage shows report type selector (Energy Audit / Compliance / Retrofit)
- [ ] Selecting Energy Audit renders `EnergyAuditPreview` with real building data
- [ ] Selecting Compliance renders `CompliancePreview` with real certification + efficiency data
- [ ] "Download PDF" button generates and downloads a PDF file
- [ ] "Export CSV" button downloads a .csv file with building data
- [ ] "Export JSON" button downloads a .json file with twin export data
- [ ] Report toolbar buttons in contextual toolbar are functional
- [ ] `pnpm build` passes with zero type errors

### Risks & Mitigations
- **@react-pdf/renderer SSR:** The PDF renderer uses `<Document>` from @react-pdf/renderer which is not DOM. Must lazy-import and use `pdf().toBlob()` on client only. Wrap in dynamic import with `{ ssr: false }`.
- **Report data assembly:** Requires energy metrics, calibration, benchmark, certification results. Some may be null. The report engine handles optional sections (calibration and benchmark are optional params). Show "Insufficient data for this report type" if required metrics are unavailable.
- **Potential overlap with I2 on workspace-shell.tsx:** I2 adds props, I4 adds report content. Mitigate by having I2 execute first, or clearly delineating the edit regions.

---

## Task I5: Campus Mode Integration

### Objective
Add a campus mode toggle to the search page that enables multi-building selection, portfolio dashboard, and comparison view.

### Files Modified
| File | Change |
|------|--------|
| `src/app/page.tsx` | Add campus mode toggle and campus UI section |
| `src/app/campus/page.tsx` | **New file** — dedicated campus page (optional, can be inline) |

### Detailed Steps

1. **Add campus mode toggle to search page**
   - Add a toggle/switch in the search page header area: "Campus Mode" / "캠퍼스 모드"
   - When toggled on, show additional campus input fields:
     - District selector (reuse existing region dropdowns for sigunguCd/bjdongCd)
     - Optional bounding box inputs (min/max lat/lng) for geographic filtering
   - Import `useCampusBuildings` from `@/hooks/use-campus-buildings`

2. **Wire campus data fetching**
   - When campus mode is active and user submits search:
     - Construct `CampusBounds` from the bounding box inputs (or derive from district center with a default radius)
     - Call `useCampusBuildings({ bounds, sigunguCd, bjdongCd })`
   - Show loading state while fetching

3. **Render PortfolioDashboard**
   - Import `PortfolioDashboard` from `@/components/campus/portfolio-dashboard`
   - Transform `CampusData.buildings` (array of `CampusBuilding`) into `BuildingMetrics[]` for the dashboard
   - Each building needs: buildingId, name, useType, era, area, energyGrade, energyPerArea, co2PerArea
   - Compute energy metrics per building using existing `useEnergyMetrics` logic or simplified inline calculation

4. **Add comparison view**
   - Import `ComparisonView` from `@/components/campus/comparison-view`
   - Import `compareBuildings` from `@/lib/campus/comparison-engine`
   - Add building selection checkboxes (2-4 buildings) in the portfolio table
   - Add "Compare Selected" button that:
     - Calls `compareBuildings(selectedBuildingData)`
     - Renders `ComparisonView` with the `ComparisonResult`
   - Show comparison in a modal/overlay or below the portfolio dashboard

5. **Handle state management**
   - Campus mode state: local component state (useState) — not persisted
   - Selected buildings for comparison: local state array
   - Campus bounds: local state, reset when district changes

### Acceptance Criteria
- [ ] Search page has a "Campus Mode" toggle
- [ ] When active, campus-specific inputs appear (district + optional bbox)
- [ ] Submitting a campus search fetches buildings via `useCampusBuildings`
- [ ] `PortfolioDashboard` renders with aggregate metrics, grade distribution, worst/best performers
- [ ] Portfolio table is sortable and filterable by grade and use type
- [ ] Users can select 2-4 buildings and click "Compare"
- [ ] `ComparisonView` renders with bar charts, radar chart, and summary table
- [ ] Campus mode toggle off returns to normal single-building search
- [ ] `pnpm build` passes with zero type errors

### Risks & Mitigations
- **BuildingMetrics construction:** The `PortfolioDashboard` expects `BuildingMetrics` from `portfolio-aggregator.ts`. Need to verify the exact type shape and map from `BrTitleInfo` + computed energy. May need a lightweight adapter function.
- **Bounding box UX:** Most users will not know lat/lng coordinates. Default approach: when a district is selected, use a reasonable default bbox (e.g., 1km radius from district center). Make the bbox inputs optional/advanced.
- **Campus building cap:** The hook caps at 20 buildings. Document this limit in the UI.
- **New page vs inline:** Recommend starting inline in `page.tsx` to avoid route complexity. If it grows too large, extract to `src/app/campus/page.tsx` later.

---

## Task Flow (Execution Order)

```
I1 ─────────────────────────────────► (independent)
I2 ─────────────────────────────────► (independent, do before I4)
I3 ─────────────────────────────────► (independent)
I4 ─────── depends on I2 merge ────► (workspace-shell.tsx overlap)
I5 ─────────────────────────────────► (independent)
```

**Recommended parallel execution:**
- Wave 1: I1 + I3 + I5 (fully independent, no file overlap)
- Wave 2: I2 (modifies workspace-shell.tsx, properties-panel.tsx, building page)
- Wave 3: I4 (modifies workspace-shell.tsx report section + toolbar configs)

Alternative: I1 + I2 + I3 + I5 in parallel (I2 and I5 share `page.tsx` only if campus is inline — recommend keeping campus logic in a separate section/component to avoid conflicts). I4 after I2.

---

## Success Criteria

1. All 18 previously-unwired modules are imported and rendered in the UI
2. Each workflow stage has functional content (not stubs)
3. `pnpm build` passes with zero errors
4. No backend library files modified
5. No new npm dependencies added
6. Each task is independently testable via the browser

---

## File Impact Summary

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| I1 | 1 (search-results-table.tsx) | 0 |
| I2 | 3 (properties-panel.tsx, workspace-shell.tsx, building/[id]/page.tsx) | 0 |
| I3 | 1 (scene-outliner.tsx) | 0 |
| I4 | 3 (workspace-shell.tsx, toolbar-configs.ts, contextual-toolbar.tsx) | 0 |
| I5 | 1-2 (page.tsx, optionally campus/page.tsx) | 0-1 |
| **Total** | **8-9** | **0-1** |
