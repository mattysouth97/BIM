# Deep Interview Spec: Building Data Fidelity Strategy

## Metadata
- Interview ID: bim-fidelity-2026-04-13
- Rounds: 4
- Final Ambiguity Score: 13%
- Type: brownfield
- Generated: 2026-04-13
- Threshold: 20%
- Status: PASSED (below threshold at round 4, minimum rounds satisfied)
- Challenge modes used: Contrarian (round 4)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.35 | 0.322 |
| Constraint Clarity | 0.85 | 0.25 | 0.213 |
| Success Criteria | 0.80 | 0.25 | 0.200 |
| Context Clarity (brownfield) | 0.90 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.870** |
| **Ambiguity** | | | **0.130** |

## Goal

Define and implement a building data fidelity strategy for this repo (Korean Building Ledger + procedural 3D viewer + ECO2 integration) whose **primary customer is the GX team's energy engineers**, whose **primary acceptance bar is energy-grade agreement** (predicted ECO2 grade matching the official 에너지아이 certified grade), and whose **scope is one real showcase building now with an architectural skeleton that extends cleanly to a portfolio (pilot → regional) later without rework**.

"Fidelity" in this spec means the joint level of:
1. **Geometric LOD** of the building model
2. **Semantic richness** of per-element attributes (materials, U-values, HVAC, occupancy, lighting)
3. **Positional accuracy** of the building in world-space

...calibrated so that the ECO2 pipeline's predicted energy grade for the showcase building matches the certified 에너지아이 grade.

## Constraints

- **Primary stakeholder:** GX team energy engineers. When stakeholders disagree about "good enough," GX engineers' rules win.
- **Scope (now):** ONE specific real building. Per-building handcraft, IFC/CAD upload, and targeted data enrichment are allowed.
- **Scope (architectural):** The fidelity pipeline MUST extend to 10–100 pilot buildings and later to 1k+ regional sweep without re-architecture. No dead-end per-building hacks that block portfolio extension.
- **Target system:** ECO2 (eval/retrofit workflow). Outputs must slot into ECO2 inputs without manual reformatting.
- **Primary input spine:** Public data (건축물대장 + VWorld cadastre) is the default source. Manual/CAD/IFC augmentation is optional per building.
- **Existing repo assets** (do not rebuild):
  - Procedural generator producing LOD 2–3 geometry (roofs, window grids, mullions, curtain walls, cadastral footprints)
  - ~25 semantic fields per building (structure/era/use/materials/U-values/HVAC/occupancy/LPD) from `korean-building-codes.ts`
  - VWorld footprint API (~0.5–2m cadastral accuracy) wired at `/api/vworld/footprint`
  - Partial ECO2 exporter (`eco2-export.ts`) with HVAC mapping TODO
- **Grade baseline:** The showcase building must have a known, publicly-certified 에너지아이 grade for the acceptance comparison to be possible. Without that, the spec's primary bar cannot be evaluated.

## Non-Goals

