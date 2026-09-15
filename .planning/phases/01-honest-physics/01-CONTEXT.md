# Phase 1: Honest Physics - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the modeled energy chain tell the truth about lighting and on-site generation, and
make it tell the same truth from both pages that compute it.

Today `deliveredFromDemand` splits modeled demand with `electric = cooling + 0.15 × total`,
`gas = heating + 0.10 × total`, `renewable = 0`. Because the lighting share is a flat ratio
and renewable is a literal zero, no lighting or photovoltaic measure can move the headline
intensity or the efficiency grade however real its own savings formula is — it moves cash
flow only. This phase replaces that split with named end uses that carry provenance, feeds
it a real lighting load and a real renewable leg, resolves the building's climate region
once instead of silently assuming Seoul, converges the twin and diagnostics economics paths
onto one shared core, and regenerates the seven published reference datasets under the
corrected physics with a raised schema version and a changelog entry.

**In scope:** PHYS-01..PHYS-05, plus the region-resolution wiring PHYS-02 depends on and
the two weather fields named in D-20 (a deliberate, user-approved reach — see Deferred for
what was held back).

**Not in scope:** the retrofit panel's presentation (Phase 2), the model registry collapse
(Phase 3), corpus generation (Phase 4), calibration error bands and peer benchmarking
(next milestone).

</domain>

<decisions>
## Implementation Decisions

### Lighting energy source

- **D-01:** The modeled lighting load is computed as `LPD × conditioned area × annual operating hours`, not taken as a share of total demand. — **Reversibility:** costly — reverting means restoring a ratio in `deliveredFromDemand` and re-deriving every grade that shipped under the explicit load, including published datasets.
- **D-02:** The hard-coded 2,500 h/yr is replaced by a use-code-indexed hours table. `USE_CODE_OPERATING_HOURS` in `src/lib/energy/equipment-specs.ts` already IS that table (ASHRAE 90.1 defaults, 2,500 h fallback) — wire it through rather than authoring a second one. See Code Context for the string-vs-number wrinkle.
- **D-03:** Both primary energy intensity and site energy intensity must move when lighting changes. Moving primary alone does not satisfy PHYS-01.
- **D-04:** An inferred LPD (from `LIGHTING_DEFAULTS`) may move a grade, but only with visible disclosure that the LPD is assumed. This is the PHYS-03 contract for lighting: a named, visible assumption, never a silent default.

### Rest of the fuel split

- **D-05:** The split takes four named end uses — `hvac`, `lighting`, `dhw`, `plug` — each carrying its own provenance, and maps them to fuels. It no longer receives a bare demand total.
- **D-06:** Both legs route by declared `fuelType`, not by the fixed heating→gas / cooling→electric assumption. The `districtHeating` (0.728) and `districtCooling` (0.937) primary-energy factors come alive as a result.
- **D-07:** The 15 %/10 % double count is prevented **structurally**, not by arithmetic care: `deliveredFromDemand` accepts named end uses and only maps them to fuels. No ratio arithmetic survives inside the function. A reviewer must be able to see the impossibility from the signature. — **Reversibility:** costly — the signature change touches ~10 production call sites and the test files that construct its input.
- **D-08:** `L-SITE-TOTAL` and `L-GRADE-SHARES` are rewritten in place and keep their IDs. They must not be retired or deleted. — **Reversibility:** one-way — already-published dataset records reference these IDs via `limitationIds`; changing or retiring an ID breaks consumers of JSON/CSV releases that are already out.

### PV generation input

- **D-09:** The renewable leg is fed by declared capacity, roof-sized: the split reads `materials.renewable.solarPV.capacity`, and the retrofit path writes a measured `pvGeometricKWp` through `applyPhaseToMaterials`.
- **D-10:** The kWp→annual-kWh conversion is the existing `solar-potential.ts` formula, **extracted** into `src/lib/energy/` so one validated arithmetic serves both the economics and the physics path. Extraction, not a reimplementation, and not a cross-layer import from `lib/retrofit` into `lib/energy`.
- **D-11:** The `Math.min` cap on renewable against the electric leg stays, but the clipped kWh is reported explicitly rather than silently discarded.
- **D-12:** `capacity: 0` arriving from `material-inference` is a **statement**, expressed as a named visible assumption ("no on-site generation assumed"), not an absence and not an unremarkable zero.

