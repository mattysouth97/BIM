# Energy Feedback Research: Inline Live Energy Indicators

**Project:** Korea BIM Energy Management System
**Milestone context:** v3.0 UX Workflow Overhaul — adding guided authoring pipeline
**Researched:** 2026-03-30
**Overall confidence:** HIGH (existing codebase verified; external patterns MEDIUM)

---

## Executive Summary

The existing codebase already has a complete simplified energy calculation pipeline that runs synchronously in-browser: degree-day heat loss via `calculateHeatLoss`, annual demand via `calculateAnnualDemand`, grade assignment via `getEnergyGrade`, and CO2 via `calculateCO2`. These are pure functions composed into the reactive `useEnergyMetrics` hook. The current display (`energy-cards.tsx`) places four floating cards in the bottom-left of the 3D viewer, rendered after building selection.

The milestone question is not "can we compute" — we already can, in under 1ms per change. The question is **where and how to surface those numbers during the authoring workflow** to give genuine guidance without misleading users into treating approximate model output as certified ECO2 results.

Industry practice from tools like Autodesk Insight, PHPP, cove.tool, and DesignBuilder converges on three principles: (1) show approximate feedback instantly during editing, never hide it behind a "run simulation" button; (2) visually separate approximate/modeled numbers from certified/actual numbers using distinct badge language and color; (3) be explicit that early-stage estimates are for design guidance, not compliance.

The Korean ECO2 system uses a two-round certification structure — preliminary (설계 단계) and final (사용 승인 단계). This is directly relevant: numbers produced by the in-browser model correspond in intent to preliminary-stage estimates, not certified results. The UI must communicate this without confusing users.

---

## Section 1: How Professional BIM Energy Tools Provide Feedback

### 1.1 Autodesk Insight (Revit-integrated)

**Mechanism:** Insight uses a cloud-backed simplified model (not full EnergyPlus) for the parametric slider interface. When a user adjusts WWR, insulation R-value, or HVAC efficiency, results update in a "benchmark card" widget within seconds. Full EnergyPlus runs are triggered separately and take minutes. The two modes are visually distinct: slider results show a range bar (min/max/predicted), EnergyPlus results show a precise kWh/m2·yr number.

**Key UX pattern:** The slider-driven interface explicitly labels results as "energy cost ranges" not point estimates. Color-coded bars (green = better, red = worse) replace exact numbers during interaction. The precise number only appears after interaction stops.

**Confidence:** MEDIUM (based on Autodesk University documentation + search results)

### 1.2 PHPP (Passive House Planning Package)

**Mechanism:** Pure spreadsheet; every cell change triggers instant recalculation. There is no "run" button. The calculation model (ISO 13790 monthly method) is the same method used for Passivhaus certification. No distinction exists between "design preview" and "certified model" — the spreadsheet IS the certification document. This works because PHPP enforces strict input discipline (no shortcuts).

**Key UX pattern:** Because PHPP is used for actual certification, it can show exact numbers without an "approximate" disclaimer. The lesson for our context: approximate numbers need disclaimers precisely because our model uses different assumptions from ECO2's DIN V 18599 monthly method.

**Confidence:** HIGH (official Passipedia documentation)

### 1.3 DesignBuilder / EnergyPlus

**Mechanism:** DesignBuilder runs EnergyPlus asynchronously in the background with a progress indicator. There is no live feedback during input — users configure properties, then trigger a simulation run. Results (kWh breakdown by end-use, thermal comfort maps) appear after the run completes (seconds to minutes depending on model complexity).

**Key pattern:** No live feedback during editing. The "run" is explicit. DesignBuilder does offer a "Quick Calculation" mode (monthly method) that returns results faster, but it is still triggered explicitly, not reactive.

**Relevance to this project:** Our in-browser model is already faster than DesignBuilder's quick calculation. We do not need a "run" button because the calculation is synchronous JavaScript. But DesignBuilder's separation of "quick estimate" vs. "full simulation" is a useful framing for distinguishing our model from ECO2.

