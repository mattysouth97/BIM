# Phase 7: Energy Calculation + ECO2 Export - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Live energy calculation engine that computes heat loss, annual energy demand, energy efficiency grade, and CO2 emissions from building parameters. Results displayed as floating metric cards on the 3D view. ECO2-compatible file export from material/energy properties, plus import of ECO2 results for grade overlay.

</domain>

<decisions>
## Implementation Decisions

### Energy Calculation Scope
- **D-01:** Simplified steady-state method — heat loss = U×A×ΔT per element, real-time as config changes
- **D-02:** Monthly degree-day method for annual energy demand (heating + cooling) using Korean climate data
- **D-03:** No hourly simulation — simplified is sufficient for GX team screening

### Metrics Calculated
- **D-04:** Heat loss per element: wall, roof, floor, window heat loss in W and W/m² (U×A×ΔT)
- **D-05:** Annual energy demand: kWh/m²·yr for heating and cooling using degree-day method
- **D-06:** Energy efficiency grade: Korean 건축물 에너지효율등급 (1+++ to 7) based on primary energy thresholds
- **D-07:** CO2 emissions: kg CO2/m²·yr from energy demand × Korean grid emission factor (0.4594 tCO2/MWh)

### Energy Dashboard UI
- **D-08:** Floating energy cards overlaid on 3D view (not in ConfigPanel tabs)
- **D-09:** Bottom-left cluster: 3-4 compact cards stacked vertically
- **D-10:** Cards show: Energy Grade badge, kWh/m²·yr, CO2 kg/m²·yr, total heat loss W
- **D-11:** Always visible when building is loaded, update live as config sliders change
- **D-12:** Cards should have semi-transparent backdrop like other overlay elements

### ECO2 Integration
- **D-13:** ECO2 input file generator from material properties (envelope U-values, HVAC, window SHGC/WWR)
- **D-14:** Import ECO2 results file for energy grade display
- **D-15:** ECO2 file format details are Claude's discretion — research the actual ECO2 input format

### Claude's Discretion
- Korean climate zone data (HDD/CDD values for Seoul as default, expandable)
- Energy grade threshold values (kWh/m²·yr boundaries for each grade)
- ECO2 file format specifics (XML structure, field mapping)
- Card styling, colors, and grade badge design
- Whether to add a "Calculate" button or compute automatically on every change

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/store/material-store.ts` — All envelope properties (U-values, SHGC, WWR, airtightness, HVAC)
- `src/store/recipe-store.ts` — Building geometry (footprint, floor count, floor height → area calculations)
- `src/lib/korean-building-codes.ts` — WALL_LAYERS, HVAC_DEFAULTS, structure codes
- `src/lib/material-inference.ts` — inferMaterialProperties for default values
- `src/components/viewer/viewer-overlay.tsx` — Existing overlay pattern for floating UI elements
- `src/lib/export.ts` — Existing export utilities

### Established Patterns
- Zustand stores for reactive state
- Bilingual (isKo) throughout UI
- Floating overlay components in building-scene.tsx
- Pure calculation functions in src/lib/ (no React dependencies)

### Integration Points
- Energy calculations read from material-store + recipe-store
- Floating cards rendered in building-scene.tsx alongside ViewerOverlay
- ECO2 export triggered from a button (in config panel or overlay)
- ECO2 import via file upload dialog (similar to ModelUploader pattern)

</code_context>

<specifics>
## Specific Ideas

- Seoul default climate: HDD ~2700, CDD ~600 (Korean standard)
- Energy grade thresholds (residential, approximate):
  - 1+++: <60 kWh/m²·yr, 1++: <90, 1+: <120, 1: <150
  - 2: <190, 3: <230, 4: <270, 5: <320, 6: <370, 7: >370
- Korean grid emission factor: 0.4594 tCO2/MWh (2023 value)
- ΔT for heat loss: use standard 20°C inside, -11.3°C winter design temp (Seoul)
- ECO2 is the official Korean tool — user's GX team uses it for energy evaluation

</specifics>

<deferred>
## Deferred Ideas

- Heat map overlay on 3D model showing thermal performance zones — future enhancement
- Climate zone selector for different Korean cities — future enhancement
- Detailed monthly energy profile charts — future enhancement
- Integration with actual ECO2 API (if available) — Phase 8 or beyond

</deferred>

---

*Phase: 07-energy-calculation-eco2-export*
*Context gathered: 2026-03-27 via discuss-phase*