### Two-path convergence

- **D-13:** Convergence takes the shape of a shared pure generation core. `use-retrofit-scenario.ts` and `energy-diagnostics/retrofit-bridge.ts` both become thin adapters over it. Neither path is declared canonical over the other. — **Reversibility:** costly — both adapters and their call sites would have to be re-forked.
- **D-14:** Diagnostics takes roof geometry for PV from `pv-layout` roof planes where the roof has been measured, and from a **named** ratio-estimate assumption where it has not. Never a silent ratio.
- **D-15:** "The same retrofit result" (PHYS-04) means identical measure IDs, identical kWh, identical grade delta and identical financials. A contract test enforces it and **fails the build** on divergence. Not a tolerance band, not a spot check.
- **D-16:** Unsaved twin store edits are a declared input to pricing, not something to freeze out. The panel states that N unsaved edits are included.

### Geo-location and climate

- **D-17:** One resolved `ClimateRegion` value object is produced once from 시군구코드 and carries the 시도 code, HDD/CDD, design temperatures and PSH **together**. This ends the two-keyspace split (시도 digits for climate, lowercase English for irradiance). `SIDO_TOKENS` English names survive as display labels only. — **Reversibility:** costly — every climate and irradiance consumer reads the new object.
- **D-18:** An unresolvable region **refuses** — it emits no PV figure — matching `resolveLedgerWeatherSource` in `ledger-climate.ts`, which already returns `null` rather than guessing. A national-mean PSH was rejected because it would let a wiring bug hide behind a plausible number.
- **D-19:** Region resolution happens **once at the payload boundary**. The shared core receives the resolved object and never a raw code. The existing `getClimateData` Seoul degree-day fallback is **named**, not silenced — it stays, and it says so.
- **D-20:** `coolingSeasonSolar` and `summerDesignTemp` are regionalized in this phase. `indoorTemp` and `indoorCoolTemp` stay national and are named as setpoint assumptions. **This is a deliberate reach past PHYS-01..05, approved by the user on 2026-09-15.** Rationale: PHYS-05 regenerates all seven published datasets once; deferring these two fields means regenerating twice and shipping a schema bump whose cooling numbers are known to be Seoul's. — **Reversibility:** one-way — it changes cooling demand, therefore the electric leg, therefore every published grade; undoing it after release needs another schema bump and changelog entry.
- **D-21:** **Region wiring is a hard dependency of PHYS-02, not an optional extra.** Verified 2026-09-15: not one of the seven `useRetrofitScenario` call sites passes `region`, so every building takes the `region = "seoul"` default and every PV figure in the app is computed at Seoul's 3.5 PSH. If D-18's refusal ships without the wiring, every building loses its PV figure. The wiring and the refusal must land together.

### Claude's Discretion

The user delegated four calls explicitly ("decide as energy expert"); they are recorded
above as D-10, D-17, D-18 and D-19 and are **decided, not open**. Remaining discretion:

- Where exactly the extracted kWp→kWh function lives inside `src/lib/energy/` and what it is named.
- The internal shape of the `ClimateRegion` value object (fields, construction, whether it is a branded type).
- How the named end-use provenance is represented on the split's input type.
- Whether the four end uses are a discriminated union or a record — as long as D-07's structural guarantee is visible from the signature.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The gate itself

- `src/lib/energy/delivered-from-demand.ts` — the 15 %/10 %/0 split this phase replaces; also owns `buildingTypeForGrade` and `gradeTableIsFromOccupancy`, which must keep working
- `src/lib/energy/primary-energy.ts` — `DeliveredEnergy` shape and the primary-energy factors, including the districtHeating 0.728 / districtCooling 0.937 legs D-06 brings alive
- `src/lib/energy/system-breakdown.ts` — downstream consumer of the split

### Lighting