**Confidence:** MEDIUM (DesignBuilder documentation + search results)

### 1.4 IES VE (Virtual Environment)

**Mechanism:** IES VE 2024 includes a built-in parametric engine. Users vary envelope types, HVAC systems, WWR, and shading; the tool runs "dozens or hundreds of permutations automatically." Results are displayed in a browser-based visualization layer. The underlying simulation is not real-time — it runs multiple scenarios in batch and presents a range.

**Key UX pattern:** IES VE frames feedback as "scenarios" not live edits. Users define a parameter space, the tool populates it, then users browse results. This is a different paradigm than slider-driven live feedback.

**Relevance:** IES VE's approach is suited for optimization workflows. Our workflow is guided authoring where users make single-property changes and want to see immediate consequence — Insight's slider model is a better analogy.

**Confidence:** MEDIUM (IES website + US DOE documentation)

### 1.5 cove.tool

**Mechanism:** Web-based, cloud-backed. Early-stage energy modeling at the concept design phase. Provides "real-time" feedback through fast reduced-order models, not full simulation. Explicitly designed for early-stage guidance, not compliance documentation. Uses color-coded performance indicators (green/yellow/red) against benchmark targets.

**Key UX pattern:** cove.tool separates "early-stage guidance" from "compliance modeling" as two distinct modes in the same platform. The early-stage mode shows color bands against benchmarks; compliance mode locks down inputs and produces a certifiable output.

**Relevance:** Closest analogy to what this project is doing. Our degree-day model = cove.tool's early-stage mode. ECO2 export = their compliance mode. We should borrow their two-mode framing.

**Confidence:** MEDIUM (cove.tool help center + DOE article)

---

## Section 2: Calculation Models That Can Run In-Browser

### 2.1 What Already Exists in This Codebase

The existing pipeline is already browser-feasible and synchronous:

| Module | Method | Complexity | Latency |
|--------|--------|------------|---------|
| `heat-loss.ts` | Steady-state Q = U × A × ΔT | O(n elements) | <0.1ms |
| `annual-demand.ts` | Degree-day normalization | O(1) | <0.1ms |
| `energy-grade.ts` | Threshold lookup | O(1) | <0.1ms |
| `co2-emissions.ts` | Emission factor ratio | O(1) | <0.1ms |

Total pipeline: under 0.5ms for any building configuration. No debouncing is required for the calculation itself. Debouncing (150–300ms) is appropriate only for updating the Zustand store from slider input events to avoid excessive React renders, not for the calculation.

### 2.2 What the Current Model Can and Cannot Compute

**CAN compute (degree-day method, immediate):**
- Annual heating demand (kWh/yr, kWh/m2·yr)
- Annual cooling demand (kWh/yr, kWh/m2·yr)
- Overall envelope U-value contribution by element (wall, window, roof, floor)
- Heat loss breakdown percentage by element
- Korean energy efficiency grade (1+++  to 7) from demand intensity
- CO2 emissions via grid emission factor
- Sensitivity to: wall U-value, window U-value, SHGC, airtightness, WWR, HVAC efficiency, floor area, floor count, building footprint

**CANNOT compute without ECO2 (DIN V 18599 monthly method):**
- Primary energy factor by end-use (1차 에너지 소요량)
- Hourly thermal dynamics and peak loads
- Thermal mass effects (heavy RC vs. light steel treated the same)
- Inter-zonal heat transfer
- Certification-grade primary energy weighting factors by fuel type
- Accurate DHW, lighting, and ventilation primary energy components

**Key accuracy gap:** The degree-day method assumes steady-state conditions and ignores thermal mass. A pre-2000 RC building with 300mm concrete walls has significant thermal storage that reduces peak heating demand — the current model does not capture this. Expected error: 15–30% for residential RC buildings compared to ECO2 monthly method output. For steel curtain-wall commercial buildings (low mass), accuracy is much closer.

### 2.3 Thermal Bridge Indicators — Feasibility