- Not building for 10k+ nationwide scale in this iteration (though architecture must not preclude it).
- Not optimizing for executive demo polish or external client visuals as a primary goal. GX engineers are the audience of record. Visual credibility is a side-benefit, not a requirement.
- Not implementing interior geometry, balconies, MEP equipment detail in this iteration (existing procedural generator doesn't produce them; adding them is out of scope unless required to hit grade agreement).
- Not implementing portfolio screening, candidate selection workflows, or multi-building ranking features now (scope is one output building).
- Not optimizing for calibration to measured utility kWh (Round 2 alternative "Calibration to measured kWh" was rejected in favor of grade agreement — grade buckets absorb some prediction noise).
- Not building scenario-delta retrofit tooling in this iteration (Round 2 alternative "Scenario delta reliability" rejected).

## Acceptance Criteria

- [ ] **C1 — Grade agreement (primary).** For the chosen showcase building, the ECO2 pipeline's predicted energy grade equals the officially certified 에너지아이 grade exactly.
- [ ] **C2 — Extensibility smoke test.** After showcase building A passes C1, adding a second building B (by PNU only, from public data) runs end-to-end with no code changes to the core pipeline. B need not pass C1; the goal is to prove no hardcoded assumptions to building A.
- [ ] **C3 — Fidelity inventory.** A fidelity manifest for the showcase building is produced and visible in the app, listing: geometric LOD achieved, semantic fields populated (vs. capturable), positional accuracy estimate, and data source for each field.
- [ ] **C4 — ECO2 input completeness.** `eco2-export.ts` produces a valid ECO2 input set for the showcase building — no missing required fields, no manual post-processing needed before ECO2 ingestion. The HVAC system type TODO in `eco2-export.ts:22` is resolved.
- [ ] **C5 — Public-data baseline.** The pipeline runs for the showcase building starting from PNU + address alone (no uploaded CAD/IFC). If this produces a wrong grade, the gap analysis identifies which semantic/geometric inputs need enrichment — this itself is a valid output, not a failure. Upload paths layer on top.
- [ ] **C6 — No-regression.** Existing dev-server routes stay green: `/api/bldrgst/*`, `/api/vworld/footprint`, procedural building render, 3D viewer load. (Note: `/api/energy/consumption` currently returns 502 — out of scope for this spec but should be flagged in the plan's risk list.)

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Fidelity decision is a pure technical choice | Round 1: asked whose decisions win when stakeholders disagree | GX engineers' rules override other stakeholders. Fidelity is optimized for their actions, not for demos or external audiences. |
| "Good enough" is subjective / context-dependent | Round 2: asked for a measurable bar | ECO2 grade agreement (≥80% on portfolio, exact match for n=1). Rejected: calibration-to-kWh, ranking-preservation, scenario-delta. |
| Scope could be 1 / 100 / 10k / 100k buildings | Round 3: forced a scope decision | One showcase building (in this iteration). Per-building handcraft allowed now. |
| "One showcase" might be a local optimum hiding real portfolio need | Round 4 (Contrarian): probed whether the scope was actually portfolio-shaped | "One building now, portfolio later." Current deliverable is one building, but architecture must extend cleanly. Re-introduced portfolio as an architectural constraint, not a scope one. |

## Technical Context (Brownfield facts from explore agent)

**Existing geometric fidelity (produced by procedural generator):**
- Roof shapes: flat, gable, hip, sawtooth, truncated pyramid (`structure-generator.ts:154–248`, `recipe.ts:124–157`)
- Window openings: procedural panes per floor × facade, dimensions & ratio vary by era + use type (`facade-generator.ts:160–355`, `recipe.ts:25–32`, `korean-building-codes.ts:78–85`)
- Mullion grids, parapet, curtain wall, facade panels (`facade-generator.ts:123–340`)
- Cadastral footprint extrusion when polygon available (`structure-generator.ts:36–57`)
- **Not implemented:** balconies, interior walls/rooms, window subdivisions, per-floor facade variation within a section

**Existing semantic richness (~25 fields from 건축물대장 + korean-building-codes.ts):**
- Structure code, primary use code, era, height, floor count, per-floor area, roof code, architectural area, site area
- Wall layer composition (insulation/finish/thermal conductivity), slab, column, roof materials by era+structure
- Window U-value, SHGC, glazing type, frame material
- Airtightness (ACH), HVAC system type, occupancy density, lighting power density, ground temperature
- **Not captured:** interior zoning, equipment detail, control strategy, retrofit history

**Existing positional accuracy:**
- VWorld cadastre (WGS84) → local XZ projection via `proj4` (~0.5–2m typical)
- PNU-derived parcel lookup (19-digit code)
- Vertical: total height from `heit`, floor height divided

**Existing dataset integrations (all server-side proxy routes):**
- `/api/bldrgst/{title,basis,floors,areas,recap,jijugu}` — DataGo.kr 건축물대장
- `/api/vworld/footprint` — VWorld cadastral polygon
- `/api/weather` — (exists, implementation not audited)
- `/api/energy/consumption` — currently 502 (broken, out of scope for this spec)
- `/api/cad/convert` — 501 (not implemented, optional augmentation path)

**Existing plans relevant to this spec:**
- `digital-twin-platform-plan.md`: deep IFC investment (material layers, property sets) — semantic richness, not geometric LOD
- `ui-integration-plan.md`: fidelity assessment UI classifies Level 1/2/3 by *data breadth* — does not specify geometric LOD per level
- `cad-upload-workflow-plan.md`: CAD upload scoped to footprint only, no interior/openings extraction
- `open-questions.md`: IFC depth resolved as "deep investment"; no geometric LOD decision

**Critical gap surfaced by explore agent:** Existing code has no Level-2 → Level-3 *geometric* refinement path. Fidelity levels in existing plans track data quality, not model detail. This spec will close that gap for the showcase building.

## Ontology (Key Entities — final round)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| FidelityStrategy | core domain | axes (geometric, semantic, positional), target, scope, stakeholder | Serves GXEngineer; produces BuildingModel; targets ECO2System |
| GXEngineer | core stakeholder | role, decision scope, rules priority | Primary consumer; authors GradePredictionDecision |
| BuildingModel | core artifact | geometric LOD, semantic fields, position | Produced by FidelityStrategy; consumed by ECO2System; bound to ShowcaseBuilding |
| ShowcaseBuilding | core instance | PNU, address, certified 에너지아이 grade | Instance of BuildingModel; validation anchor |
| ECO2System | external system | input schema, output grades | Consumes BuildingModel inputs; emits ECO2Grade |
| CertifiedGrade | reference data | 에너지아이 label, bucket (A++…E) | Ground truth for validation; attached to ShowcaseBuilding |
| ECO2Grade | output | predicted bucket, confidence | Produced by ECO2System; compared to CertifiedGrade |
| AgreementRate | metric | match count / total | Degenerates to boolean for n=1 |
| GradeBucket | reference data | 7 buckets (A++ to E) | Shared by CertifiedGrade and ECO2Grade |
| GradePredictionDecision | decision | action, rationale | Made by GXEngineer using ECO2Grade |
| PortfolioExtension | architectural constraint | extension scope (10–100, 1k+), readiness test | Shapes FidelityStrategy architecture; not scope in this iteration |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 6 | 6 | - | - | N/A |
| 2 | 9 | 4 (ECO2Grade, CertifiedGrade, AgreementRate, GradeBucket) | 1 (Decision → GradePredictionDecision) | 4 | 56% |
| 3 | 10 | 1 (ShowcaseBuilding) | 0 | 9 | 90% |
| 4 | 11 | 1 (PortfolioExtension) | 0 | 10 | 91% |

**Convergence achieved at round 4.** Stability climbed monotonically from 56% → 90% → 91%; last two rounds introduced only scope-refining entities (ShowcaseBuilding, PortfolioExtension), not new core concepts. The domain model is stable.

## Interview Transcript

<details>
<summary>Full Q&A (4 rounds)</summary>

### Round 1 — Targeting: Goal Clarity
**Q:** Among the 'numerous nodes of people and knowledge' at your work, whose decisions does this fidelity strategy have to serve first (i.e. if two stakeholders disagree on what 'good enough' means, whose rules win)?
**A:** GX team energy engineers
**Ambiguity:** 59% (Goal 0.60, Constraints 0.20, Criteria 0.15, Context 0.75)

### Round 2 — Targeting: Success Criteria
**Q:** What measurable outcome would make a GX energy engineer trust this model enough to act on it?
**A:** Energy grade agreement — predicted ECO2 grade matches certified 에너지아이 grade in ≥80% of cases
**Ambiguity:** 36% (Goal 0.85, Constraints 0.20, Criteria 0.70, Context 0.80)

### Round 3 — Targeting: Constraints
**Q:** What is the scope this fidelity strategy must cover?
**A:** One showcase building
**Ambiguity:** 18% (Goal 0.90, Constraints 0.75, Criteria 0.75, Context 0.85)

### Round 4 — Mode: CONTRARIAN — Targeting: Constraints (re-test)
**Q:** Contrarian check: showcase to whom, and who picks it? Is the real scope portfolio-shaped?
**A:** One building now, portfolio later — current deliverable is one building but architecture must extend cleanly
**Ambiguity:** 13% (Goal 0.92, Constraints 0.85, Criteria 0.80, Context 0.90)

</details>

## Risk List for Downstream Planning

- **R1 (known unknown):** The showcase building is not yet named in this spec. The plan phase must resolve: which specific building, and does it have a publicly-certified 에너지아이 grade to compare against?
- **R2 (existing bug):** `/api/energy/consumption` returns 502 for every request. Not in this spec's scope, but adjacent — flag for separate fix.
- **R3 (existing TODO):** `eco2-export.ts:22` HVAC system type mapping is unverified against KS F 1900. Criterion C4 requires resolving this.
- **R4 (scope creep risk):** Portfolio extension is an *architectural* constraint, not a deliverable. The plan must not let "portfolio later" leak work into this iteration.
- **R5 (dataset gap):** Plans reference IFC/CAD upload paths that are partially implemented (`/api/cad/convert` returns 501). If the public-data-only baseline (C5) fails to hit C1, C5 requires CAD/IFC augmentation to be usable — which means CAD paths move into scope.