- `src/lib/retrofit/lighting-retrofits.ts` — the lighting measure and its `annualOperatingHours` parameter
- `src/lib/energy/equipment-specs.ts` — `USE_CODE_OPERATING_HOURS` (the table D-02 wires through) and its private `getOperatingHours`
- `src/lib/korean-building-codes.ts` — `LIGHTING_DEFAULTS` (LPD, lamp type, control type by 주용도코드)
- `src/lib/material-inference.ts` — where an inferred LPD is produced, the origin of D-04's disclosure obligation

### Photovoltaic

- `src/lib/retrofit/solar-potential.ts` — `calculateSolarPotential`, `REGIONAL_IRRADIANCE`, and the formula D-10 extracts. Note the sixth-positional-argument hazard documented in its own JSDoc
- `src/lib/retrofit/pv-layout.ts` — measured roof-plane module layout, the `geometricKWp` source
- `src/lib/retrofit/twin-roof-planes.ts` — roof planes on the twin path
- `src/lib/bim/phases/apply-phase.ts` — `applyPhaseToMaterials`, which writes PV back into materials; also hardcodes `context?.region ?? "seoul"` at :207

### Climate and region

- `src/lib/energy/climate-data.ts` — `getClimateData`; regionalizes `hdd`/`cdd`/`winterDesignTemp` only, returns `summerDesignTemp`/`indoorTemp`/`indoorCoolTemp`/`coolingSeasonSolar` as Seoul constants for every building
- `src/lib/energy-diagnostics/ledger-climate.ts` — `resolveLedgerWeatherSource`, the refuse-rather-than-guess precedent D-18 follows

### The two economics paths

- `src/hooks/use-retrofit-scenario.ts` — the twin path; `region = "seoul"` default at :238, LPD × area × hours already computed at :432
- `src/lib/energy-diagnostics/retrofit-bridge.ts` — the diagnostics path; `analyzeRetrofitEconomics`
- `src/lib/retrofit/retrofit-delta.ts` — the delta engine both paths reach
- `src/lib/retrofit/measure-claim.ts` — measure claims; carries an existing comment about the 15 % lighting fix

### Publishing (PHYS-05)

- `src/lib/reference-buildings/energy-dataset.ts` — dataset generation, schema version, `limitationIds` that D-08 protects
- `public/releases/CHANGELOG.md` — where the regeneration is recorded

### Standards and governance

- `src/lib/energy-standards/` — 별표1 U-value ceilings, ZEB grade tables, ISO-6946 assembly physics; every value cites `docs/05_Research/ENERGY_STANDARD_TRACEABILITY.md`
- `AGENTS.md` — the stated-versus-assumed invariant, the "label lies while the number is right" rules, and the verification commands
- `.planning/REQUIREMENTS.md` — PHYS-01..PHYS-05 verbatim
- `.planning/ROADMAP.md` — Phase 1 goal and its five success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`USE_CODE_OPERATING_HOURS`** (`src/lib/energy/equipment-specs.ts:126`) — the use-indexed hours table D-02 calls for already exists: 2,920 h 주택, 3,000 h 근린생활, 2,000 h 문화집회, 4,000 h 판매, 3,500 h 의료, 2,500 h 교육연구, 4,380 h 업무. Default 2,500 h. **Do not author a second table.** Its accessor `getOperatingHours` is currently private — exporting it is likely part of the wiring.
- **The LPD formula already exists on the twin path** — `use-retrofit-scenario.ts:432` computes `(materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000`. D-01 is largely about routing this into the split, not deriving it fresh.
- **`calculateSolarPotential`** (`solar-potential.ts:69`) — already handles the measured-kWp-wins logic (`geometricKWp` beats the utilisation-ratio path). D-10 extracts its generation arithmetic; the economics wrapper can stay.
- **`resolveLedgerWeatherSource`** (`ledger-climate.ts:60`) — returns `null` for an unresolvable region. This is the precedent D-18 generalizes, and the shape to copy.

### Established Patterns

- **Pure, React-free, store-free modules** under `src/lib/energy/` — `delivered-from-demand.ts` states this in its header comment. The shared generation core of D-13 must hold to it.
- **`createEnergyFact` throws** unless a fact cites sources, names an assumption, or is explicit user input. D-04, D-12, D-14 and D-20's setpoint assumptions all have to go through this boundary, not around it. A convenience helper that attaches references to a defaulted value would kill the guarantee — see AGENTS.md.
- **Sixth-positional-argument hazard** — `calculateSolarPotential` takes `geometricKWp` in slot six, after `electricityPrice`. Passing kWp in slot five silently prices the system per kWh and leaves the size on the ratio path: a wrong number, not a type error. Any refactor should close this, not preserve it.