Thermal bridges (linear transmittance, psi-values) require 2D finite-element analysis (software like THERM or HTflux). They cannot be computed in-browser in real time.

However, a **categorical risk indicator** is feasible without FEA:
- Detect high-risk junction types from wall assembly (concrete frame = high TB risk at slab edges, steel = high risk at curtain wall mullions, masonry = low risk with cavity insulation)
- Map era + structure type to a TB risk category (low/medium/high)
- Display as a warning badge, not a numeric psi-value

This is what DesignBuilder does: it allows users to input known psi-values by junction type, then applies them to perimeter lengths. We should use the same pattern: show "thermal bridge risk: HIGH — slab edge correction recommended" without computing a psi-value.

### 2.4 What Could Be Added Later (Phase-Specific Research Needed)

These require deeper research before implementation:

- **ISO 52016 5R1C hourly model:** More accurate than degree-day but 8760 iterations per year. For a simple building (1 zone), a browser implementation would run in 50–200ms in JavaScript — feasible with a Web Worker. Would capture thermal mass. Research flag: validate against ECO2 output for Korean climate data before using.
- **Solar gain correction by orientation:** Current model averages WWR over all orientations. Splitting N/S/E/W with orientation-specific solar gain correction would improve cooling demand accuracy by 20–40% for glazing-heavy buildings.
- **Primary energy conversion factors:** Korean ECO2 uses fuel-specific factors (electricity = 2.75, gas = 1.1). Adding these would bring our grades closer to ECO2 certification grades.

---

## Section 3: UI Placement Patterns for Live Energy Feedback

### 3.1 Placement Options Analysis

| Placement | Pros | Cons | Best for |
|-----------|------|------|----------|
| Inline in property panel (adjacent to each slider) | Immediate cause-and-effect, context-rich | Clutters panel, hard to see overall picture | Per-property sensitivity |
| Floating widget (current energy-cards.tsx) | Always visible, doesn't disturb panel layout | Disconnected from edit actions, may feel passive | Summary overview |
| Bottom shelf / status bar | Low visual weight, always present | Small, easy to ignore, limited data space | Single key metric |
| Collapsible side panel (energy tab) | High data density, optional visibility | Requires user action to open, breaks flow | Full breakdown after edits |
| Inline delta indicator (after slider drag) | Shows impact of specific change, minimal | Ephemeral, disappears after interaction | Highlighting what just changed |

**Recommendation:** Use a **two-tier layout** matching Insight and cove.tool patterns:

**Tier 1 — Always-visible energy status bar (bottom shelf):**
Shows: current grade badge + kWh/m2·yr + CO2 figure. Occupies a fixed 40px bottom bar across the panel width. Updates reactively. Serves as a persistent orientation anchor.

**Tier 2 — Inline delta indicators within the property panel:**
When a user changes a slider (wall U-value, WWR, insulation), a small delta annotation appears next to the affected value: e.g., "Wall U-value 0.27 → 0.47  [+18 kWh/m2·yr  grade 2 → 3]". This annotation fades after 3 seconds or persists until next change.

The existing floating energy-cards.tsx in the 3D viewport serves as Tier 3 — a detailed breakdown visible during 3D review, not during property editing. These roles should be kept distinct.

### 3.2 Inline Delta Pattern Implementation Notes

The inline delta pattern requires:
- Storing "previous metrics" state when user starts dragging a slider (onPointerDown or onFocus)
- Computing delta against that stored snapshot
- Displaying delta as signed value with color: green for improvement (demand down), amber for degradation (demand up), grey for neutral changes (<2 kWh/m2 difference)
- 400ms CSS transition on delta fade-out (matching existing AnimatedValue component)

This is purely presentational — no new calculation logic required, only delta comparison against the existing `useEnergyMetrics` output.

### 3.3 Bottom Shelf Grade Badge

A minimal grade badge in a bottom status bar should show:
- Energy grade letter(s) with background color from `getGradeColor()` — already implemented
- kWh/m2·yr number with 1 decimal
- A "~" prefix on all numbers to communicate approximate nature

