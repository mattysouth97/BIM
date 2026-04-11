# Requirements: Korea BIM Energy Management System

**Defined:** 2026-04-12
**Core Value:** Energy systems observability and control for building energy management — visualize utility sub-systems, energy distribution, and equipment specs on the 3D building model

## v5.0 Requirements

Requirements for Energy Systems Observability & Control milestone.

### MEP Sub-Layer System

- [ ] **MEP-01**: User can toggle 4 individual utility sub-layers (electrical, HVAC, lighting, plumbing/DHW) independently in the layer panel
- [ ] **MEP-02**: Toggling a sub-layer shows/hides only that utility system's 3D objects while other sub-layers remain visible

### Energy Analytics

- [ ] **EA-01**: Energy calculation engine produces per-floor kWh/m² estimates (not just building total)
- [ ] **EA-02**: Energy breakdown dashboard displays system-level distribution (HVAC, lighting, plug loads, DHW) as a chart with percentage attribution
- [ ] **EA-03**: Energy consumption heatmap color-codes building floors by kWh/m² intensity on the 3D geometry (green-to-red gradient)

### Equipment Interaction

- [ ] **EQ-01**: User can click on MEP sub-layer objects to see an equipment info panel with inferred specs (type, capacity, efficiency grade, approximate age)
- [ ] **EQ-02**: Equipment data is inferred from building recipe + ledger data and clearly labeled as "estimated" (not metered)

### Standards & Export

- [ ] **STD-01**: Equipment info panels display Korean energy label grades (1~5등급) using Korean standards (KS B 6364 for HVAC, KSC IEC 62301 for electrical)
- [ ] **STD-02**: ECO2 export includes sub-system data fields (HVAC type, lighting density, DHW system) extending the existing envelope-only export

## v5.x Requirements

Deferred to next minor release. Tracked but not in current roadmap.

### Equipment Control

- **CTRL-01**: User can toggle equipment sub-systems on/off and see energy impact update in real-time
- **CTRL-02**: User can adjust HVAC setpoints and see energy delta before committing
- **CTRL-03**: Scenario store isolates equipment hypotheses from committed state

### Advanced Analytics

- **ADV-01**: Sub-system heatmap filter shows HVAC-only or lighting-only floor views
- **ADV-02**: What-if comparison view: baseline vs modified equipment state side by side

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time IoT sensor data feed | GX team audits buildings they don't operate — no IoT access |
| Full equipment scheduling editor | Requires 8760-hour simulation engine, not degree-day approximation |
| Multi-building portfolio comparison | Different product surface (list/grid UI), not single-building viewer |
| Photorealistic equipment 3D models | Structural clarity over photorealism per PROJECT.md principle |
| Per-equipment metered consumption from utility bills | Utility bill formats vary by Korean provider; GX team lacks sub-metering access |
| All 15 sub-layer toggles individually | Telecom, media, waste, microgrid, safety are low-priority for energy audits |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MEP-01 | — | Pending |
| MEP-02 | — | Pending |
| EA-01 | — | Pending |
| EA-02 | — | Pending |
| EA-03 | — | Pending |
| EQ-01 | — | Pending |
| EQ-02 | — | Pending |
| STD-01 | — | Pending |
| STD-02 | — | Pending |

**Coverage:**
- v5.0 requirements: 9 total
- Mapped to phases: 0
- Unmapped: 9 (awaiting roadmap)

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after v5.0 milestone definition*