### Integration Points

- **Production consumers of `deliveredFromDemand`** — `report-stage.tsx:263`, `properties-panel.tsx:243`, `use-energy-metrics.ts:104`, `retrofit-delta.ts:278`, `energy-dataset.ts:89`, plus comment-level dependents in `reference-retrofit.tsx`, `measure-chip-row.tsx`, `measure-claim.ts`. Six test files construct its input directly and are contract tests in practice.
- **Seven `useRetrofitScenario` call sites** — `energy-panel.tsx:119`, `reference-retrofit.tsx:174`, `report-stage.tsx:154`, `energy-instrument-hud.tsx:151`, `equipment-info-panel.tsx:67`, `equipment-insight-card.tsx:48`, `scene-outliner.tsx:124`. **None passes `region`** (verified 2026-09-15). These are the D-21 wiring sites.
- **`energy-instrument-hud.tsx:65`** already accepts a two-digit 시도 prefix for regional climate but never forwards it to the lowercase-English `region` key PV reads — the two-keyspace split D-17 closes, caught in one component.
- **A representation clash to reconcile, not conflate:** `operatingHours` is a **number** in `equipment-specs.ts` and a human schedule **string** ("Mon-Fri 08:00-18:00") in `tier-one-model.ts:469`, `reference-office-model.ts:248`, `ledger-baseline-model.ts:1179` and `fixtures.ts:517`. The numeric hours that drive the lighting load and the schedule string that is displayed are different facts sharing a name.

</code_context>

<specifics>
## Specific Ideas

- **D-07 is a structural request, not a quality request.** The phrasing was that no ratio
  arithmetic should *survive inside* the function — the guarantee should be visible from the
  signature, so a future reader cannot reintroduce the double count by accident.
- **D-18's rationale is a bug-visibility argument:** a national-mean PSH was rejected
  specifically because it would let the no-caller-passes-region bug hide behind a plausible
  number. Prefer refusal over a defensible-looking default wherever this phase faces the choice.
- **D-08 keeps IDs for a consumer reason, not a tidiness reason** — published records already
  cite `L-SITE-TOTAL` and `L-GRADE-SHARES` through `limitationIds`.
- The phase sits directly on AGENTS.md's "the label lies while the number is right" territory:
  every figure this phase changes is also *explained* somewhere in the UI. Where a rendered
  string explains one of these numbers, the explanation has to be re-derived, not just left
  to still contain the right words.

</specifics>

<deferred>
## Deferred Ideas

- **Regionalizing `indoorTemp` and `indoorCoolTemp`** — held national deliberately (D-20). They
  are setpoints, not weather; they belong to an occupancy/comfort modelling decision, not to
  this phase's climate work.
- **The twin's energy path becoming the canonical traceable engine** — the top open issue in
  `docs/04_Agent-Handoffs/CURRENT.md`. D-13 converges the *economics* paths onto one core; it
  does not make the twin's energy traceable. That remains open after this phase.
- **Deleting `src/components/twin/capex-input.tsx` and `DEFAULT_CAPEX_BUDGET_KRW`** — both are
  dead code in the surface this milestone reworks, but their removal is Phase 2 scope
  (PANEL-05), not Phase 1.
- **Calibration error bands (CAL-01..03) and peer-group benchmarking (BENCH-01..04)** — next
  milestone, per REQUIREMENTS.md "Next Milestone".

### Reviewed Todos (not folded)

- `2026-03-28-production-hardening-for-v2-0-release.md` — reviewed, not folded (match score 0.2, unrelated to the physics chain)
- `2026-03-28-rigorous-qa-testing-and-verification-for-bim-accuracy.md` — reviewed, not folded (match score 0.2, unrelated to the physics chain)

</deferred>

---

*Phase: 1-Honest Physics*
*Context gathered: 2026-09-15*