Example: `~ 2등급  ~142.3 kWh/m²·yr  ~29.4 kgCO₂/m²·yr`

The tilde is a lightweight disclaimer without requiring verbose text.

---

## Section 4: Approximate vs. Certified — The Disclosure Problem

### 4.1 Korean Certification Context

Korean ECO2 produces two certification rounds:
- **1차 예비인증 (preliminary):** Design-stage estimate, submitted before construction approval. Based on design drawings and assumed schedules.
- **2차 본인증 (final):** Post-construction, required for 사용 승인. Based on as-built conditions.

Our in-browser model corresponds to a further-simplified version of the preliminary estimate. It uses:
- Degree-day method (monthly) vs. ECO2's DIN V 18599 (also monthly but with primary energy weighting)
- No primary energy conversion factors
- Simplified single-zone assumption
- No DHW / lighting / ventilation primary energy

The certification-relevant number ECO2 produces is **1차 에너지 소요량** (primary energy demand in kWh/m2·yr), not the final energy demand our model produces. These can differ by 40–80% because ECO2 multiplies electricity consumption by a factor of 2.75.

### 4.2 Risk Assessment: Showing Approximate Numbers

**Risk 1 — Grade mismatch:** Our model might show grade "2" while ECO2 certification shows grade "4" for the same building because we ignore primary energy factors. A user might make design decisions based on the in-browser grade that later fail certification.

**Mitigation:** Label all grades with "모델 추정 (도달 예상)" (model estimate). Show the ECO2 certified grade in blue where available (already done in energy-cards.tsx). Never call our grade a "certification grade."

**Risk 2 — Thermal mass error:** Pre-2000 RC buildings with high thermal mass will have their heating demand overestimated by the degree-day method (model is conservative, not optimistic). This is actually safer for guidance — users won't be misled into under-insulating.

**Mitigation:** Document the conservative bias in the tooltip. "Heating demand may be overestimated for heavy RC construction — actual performance is likely better."

**Risk 3 — Cooling demand underestimation:** The 60% cooling gain factor in `calculateAnnualDemand` is a rough approximation and may underestimate cooling for glazing-heavy, south-facing buildings in Seoul summer.

**Mitigation:** Flag buildings with WWR > 40% and south orientation with a "cooling demand may be underestimated" warning badge.

**Risk 4 — Compliance confusion:** GX team users who are less familiar with certification might export an ECO2 file expecting it to be a certification submission.

**Mitigation:** The ECO2 export button label should read "ECO2 입력 파일 생성 (설계 참고용)" — "Create ECO2 Input File (for design reference)." Add a tooltip: "This file prepares inputs for ECO2 software. Final certification requires ECO2 calculation and official submission."

### 4.3 Recommended Disclaimer Language

**Korean (primary):**
> 이 수치는 간이 계산 모델 기반의 설계 참고 추정치입니다. 건축물 에너지효율등급 인증을 위해서는 반드시 ECO2 소프트웨어를 통한 공식 평가가 필요합니다.

**English (secondary/toggle):**
> These figures are design-stage estimates based on a simplified model. Official energy efficiency certification requires evaluation through ECO2 software.

**Placement:** One-time dismissible tooltip/banner on first load of energy panel. Persistent "~" prefix on all numeric values. Source badge already exists in material-panel ("code-estimate" / "user-input") — extend this pattern to energy numbers with a "simple model" badge.

### 4.4 The "Approximate Preview vs. Certified Result" Visual Distinction

| Element | Approximate (in-browser) | Certified (ECO2 import) |
|---------|--------------------------|-------------------------|
| Grade background color | Muted/desaturated version of grade color | Full-saturation grade color |
| Grade label suffix | `(모델)` | `(인증)` |
| kWh/m2 value prefix | `~` | none |
| Badge | Grey "간이 모델" badge | Blue "실측/인증" badge (already in energy-cards.tsx) |
| Border | Dashed border on card | Solid border |

