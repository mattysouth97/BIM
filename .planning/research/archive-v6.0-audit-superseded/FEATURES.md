# Feature Research

**Domain:** Energy Systems Observability & Control — BIM viewer with utility sub-layers, energy heatmap, equipment panels, and what-if scenario analysis
**Researched:** 2026-04-12
**Confidence:** HIGH (grounded in existing codebase layer system, energy hooks, store shapes) / MEDIUM (BEMS industry patterns from web research)

---

## Context: What This Research Covers

This is v5.0 feature research. The following are already built and NOT re-researched:

- 5-layer system (envelope, structure, mep, energy-zones, retrofit-targets) with `LayerId` union type, `layer-store.ts`, and `LayerManager`
- Energy calculation engine (`heat-loss.ts`, `annual-demand.ts`, `co2-emissions.ts`, `energy-grade.ts`, `climate-data.ts`)
- Material property panel with slider delta annotations (`use-energy-delta.ts`)
- Live kWh/m² status bar
- Energy cards (grade, demand, CO2, heat loss) with actual vs modeled comparison
- Building ledger integration and actual consumption fetch (`use-actual-energy.ts`)

The six new capabilities to scope for v5.0:

1. Individual utility sub-layers replacing the single MEP layer
2. Energy consumption heatmap on 3D building geometry
3. Equipment info panels (specs, usage, efficiency ratings)
4. Basic equipment control (toggle on/off, HVAC setpoints, see energy impact)
5. Energy breakdown dashboard by system type
6. What-if scenario analysis

**Critical codebase constraint discovered:** The `LayerId` type is a string union (`"envelope" | "structure" | "mep" | "energy-zones" | "retrofit-targets"`). The `layer-store.ts` uses `Record<LayerId, boolean>` for visibility. Expanding MEP into sub-layers requires extending this union type, the store, and the `LayerManager`. However, 15 individual sub-layer generator files already exist (`layer-3-cooling.ts` through `layer-14-microgrid.ts`) but are all collapsed under `"mep"` in `COMPONENT_TO_LAYER`. The generator infrastructure is partially done — the store/type layer is the gap.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a GX energy auditor assumes exist in any energy observability tool. Missing these = the tool feels like a generic 3D viewer, not an energy audit platform.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **MEP sub-layer toggles** (electrical, HVAC, lighting, plumbing) | Every professional BEMS tool (Facilio, EnergyCAP, CIM) segments utility systems. An auditor needs to isolate "lighting only" or "HVAC only" to understand system-level consumption. A single undifferentiated MEP toggle hides this. | MEDIUM | 15 sub-layer generator files already exist. The gap is `LayerId` union extension + `layer-store.ts` `Record<LayerId, ...>` upgrade. Must preserve backward compat with existing `"mep"` references or rename to `"mep-all"` group. Core architecture change — must be first in the milestone. |
| **Energy consumption heatmap** | Industry standard for energy audits: color-encode floors or zones by consumption intensity (kWh/m²). Seen in every serious BEMS dashboard. Without spatial context, energy numbers are abstract. Auditors use heatmaps to immediately see "which floor is the problem." | HIGH | The `energy-zones` layer exists but currently shows uniform zone fills, not consumption-weighted color. Requires per-zone kWh/m² data mapped to a gradient (e.g., green → red). The `calculateAnnualDemand()` currently returns building-total, not per-zone — need per-floor/per-zone breakdown. Fragment shader or vertex color approach on the envelope mesh. |
| **System-level energy breakdown** | GX auditors always ask "what percentage of energy is HVAC vs lighting vs plug loads?" before recommending retrofits. Without a breakdown chart, the kWh/m² number is unactionable. Standard in EnergyCAP, Wattsense, Facilio dashboards. | MEDIUM | The existing `calculateAnnualDemand()` returns `heatingDemand` + `coolingDemand` but does not break out lighting, plug loads, DHW, or elevators. Requires extending the energy model with system-category attribution. Can start with estimated splits (ASHRAE standard ratios by building type) before real sub-metering data exists. |
| **Equipment info panel on click/hover** | Clicking on an HVAC unit, electrical panel, or lighting circuit and getting a popup with specs (capacity, efficiency rating, age, energy use) is the baseline interaction for any equipment-aware tool. Users expect "click the thing, see its data." | MEDIUM | Requires a raycasting hit-test on MEP sub-layer objects, plus a data model for equipment properties (`EquipmentSpec`: type, capacity, efficiency, installYear, annualKwh). The `structural-tooltip.tsx` already implements raycasting + hover popup — the pattern exists. New: equipment data source (inferred from building recipe + ledger data, not user-entered). |
| **Loading state / progressive reveal** | When the layer or heatmap data is computing, users need to see progress, not a stale or blank state. Standard expectation from any data-heavy dashboard. | LOW | Existing skeleton/loading patterns from energy-cards.tsx. Heatmap computation may take 100-500ms on large buildings — show a "computing..." indicator on the zone layer. |