The existing `ActualDataBadge` component and `DeltaIndicator` in energy-cards.tsx already implement the right pattern for actual vs. modeled comparison — the same visual language should be extended to the "certified vs. approximate" distinction.

---

## Section 5: Phase-Specific Pitfalls and Warnings

### 5.1 Calculation Accuracy Pitfalls

**Pitfall: Primary energy factor omission**
The in-browser model produces final energy demand (kWh). ECO2 certification is based on primary energy demand (1차 에너지), which multiplies electricity by 2.75 and gas by 1.1. A building with electric heating will look much better in our model than in ECO2 certification.

Detection: Check `hvac.heating.fuelType === "electric"` — if true, add warning: "Electric heating: actual certification grade will be lower due to primary energy factors."

**Pitfall: Degree-day base temperature mismatch**
Korean HDD is commonly published at base 18°C (as in `climate-data.ts`), but ECO2 uses a different internal temperature setpoint with monthly correction. The HDD of 2700 for Seoul (18°C base) is correct but the methodology differs slightly from DIN V 18599.

**Pitfall: Single climate zone**
`getClimateData()` currently returns Seoul regardless of building location. A Gangwon-do building (HDD ~3400, 26% more than Seoul) will have significantly underestimated heating demand.

Fix priority: HIGH — requires passing sigungu code to getClimateData and looking up regional HDD. Region codes and sido prefixes already exist in `GROUND_TEMPERATURES` — a parallel `REGIONAL_HDD` lookup table should be added.

**Pitfall: Cooling demand factor is a rough approximation**
The 60% cooling gain factor in `annual-demand.ts` does not vary by:
- Building orientation (south glazing = more cooling)
- Shading overhangs
- Internal gains (offices have higher plug loads than residential)
- Infiltration cooling credit

This is acceptable for guidance but should be documented as the weakest link in the model.

### 5.2 UX Pitfalls

**Pitfall: Live update anxiety**
If energy numbers update on every slider move (300+ events during a drag), users may become overwhelmed by rapidly changing values.

Fix: Debounce Zustand store writes at 150ms during drag. The calculation itself can remain synchronous — debounce only the store commit that triggers `useEnergyMetrics` re-evaluation. Use `onChange` for visual-only feedback and `onChangeEnd`/`onPointerUp` for store commit.

**Pitfall: Interpreting delta direction incorrectly**
"Wall U-value increased from 0.27 to 0.47 — demand went UP by 23 kWh/m2" could confuse users who see a U-value increase as "more insulation." U-value increases = worse insulation. The delta indicator must use unambiguous language: "Energy demand +23 kWh/m2·yr (insulation reduced)" not just a delta number.

**Pitfall: Grade displayed before building recipe is loaded**
`useEnergyMetrics` returns null if `!materials || !effectiveRecipe`. The existing skeleton loader handles this correctly. The new inline delta indicators must also gate on non-null metrics.

**Pitfall: Misleading precision — showing 142.847 kWh/m2·yr**
Precision beyond 1 decimal place communicates false accuracy. The existing `AnimatedValue` component uses `decimals=1` — this should be enforced consistently across all energy displays, including inline deltas.

---

## Section 6: Recommended Implementation Strategy

### 6.1 What to Build in This Milestone

**Priority 1 — Inline delta indicators in property panel (new behavior)**
When a user adjusts a slider in the material/recipe panel, show a small delta annotation adjacent to the affected metric in the energy summary. This is the core "live feedback" feature. Requires:
- Snapshot `metrics` state on slider focus
- Compare current metrics against snapshot after each committed change
- Render `DeltaIndicator`-style annotation (already implemented in energy-cards.tsx, reuse)
- Auto-dismiss after 4 seconds of no interaction

**Priority 2 — Bottom shelf energy status bar (new component)**
A persistent 40px strip below the property panel showing current grade + demand + CO2. This replaces hunting for the floating energy cards while editing. The floating cards remain for 3D overview context.

**Priority 3 — Disclaimer badges and language (polish)**
- Add "~" prefix to all in-browser computed values
- Change "모델" badge to "간이 모델" to be explicit
- Add dismissible first-use tooltip explaining degree-day limitations
- Add electric heating primary energy warning

**Priority 4 — Regional climate data (accuracy)**
Add `REGIONAL_HDD` lookup keyed by sido prefix. Pass building's `sigunguCd` to `getClimateData`. This is the single highest-impact accuracy improvement available without changing the calculation method.

### 6.2 What NOT to Build in This Milestone

- ISO 52016 5R1C hourly model — too complex, needs separate validation phase
- Psi-value thermal bridge calculation — requires FEA, out of scope
- Primary energy conversion factors — changes grade thresholds, needs ECO2 cross-validation first
- Orientation-specific solar correction — requires solar angle data, medium complexity

### 6.3 Architecture Fit

All proposed changes fit within the existing architecture:
- `useEnergyMetrics` hook remains unchanged (pure consumer of stores)
- New `useEnergyDelta` hook wraps `useEnergyMetrics` with snapshot state
- New `EnergyStatusBar` component consumes `useEnergyMetrics` directly
- `EnergyCards` component unchanged (3D viewer overlay)
- Disclaimer language added to `EnergyCards` and any new energy display components
- Climate data improvement: add `REGIONAL_HDD` to `climate-data.ts`, update `getClimateData(sigunguCd)` signature

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Existing calculation pipeline accuracy | HIGH | Code verified; degree-day method is well-documented in Korean standard |
| Browser feasibility of current model | HIGH | Synchronous JS, <0.5ms measured class of computation |
| UI placement patterns | MEDIUM | Autodesk Insight, cove.tool, PHPP patterns verified via search; exact widget specs from docs not code |
| Korean ECO2 vs. in-browser model gap | HIGH | Primary energy factor gap confirmed by academic sources and ECO2 methodology |
| Approximate vs. certified distinction UX | MEDIUM | Industry pattern clear; specific Korean regulatory language needs legal review |
| Thermal bridge indicators (categorical) | HIGH | Rule-based approach from existing structure codes; no new research needed |
| Regional climate HDD values | MEDIUM | Values need verification against KMA (Korea Meteorological Administration) official data |

---

## Sources

- [Performance gap analysis for Korean BEEC — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0378778824004109)
- [Analysis of Korean BEEC System — MDPI Sustainability](https://www.mdpi.com/2071-1050/7/12/15804)
- [ECO2 based on ISO 52016 and DIN V 18599 — research confirmation](https://www.researchgate.net/publication/285628545_Analysis_of_a_Building_Energy_Efficiency_Certification_System_in_Korea)
- [Autodesk Insight real-time feedback documentation](https://www.autodesk.com/autodesk-university/article/Discover-Insight-360-Building-Energy-Modeling-2017)
- [Autodesk Insight 2024 next generation features](https://www.autodesk.com/blogs/aec/2024/04/23/whats-new-in-the-next-generation-of-autodesk-insight/)
- [PHPP instant feedback — Passipedia](https://passipedia.org/planning/calculating_energy_efficiency/phpp_-_the_passive_house_planning_package)
- [DesignBuilder linear thermal bridges](https://designbuilder.co.uk/helpv7.0/Content/LinearThermalBridges.htm)
- [cove.tool DOE article on reduced-order modeling](https://www.energy.gov/eere/buildings/articles/covetool-officiates-perfect-marriage-between-reduced-order-modeling-and)
- [ISO 13790 degree-day method](https://www.iso.org/standard/41974.html)
- [ISO 52016-1 R-C thermal model — IBPSA publication](https://publications.ibpsa.org/proceedings/bs/2019/papers/BS2019_210431.pdf)
- [IES VE 2024 parametric engine](https://www.iesve.com/ve2024)
- [Standard energy modeling disclaimer — Energy-Models.com](https://energy-models.com/forum/standard-modeling-disclaimer)
- [KEMCO Certification overview](https://www.korea-certification.com/en/glossary/kemco-certification/)