### Differentiators (Competitive Advantage)

Features specific to the Korean GX energy audit use case that commercial BEMS tools do not offer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Live what-if scenario analysis** | Toggle a sub-system off, adjust an HVAC setpoint, and see the energy impact update in real time on the heatmap and breakdown dashboard — without committing the change. This "shadow simulation" mode is what makes the tool useful for retrofit planning, not just monitoring. Commercial BEMS tools (Facilio, EnergyCAP) show historical data; they do not let you simulate "what if I replaced these fan coil units?" | HIGH | Builds on existing `use-energy-metrics.ts` + material store override pattern. The delta annotation system (already built for sliders) is the foundation. Key new piece: scenario state store (separate from committed material-store) that holds equipment override hypotheses and feeds the energy engine without modifying persistent state. |
| **Equipment control linked to energy impact** | Toggling a sub-system or changing a setpoint immediately updates the kWh/m² projection in the status bar and energy cards. The causal chain (control → energy model → display) is explicit and visual. No other tool in the GX team's workflow connects equipment state to energy calculation. | HIGH | The energy calculation engine is already reactive to material-store changes. The same pattern extends to equipment state: `useEquipmentStore` → `calculateAnnualDemand()` with equipment overrides → existing display hooks. The key challenge is modeling "HVAC off" in `annual-demand.ts` (currently assumes all systems operational). |
| **Korean building code attribution** | Equipment efficiency ratings displayed using Korean standards (KS B 6364 for HVAC, KSC IEC 62301 for electrical) and Korean energy label grades (1~5등급). Auditors are familiar with Korean certification labels, not SEER/EER. No commercial BEMS tool does this for Korean buildings. | LOW | The existing `energy-grade.ts` already implements Korean 1+++~7 grade system. Extend to per-equipment grades. Data inferred from `structureType` + `approvalDate` in building ledger — same inference pattern as PBR material selection. |
| **Sub-system heatmap by floor** | The heatmap is not just "hot building / cold building" — it shows per-floor energy intensity broken down by sub-system. The HVAC layer heatmap shows which floors have the most HVAC load; the lighting layer shows lighting density. This is not available in any standard web-based BIM tool. | HIGH | Requires per-floor, per-system energy estimates. Can be synthesized from building geometry (floor height, area, occupancy type) + system type ratios. Not actual sub-metered data — modeled estimates clearly labeled as such. The `energy-zones` layer already color-codes floors; extend to accept a system filter. |
| **ECO2 export with sub-system breakdown** | When the GX team finalizes an audit, they export to ECO2 (Korea's official energy evaluation software). Currently the export (`eco2-export.ts`) sends envelope data only. Adding sub-system data (HVAC type, lighting density, DHW system) makes the ECO2 input file more complete, reducing manual re-entry. | MEDIUM | `generateECO2Input()` in `eco2-export.ts` already handles envelope. Extend the ECO2 schema to include `systemData` fields. Complexity: Korean ECO2 input format for system data (KS F 1900 standard) needs verification — flag for phase research. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time IoT sensor data feed** | "Real buildings have sensors — show actual sensor readings on the 3D model." Sounds like the natural evolution of the heatmap. | IoT integration (MQTT, BACnet, Modbus, REST polling) requires live infrastructure, authentication per building, and radically different data freshness assumptions. The GX team audits buildings they do not operate — they have no IoT access. Adding real-time feeds addresses a use case (facility management) that is not the GX team's job. | Show modeled energy estimates (already computed by the engine) clearly labeled as "modeled." Display actual consumption from `use-actual-energy.ts` (annual totals from data.go.kr) when available. Do not build a real-time data pipeline. |
| **Full equipment scheduling editor** | "Let users set HVAC schedules (7am-10pm weekdays), see annual impact." Scheduling is the next logical step after setpoint control. | Equipment scheduling requires modeling 8760-hour simulation (hourly granularity for a full year). The existing `calculateAnnualDemand()` uses HDD/CDD degree-day approximation, not hourly simulation. Replacing the engine to support schedules is a separate milestone. Partial schedule support (e.g., only weekday/weekend split) would be misleading — the model accuracy does not support it. | Simple on/off toggle per sub-system + setpoint adjustment. Model the energy difference using degree-day scaling. Flag full scheduling as a future ECO2-integration milestone. |
| **Multi-building portfolio comparison** | "Compare this building's heatmap against 10 others in the portfolio." Portfolio view is the natural scale-up after per-building analysis. | Portfolio comparison requires a building database, cross-building normalization (different floor areas, use types, climates), and a fundamentally different UI paradigm (list/grid vs single 3D viewer). This is a separate product surface, not a feature of the single-building viewer. | The `benchmark-comparison.ts` and `benchmark-database.ts` already compare against building type benchmarks. Surface this in the energy breakdown dashboard (e.g., "your HVAC use is 23% above benchmark for RC office buildings"). Defer portfolio UI to a future milestone. |
| **Photorealistic equipment 3D models** | "Show a realistic AHU or VRF unit in the 3D scene." Looks impressive and helps non-technical stakeholders. | Photorealistic equipment meshes (LOD2/LOD3) require asset libraries (GLTF files for each equipment type) or procedural modeling of HVAC units. These assets do not exist and are not in the current stack. Rendering them correctly requires shadow casting, collision, and placement logic. This is a 3D content production problem, not a code problem. | Stylized InstancedMesh representations (simple box/cylinder primitives in system colors) following the existing procedural building pattern. The structural clarity over photorealism principle from PROJECT.md applies here. |
| **Per-equipment metered consumption from utility bills** | "Parse electricity bills and show per-circuit consumption on the 3D model." Utility bill parsing gives real data not model estimates. | Utility bill formats (PDF/CSV) vary by Korean utility provider (KEPCO, various district heating operators). Parsing is brittle. The `consumption-normalizer.ts` already handles the data.go.kr energy API which provides building-level actuals — further sub-metering from bills requires on-site data collection that the GX team does not have for audit buildings. | Use the existing `use-actual-energy.ts` total for reality-grounding. Use modeled sub-system breakdown (clearly labeled as estimated). Add a "flag for sub-metering" annotation if a zone's modeled consumption deviates significantly from actual. |

---

## Feature Dependencies

```
[MEP sub-layer type extension]
    └──required by──> [Individual utility sub-layer toggles]
    └──required by──> [Equipment info panel] (needs sub-layer raycasting scope)
    └──required by──> [Sub-system heatmap by floor] (needs system-specific energy attribution)
    └──required by──> [Equipment control] (controls target specific sub-layers)
    └──ALREADY PARTIALLY BUILT──> 15 generator files in src/lib/layers/

[Per-floor / per-system energy model]
    └──required by──> [Energy consumption heatmap]
    └──required by──> [Energy breakdown dashboard]
    └──required by──> [Sub-system heatmap by floor]
    └──depends on──>  [calculateAnnualDemand()] (ALREADY BUILT — needs per-zone extension)

[Scenario / equipment state store]
    └──required by──> [What-if scenario analysis]
    └──required by──> [Equipment control → energy impact]
    └──depends on──>  [material-store override pattern] (ALREADY BUILT — same architecture)
    └──depends on──>  [MEP sub-layer type extension]

[Equipment data model]
    └──required by──> [Equipment info panel]
    └──required by──> [Equipment control]
    └──required by──> [Korean building code attribution]
    └──depends on──>  [BuildingRecipe + building ledger data] (ALREADY IN STACK)

[Energy breakdown data]
    └──required by──> [Energy breakdown dashboard]
    └──required by──> [ECO2 export with sub-system data]
    └──depends on──>  [Per-floor / per-system energy model]

[Raycasting on MEP sub-layer meshes]
    └──required by──> [Equipment info panel]
    └──PATTERN EXISTS──> structural-tooltip.tsx (Raycaster + hover popup)
```

### Dependency Notes

- **MEP sub-layer type extension is the foundation.** Every other v5.0 feature either directly requires or is enhanced by having distinct sub-layer ids. This must ship first. The 15 individual generator files are already written — the architectural debt is the `LayerId` union and the store `Record<LayerId, ...>` shape.
- **Per-zone energy model is the second dependency.** The heatmap and breakdown dashboard both need floor/zone-level energy estimates, which `calculateAnnualDemand()` does not currently produce. This is a pure engine extension — no UI needed before it's usable by other features.
- **Scenario store can reuse the material-store override pattern exactly.** The delta annotation system (slider → delta display) proves the reactive architecture works. The scenario store is the same pattern applied to equipment state instead of material properties.
- **Equipment info panel and control are independent of the heatmap** — they share the scenario store but do not depend on zone coloring being complete.
- **What-if analysis is the capstone feature** — it integrates sub-layers, equipment control, and the energy engine into a coherent user flow.

---

## MVP Definition

### Launch With (v5.0 core)

Minimum viable energy observability that delivers actionable insight to the GX team.

- [ ] **MEP sub-layer toggles (electrical, HVAC, lighting, plumbing/DHW)** — The single MEP toggle is the most-cited limitation. Splitting into 4 primary sub-layers (not all 15) is the 80/20: electrical distribution, HVAC (cooling + heating + ventilation grouped), lighting, and DHW/plumbing. The existing generator files cover these. Essential for scoping any equipment-level analysis.
- [ ] **Energy breakdown dashboard (bar/donut by system type)** — Even with modeled estimates and ASHRAE-derived system ratios, a breakdown chart answers "what should we retrofit first?" immediately. No new data source needed — extend `calculateAnnualDemand()` with system attribution using building type ratios. The breakdown feeds the heatmap and the scenario analysis.
- [ ] **Energy consumption heatmap (per-floor, building-total)** — Color-coded floors by kWh/m² intensity using the existing `energy-zones` layer as the rendering surface. Start with building-total (not per-system) heatmap. The existing floor zone geometry is the canvas; only the color mapping logic is new.
- [ ] **Equipment info panel (click → specs popup)** — Click on an HVAC zone or electrical zone and see inferred specs (type, efficiency grade, approximate age from ledger permit date). Uses the structural-tooltip raycasting pattern. Equipment data is inferred, not user-entered — clearly labeled as estimated.

### Add After Validation (v5.x)

- [ ] **Basic equipment control (on/off toggle + HVAC setpoint)** — Add once info panels are validated. The scenario store architecture is a prerequisite. Trigger: GX team asks "what happens if we shut down this AHU?"
- [ ] **What-if scenario analysis (compare baseline vs modified)** — Add when equipment control is stable. Requires scenario store + energy engine integration. Trigger: GX team uses equipment toggles and asks to save/compare scenarios.
- [ ] **Sub-system heatmap filter** (show HVAC heatmap vs lighting heatmap) — Add after baseline heatmap is validated. Trigger: GX team needs to compare system-specific floor loads.
- [ ] **ECO2 export with sub-system breakdown** — Add when system data model is stable. Flag for research: verify Korean ECO2 input schema for system data fields (KS F 1900).

### Future Consideration (v5.x+)

- [ ] **All 15 sub-layer toggles individually** — Telecom, media, waste, microgrid, safety are low-priority for energy audits. Expose only after the 4 primary sub-systems are validated.
- [ ] **Per-equipment setpoint scheduler** — Requires 8760-hour simulation engine. Defer until ECO2 integration milestone.
- [ ] **Portfolio comparison across buildings** — Separate product surface. Defer to Digital Twin platform milestone.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MEP sub-layer toggles (4 primary) | HIGH | MEDIUM | P1 |
| Energy breakdown dashboard | HIGH | MEDIUM | P1 |
| Per-floor energy heatmap | HIGH | HIGH | P1 |
| Equipment info panel (inferred specs) | HIGH | MEDIUM | P1 |
| Equipment on/off toggle + energy impact | HIGH | HIGH | P2 |
| HVAC setpoint control + energy delta | HIGH | HIGH | P2 |
| What-if scenario store + compare view | HIGH | HIGH | P2 |
| Sub-system heatmap filter | MEDIUM | MEDIUM | P2 |
| Korean building code grade attribution | MEDIUM | LOW | P2 |
| ECO2 export sub-system data | MEDIUM | MEDIUM | P3 |
| All 15 sub-layer toggles | LOW | LOW | P3 |
| Equipment scheduling | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v5.0 — core "energy observability" thesis
- P2: Should have, add once P1 features are validated
- P3: Future milestone or blocked on external schema verification

---

## Existing Codebase Integration Points

| Feature | Existing Asset | Gap |
|---------|---------------|-----|
| MEP sub-layer toggles | 15 generator files in `src/lib/layers/`, `LayerManager`, `layer-store.ts` | `LayerId` union must be extended; `layer-store.ts` `Record<LayerId, ...>` must widen; `LayerPanel` UI needs sub-layer rows |
| Energy heatmap | `energy-zones` layer in `LayerManager`, `calculateAnnualDemand()` | Per-floor demand breakdown not yet produced; color mapping from kWh/m² to gradient not implemented |
| Equipment info panel | `structural-tooltip.tsx` raycasting pattern | Equipment data model (`EquipmentSpec`) not defined; raycasting must scope to MEP sub-layer objects only |
| Breakdown dashboard | `energy-cards.tsx`, `calculateAnnualDemand()` (heating + cooling already split) | System category attribution (lighting, DHW, plug loads) not in energy model; chart component not built |
| Equipment control | `material-store.ts` override pattern, `use-energy-delta.ts` | `useEquipmentStore` not built; `calculateAnnualDemand()` does not accept equipment-off flags |
| What-if scenarios | `useEnergyMetrics` reactive pipeline | Scenario isolation store (hypotheses vs committed state) not built |

---

## Phase Ordering Rationale

The feature dependency graph implies this phase order for v5.0:

1. **MEP sub-layer type extension + store** — Architectural foundation. Blocks every other feature. Low UI risk; pure type/store/LayerManager work.
2. **Per-floor/per-system energy model extension** — Engine work with no UI. Unblocks heatmap and breakdown simultaneously.
3. **Energy breakdown dashboard** — First visible deliverable. Uses extended energy model. Validates the system attribution approach with GX team before building control features.
4. **Energy consumption heatmap** — Second visible deliverable. Uses per-floor energy model on existing zone geometry.
5. **Equipment info panel** — Raycasting on MEP meshes + inferred spec display. Validates the equipment data model before control is added.
6. **Equipment control + scenario store** — Adds mutation on top of the validated info panel. The scenario store is the capstone architectural piece.
7. **What-if comparison view** — Integrates everything. Deferred to v5.x if time is limited.

---

## BEMS Industry Reference

What commercial tools show in their energy dashboards (verified against Facilio, EnergyCAP, Wattsense, CIM.io descriptions — MEDIUM confidence):

| Capability | Commercial BEMS Standard | Our Approach |
|------------|--------------------------|-------------|
| System-level energy breakdown | Bar chart or pie chart by HVAC/lighting/plug loads — standard in all BEMS dashboards | Extend `calculateAnnualDemand()` with system attribution; display in new breakdown card |
| Spatial energy visualization | Floor plan heatmap (2D) is industry standard; 3D heatmap is rare and more compelling | 3D heatmap on existing building geometry — differentiator vs any commercial tool |
| Equipment control | Real-time BACnet/Modbus control — requires facility operator role | Simulated "what-if" control — appropriate for auditor role without facility access |
| Historical trending | Time-series charts of consumption — standard | Existing `use-actual-energy.ts` provides 3 years of monthly actuals; surface in breakdown dashboard |
| Alerts/anomaly detection | Threshold alerts — requires persistent monitoring | Not in scope for v5.0; flag for Digital Twin platform milestone |

---

## Sources

- Existing codebase: `src/lib/layers/types.ts` (5-layer `LayerId` union), `src/store/layer-store.ts` (`Record<LayerId, boolean>` shape), `src/lib/layers/layer-manager.ts` (`COMPONENT_TO_LAYER` mapping) — HIGH confidence
- Existing codebase: `src/lib/energy/` (14 files — heat-loss, annual-demand, co2, grade, climate, calibration, benchmark) — HIGH confidence
- Existing codebase: `src/hooks/use-energy-metrics.ts`, `src/hooks/use-actual-energy.ts`, `src/components/viewer/energy-cards.tsx` — HIGH confidence
- Existing codebase: `src/components/viewer/structural-tooltip.tsx` (raycasting pattern) — HIGH confidence (verified via ls)
- [Facilio BEMS overview](https://facilio.com/learn/building-energy-management-system/) — MEDIUM confidence (marketing page, not technical spec)
- [EnergyCAP building energy monitoring guide](https://www.energycap.com/blog/building-energy-monitoring/) — MEDIUM confidence
- [Wattsense BEMS guide](https://www.wattsense.com/blog/building-management/bems/) — MEDIUM confidence
- [CIM.io BEMS overview](https://www.cim.io/blog/building-energy-management-systems-bems) — MEDIUM confidence
- PROJECT.md: "structural clarity over photorealism" principle, v5.0 milestone target features — HIGH confidence

---

*Feature research for: Korean BIM Energy Management System — v5.0 Energy Systems Observability & Control*
*Researched: 2026-04-12*
