# Phase 1: Honest Physics - Research

**Researched:** 2026-09-15
**Domain:** Korean building-energy physics core (fuel split, primary/site energy, lighting/PV retrofit economics, climate region resolution) — brownfield refactor of an existing, heavily-tested TypeScript engine
**Confidence:** HIGH — every load-bearing claim below was verified by reading the named file this session (path:line quoted). A small number of claims are explicitly marked `[ASSUMED]` or "unverified" where the source could not be read or a negative could not be proven.

## Summary

This phase's blast radius is larger than CONTEXT.md's canonical_refs names, in one specific, verifiable way: **there are two independent lighting/end-use computations in the codebase today, not one.** `deliveredFromDemand` (`src/lib/energy/delivered-from-demand.ts:24-32`) feeds the official primary-energy grade via `calculateEfficiencyRating`. A second, textually unconnected function, `calculateSystemBreakdown` (`src/lib/energy/system-breakdown.ts:158-204`), derives lighting/DHW/plug loads from a *different* table (`SYSTEM_RATIOS`, keyed by 주용도코드 prefix, with its own `generic_default` provenance fallback) and feeds `siteTotal` in `useEnergyMetrics` (`use-energy-metrics.ts:136`), which is what `energy-cards.tsx:194` divides by floor area to render the on-screen **site energy intensity**, and what `report-stage.tsx:200-202` feeds to `calibrateEnergy` against real meter data. `system-breakdown.ts` does **not** import `deliveredFromDemand` — confirmed by reading the whole file; its import list is `calculateAnnualDemand`, `calculateHeatLoss`, `envelopeQuantities` only. CONTEXT.md's canonical_refs calls `system-breakdown.ts` "downstream consumer of the split" — that statement does not match the code read this session. Consequently, **D-03 ("both primary AND site intensity must move") cannot be satisfied by editing `deliveredFromDemand` alone.** `calculateSystemBreakdown`'s own lighting term must also be re-derived from the same LPD×area×hours fact D-01 establishes, or the grade will move while the on-screen site-intensity figure and the meter-calibration figure silently keep using the old flat use-code ratio — reproducing, inside this very phase, the "two disagreeing numbers for one building" failure mode this codebase has hit twice before (two model registries, two economics paths).

Second, `analyzeRetrofitEconomics` (`src/lib/energy-diagnostics/retrofit-bridge.ts`) — the diagnostics path — **generates no PV/solar measure at all today.** It imports `generateEnvelopeRetrofits`, `generateHvacRetrofits`, `generateLightingRetrofits` but never `calculateSolarPotential`, and its function signature carries no `region`/roof-plane input. PHYS-04's "identical retrofit result" therefore is not achievable by reconciling wall-U formulas alone (the earlier, pre-CONTEXT.md `.planning/research/ARCHITECTURE.md` Q3 analysis, written before D-13's shared-core decision was locked, undersells this) — the diagnostics path needs a PV measure added before its result set can even have the same *measure ids* as the twin's, which is D-15's literal first requirement.

Third, the region-wiring gap named in D-21 is confirmed and is a **small, mechanical fix, not a prop-drilling problem.** All seven `useRetrofitScenario` call sites already have `sidoPrefix` in scope today (from `ScenarioBuildingInputs.sidoPrefix`, published once at `scenario-store.ts`'s `setBuildingInputs` boundary — exactly the "payload boundary" D-19 asks for) but none derives the lowercase-English `region` key PV irradiance needs from it. Better still: `resolveLedgerWeatherSource`'s existing `SIDO_TOKENS[prefix].token` value, lowercased, is a byte-exact match for every key in `REGIONAL_IRRADIANCE` (both tables read in full this session; 17 entries each, same 17 region names). `ClimateRegion` can be built once at the `ScenarioBuildingInputs` boundary and carry both the numeric HDD lookup and the irradiance key without inventing a new mapping.

Fourth, PHYS-05 ("regenerate the seven published datasets... changelog entry") is **not a batch job.** `loadReferenceEnergyDataset` (`energy-dataset-server.ts:19-49`) computes the published dataset live, per HTTP request, by calling the pure `buildReferenceEnergyDataset(manifest, inputs)` against the committed `manifest.json` and `energy-inputs.ts` — there is no static per-building energy-dataset JSON file to regenerate. Once the code fix ships, the next request already reflects it. What genuinely needs work: `ENERGY_DATASET_SCHEMA_VERSION` (`energy-dataset.ts:14`, currently `"1.3.0"`) must bump, `L-GRADE-SHARES` and `L-SITE-TOTAL` (`energy-dataset.ts:66-67`) must be rewritten in place (D-08) to describe the new physics, and — this is a genuine gap, not a misdirection to ignore — **`public/releases/CHANGELOG.md` is the changelog for a different, superseded product** (the v7.0 "Portfolio Prediction Data Product", `portfolio-xgb` model family, `public/releases/manifest.json`/`v0.1.0/`). It has never carried an entry about the seven reference buildings' energy schema. The planner must decide where PHYS-05's changelog entry actually goes (a new file, or a repurposing of this one) rather than assume CONTEXT.md's citation is a description of established practice.

**Primary recommendation:** sequence the fix as (1) redesign `deliveredFromDemand`'s signature to the named-end-use shape D-05/D-07 requires, with `calculateSystemBreakdown`'s lighting term pulled from the *same* LPD×area×hours computation rather than left on `SYSTEM_RATIOS`; (2) wire the `ClimateRegion` value object once at the `ScenarioBuildingInputs`/ledger-baseline boundary and thread it through both `useRetrofitScenario` and `retrofit-bridge.ts`; (3) add the missing PV measure to the diagnostics path and converge both paths on `computeRetrofitDelta`; (4) bump the schema version, rewrite `L-GRADE-SHARES`/`L-SITE-TOTAL` in place, and resolve the changelog location as an explicit planning decision.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fuel split / delivered energy (`deliveredFromDemand`) | API / Backend (shared physics core, `src/lib/energy/`) | — | Pure, store-free, React-free module per its own header comment; consumed identically by client hooks and server dataset builders |
| Primary-energy + efficiency grade | API / Backend (shared physics core) | — | `calculatePrimaryEnergy`/`calculateEfficiencyRating` are pure; called from both client (`useEnergyMetrics`) and server (`energy-dataset.ts`) |
| Site-energy intensity (`calculateSystemBreakdown`) | API / Backend (shared physics core) | — | Currently a *second*, disconnected pure module in the same tier — the bug is duplication within the tier, not tier misassignment |
| Lighting/PV retrofit measures (twin path) | Browser / Client (`use-retrofit-scenario.ts`, a `"use client"` hook) | API / Backend (`retrofit-delta.ts`, `solar-potential.ts` are pure and tier-agnostic) | Hook reads Zustand client stores; delegates the actual physics to pure `lib/` functions it calls synchronously |
| Lighting/PV retrofit measures (diagnostics path) | API / Backend (`retrofit-bridge.ts`, pure, reads only the frozen engine payload) | — | Explicitly documented as "reads only the exact engine payload... never zustand stores" |
| Climate/region resolution | API / Backend (`ledger-climate.ts`, `climate-data.ts` — pure) | Browser / Client (`scenario-store.ts` publishes the resolved value once) | Resolution logic is pure; the *publish-once* boundary is a client store because the ledger data arrives client-side today |
| Published reference-building dataset | API / Backend (`energy-dataset-server.ts`, Next.js route handler, computed per-request) | CDN / Static (`manifest.json` etc. are static files under `public/`) | No database; dataset JSON is computed live from committed static inputs, not pre-rendered to a file |
| Corpus/release changelog | CDN / Static (`public/releases/`) | — | Currently scoped to a different, superseded product (v7.0 portfolio prediction) — not yet a home for this phase's changelog entry |

## User Constraints

<user_constraints>

### Locked Decisions (from CONTEXT.md — verbatim)

- **D-01:** The modeled lighting load is computed as `LPD × conditioned area × annual operating hours`, not taken as a share of total demand. — **Reversibility:** costly — reverting means restoring a ratio in `deliveredFromDemand` and re-deriving every grade that shipped under the explicit load, including published datasets.
- **D-02:** The hard-coded 2,500 h/yr is replaced by a use-code-indexed hours table. `USE_CODE_OPERATING_HOURS` in `src/lib/energy/equipment-specs.ts` already IS that table (ASHRAE 90.1 defaults, 2,500 h fallback) — wire it through rather than authoring a second one. See Code Context for the string-vs-number wrinkle.
- **D-03:** Both primary energy intensity and site energy intensity must move when lighting changes. Moving primary alone does not satisfy PHYS-01.
- **D-04:** An inferred LPD (from `LIGHTING_DEFAULTS`) may move a grade, but only with visible disclosure that the LPD is assumed. This is the PHYS-03 contract for lighting: a named, visible assumption, never a silent default.
- **D-05:** The split takes four named end uses — `hvac`, `lighting`, `dhw`, `plug` — each carrying its own provenance, and maps them to fuels. It no longer receives a bare demand total.
- **D-06:** Both legs route by declared `fuelType`, not by the fixed heating→gas / cooling→electric assumption. The `districtHeating` (0.728) and `districtCooling` (0.937) primary-energy factors come alive as a result.
- **D-07:** The 15 %/10 % double count is prevented **structurally**, not by arithmetic care: `deliveredFromDemand` accepts named end uses and only maps them to fuels. No ratio arithmetic survives inside the function. A reviewer must be able to see the impossibility from the signature. — **Reversibility:** costly — the signature change touches ~10 production call sites and the test files that construct its input.
- **D-08:** `L-SITE-TOTAL` and `L-GRADE-SHARES` are rewritten in place and keep their IDs. They must not be retired or deleted. — **Reversibility:** one-way — already-published dataset records reference these IDs via `limitationIds`; changing or retiring an ID breaks consumers of JSON/CSV releases that are already out.
- **D-09:** The renewable leg is fed by declared capacity, roof-sized: the split reads `materials.renewable.solarPV.capacity`, and the retrofit path writes a measured `pvGeometricKWp` through `applyPhaseToMaterials`.
- **D-10:** The kWp→annual-kWh conversion is the existing `solar-potential.ts` formula, **extracted** into `src/lib/energy/` so one validated arithmetic serves both the economics and the physics path. Extraction, not a reimplementation, and not a cross-layer import from `lib/retrofit` into `lib/energy`.
- **D-11:** The `Math.min` cap on renewable against the electric leg stays, but the clipped kWh is reported explicitly rather than silently discarded.
- **D-12:** `capacity: 0` arriving from `material-inference` is a **statement**, expressed as a named visible assumption ("no on-site generation assumed"), not an absence and not an unremarkable zero.
- **D-13:** Convergence takes the shape of a shared pure generation core. `use-retrofit-scenario.ts` and `energy-diagnostics/retrofit-bridge.ts` both become thin adapters over it. Neither path is declared canonical over the other. — **Reversibility:** costly — both adapters and their call sites would have to be re-forked.
- **D-14:** Diagnostics takes roof geometry for PV from `pv-layout` roof planes where the roof has been measured, and from a **named** ratio-estimate assumption where it has not. Never a silent ratio.
- **D-15:** "The same retrofit result" (PHYS-04) means identical measure IDs, identical kWh, identical grade delta and identical financials. A contract test enforces it and **fails the build** on divergence. Not a tolerance band, not a spot check.
- **D-16:** Unsaved twin store edits are a declared input to pricing, not something to freeze out. The panel states that N unsaved edits are included.
- **D-17:** One resolved `ClimateRegion` value object is produced once from 시군구코드 and carries the 시도 code, HDD/CDD, design temperatures and PSH **together**. This ends the two-keyspace split (시도 digits for climate, lowercase English for irradiance). `SIDO_TOKENS` English names survive as display labels only. — **Reversibility:** costly — every climate and irradiance consumer reads the new object.
- **D-18:** An unresolvable region **refuses** — it emits no PV figure — matching `resolveLedgerWeatherSource` in `ledger-climate.ts`, which already returns `null` rather than guessing. A national-mean PSH was rejected because it would let a wiring bug hide behind a plausible number.
- **D-19:** Region resolution happens **once at the payload boundary**. The shared core receives the resolved object and never a raw code. The existing `getClimateData` Seoul degree-day fallback is **named**, not silenced — it stays, and it says so.
- **D-20:** `coolingSeasonSolar` and `summerDesignTemp` are regionalized in this phase. `indoorTemp` and `indoorCoolTemp` stay national and are named as setpoint assumptions. **This is a deliberate reach past PHYS-01..05, approved by the user on 2026-09-15.** Rationale: PHYS-05 regenerates all seven published datasets once; deferring these two fields means regenerating twice and shipping a schema bump whose cooling numbers are known to be Seoul's. — **Reversibility:** one-way — it changes cooling demand, therefore the electric leg, therefore every published grade; undoing it after release needs another schema bump and changelog entry.
- **D-21:** **Region wiring is a hard dependency of PHYS-02, not an optional extra.** Verified 2026-09-15: not one of the seven `useRetrofitScenario` call sites passes `region`, so every building takes the `region = "seoul"` default and every PV figure in the app is computed at Seoul's 3.5 PSH. If D-18's refusal ships without the wiring, every building loses its PV figure. The wiring and the refusal must land together.

### Claude's Discretion (from CONTEXT.md — verbatim)

The user delegated four calls explicitly ("decide as energy expert"); they are recorded
above as D-10, D-17, D-18 and D-19 and are **decided, not open**. Remaining discretion:

- Where exactly the extracted kWp→kWh function lives inside `src/lib/energy/` and what it is named.
- The internal shape of the `ClimateRegion` value object (fields, construction, whether it is a branded type).
- How the named end-use provenance is represented on the split's input type.
- Whether the four end uses are a discriminated union or a record — as long as D-07's structural guarantee is visible from the signature.

### Deferred Ideas (OUT OF SCOPE, from CONTEXT.md — verbatim)

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

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHYS-01 | A lighting measure changes the building's modeled energy intensity and its efficiency grade, not only its cash flow | Requires editing BOTH `deliveredFromDemand` (grade/primary) AND `calculateSystemBreakdown` (site intensity) — see Summary and "What actually reaches the grade" below. `generateLightingRetrofits`'s existing saving formula (`lighting-retrofits.ts:33-34`) already matches D-01's target formula; the gap is entirely in whether the split reads it. |
| PHYS-02 | A photovoltaic system's generation reaches primary energy and the efficiency grade, not only its cash flow | `calculatePrimaryEnergy` already accepts and correctly nets a `renewable` term (`primary-energy.ts:62-77`, read in full) — no primary-energy math changes needed, only a non-zero value reaching it via `deliveredFromDemand`. Region wiring (D-21) is a hard dependency, confirmed via all seven call sites below. |
| PHYS-03 | Unknown LPD/PV capacity reads as a named, visible assumption, never silent | `lightingPowerDensityWPerSqm` is already an `assumptionFact` with `LEDGER_USAGE_ASSUMPTION_ID` provenance on the ledger-baseline path (`ledger-baseline-model.ts:1146-1150`) — reuse this precedent. `material-inference.ts`'s LPD (line 112) is NOT fact-wrapped — that is the gap D-04 targets. |
| PHYS-04 | Same building, same retrofit result from twin and diagnostics | `retrofit-bridge.ts` has no PV measure and a different (area-weighted vs arithmetic-mean) wall-U formula than `use-retrofit-scenario.ts`/`retrofit-delta.ts` — both confirmed by reading both files in full. Convergence per D-13 means making `retrofit-bridge.ts` call `computeRetrofitDelta` instead of re-deriving. |
| PHYS-05 | Seven published datasets regenerated, schema version raised, changelog entry | Datasets are computed live per-request (`energy-dataset-server.ts:19-49`), not batch-generated — "regeneration" is a verification step, not a script run. `L-GRADE-SHARES`/`L-SITE-TOTAL` text (`energy-dataset.ts:66-67`) must be rewritten in place. **No established changelog location exists for this dataset family** — `public/releases/CHANGELOG.md` is scoped to a different, superseded product (see below). |

</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

- Tech stack (Next.js 16.2, React 19.2, TypeScript, Zustand 5, Vitest 4, Playwright) is established and not under review this milestone.
- `createEnergyFact` throws unless a fact cites sources, names an assumption, or is explicit user input — no convenience helper may attach a source reference to a defaulted value. This directly governs D-04, D-12, D-14, D-20's setpoint disclosures.
- The register's four `data.go.kr` endpoints fail independently — never require all four. Not directly triggered by this phase's edits, but any new code touching ledger-derived inputs must preserve this.
- Functions touching data.go.kr/VWorld are pinned to `icn1` (Seoul) in `vercel.json`. Not applicable to this phase's pure `src/lib/energy/*` edits (no new API routes), but note if planning adds any.
- No `.mjs`/`tsx` script toolchain exists in this repo for running TypeScript outside the Next.js build (confirmed absent from `package.json` dependencies) — any batch-style verification script for this phase must run inside the existing Vitest/Node test harness, not a new bare script importing `@/lib/*`.
- "The label lies while the number is right" — every UI string that explains one of this phase's numbers (`UNPRICED_REASONS` in `retrofit-delta.ts`, the notes array in `retrofit-bridge.ts`, `L-GRADE-SHARES`/`L-SITE-TOTAL` in `energy-dataset.ts`) must be re-derived to match the new physics, not left with old wording next to a new number.
- Bare `pnpm` fails on this machine; invoke binaries directly (`node node_modules/typescript/bin/tsc`, etc. — see Validation Architecture below, all confirmed runnable this session).

## Standard Stack

No new external package is introduced by this phase — it is an internal refactor of an existing pure TypeScript engine plus wiring changes. `## Package Legitimacy Audit` is therefore not applicable; no dependency additions are recommended.

### Existing internal modules this phase must reuse (not reinvent)

| Module | Location | Role in this phase |
|--------|----------|---------------------|
| `USE_CODE_OPERATING_HOURS` / `getOperatingHours` | `src/lib/energy/equipment-specs.ts:126-140` | D-02's hours table. Currently `getOperatingHours` is a **private, non-exported** function used only by `inferEquipmentSpecs` (MEP equipment panel) — confirmed by reading the full file; it has no other callers. Exporting it is mechanical (add `export`), but it is a genuinely separate consumer today, so exporting it does not by itself wire anything — each of `use-retrofit-scenario.ts`, `retrofit-bridge.ts`, `energy-dataset.ts`, `retrofit-delta.ts` must be changed to call it instead of their own hardcoded `2_500`/`annualOperatingHours = 2_500` defaults. |
| `LIGHTING_DEFAULTS` | `src/lib/korean-building-codes.ts:174+` | Per-use-code LPD/lamp/control defaults, keyed by 주용도코드 (same keyspace as `USE_CODE_OPERATING_HOURS`, though the two tables are not cross-referenced today). |
| `calculateSolarPotential` | `src/lib/retrofit/solar-potential.ts:69-141` | D-10's extraction source. Contains the "sixth positional argument" hazard (documented in its own JSDoc, `:75-80`) — `geometricKWp` is argument 6, after `electricityPrice` (argument 5); passing it in slot 5 silently prices at that number per kWh with no type error. |
| `resolveLedgerWeatherSource` | `src/lib/energy-diagnostics/ledger-climate.ts:60-87` | D-18's refuse-rather-than-guess precedent, and the source of the `token` field that is a byte-exact match (verified, both tables read in full) for `REGIONAL_IRRADIANCE` keys once lowercased. |
| `assumptionFact` / `createEnergyFact` | `src/lib/energy-diagnostics/facts.ts` (via `ledger-baseline-model.ts:48,142-149`) | D-04/D-12/D-20's disclosure mechanism precedent. Already used for `lightingPowerDensityWPerSqm` on the ledger-baseline path. |
| `SystemRatioProvenance` discriminated union | `src/lib/energy/system-breakdown.ts:73-104` | An existing, working precedent for exactly the "named default vs. sourced value" pattern D-07's discretion item ("how end-use provenance is represented") needs — `{ source: "use_code" }` vs `{ source: "generic_default"; assumption: string }`. Reusable as a pattern, though `system-breakdown.ts` itself needs to change (see below), not just be copied from. |

## Package Legitimacy Audit

Not applicable — this phase adds no new external dependency. No `npm install` verification is required.

## Architecture Patterns

### System Architecture Diagram — the fuel-split / grade / site-intensity chain today

```
                    ┌─────────────────────────────────────────────┐
                    │   MaterialProperties (LPD, PV capacity,      │
                    │   fuelType, ...) — client Zustand store OR   │
                    │   ledger-baseline CanonicalEnergyModel        │
                    └───────────────┬───────────────┬─────────────┘
                                    │               │
                    calculateHeatLoss/AnnualDemand  │
                                    │               │
                 ┌──────────────────┴──┐    ┌───────┴────────────────┐
                 │  demand: {heating,  │    │  calculateSystemBreakdown│
                 │  cooling, total}    │    │  (SYSTEM_RATIOS by      │
                 └──────────┬──────────┘    │  주용도코드, NOT linked  │
                             │               │  to deliveredFromDemand)│
                 deliveredFromDemand(demand) └───────────┬────────────┘
                 electric = cooling+.15*total            │
                 gas = heating+.10*total                 │
                 renewable = 0  (THE GATE)                │ .total
                             │                            │
                 calculatePrimaryEnergy                   │
                             │                            ▼
                 calculateEfficiencyRating         siteTotal (kWh/yr)
                     │            │                        │
                grade         primaryEnergyPerArea    energy-cards.tsx:194
                     │            │                   siteTotal/floorArea
                     ▼            ▼                        │
              rendered grade  rendered primary        rendered "site
              (moves iff       intensity (moves        energy intensity"
              lighting/PV      iff lighting/PV         (does NOT move on
              reach the        reach the split)        lighting/PV today —
              split)                                   separate code path)
                                                              │
                                                     report-stage.tsx:200-202
                                                     calibrateEnergy() against
                                                     real meter data — ALSO
                                                     reads the disconnected
                                                     breakdown.lighting figure
```

This diagram is the concrete evidence for the Summary's central finding: two arrows leave `demand`, one through `deliveredFromDemand` (grade path) and one through `calculateSystemBreakdown` (site-intensity + calibration path), and they do not talk to each other. Fixing only the first arrow satisfies half of D-03.

### Diagnostics vs. twin retrofit-economics paths (PHYS-04)

```
TWIN PATH                                  DIAGNOSTICS PATH
useRetrofitScenario (client hook)          analyzeRetrofitEconomics (pure)
  reads: material-store, scenario-store      reads: baselineRun.engineInput
  wallU: arithmetic mean over walls[]        wallU: area-weighted mean over walls[]
  → generateEnvelopeRetrofits                → generateEnvelopeRetrofits
  → generateHvacRetrofits                    → generateHvacRetrofits
  → generateLightingRetrofits                → generateLightingRetrofits
  → calculateSolarPotential (HAS PV)         → (NO PV MEASURE AT ALL — confirmed:
  → computeRetrofitDelta re-runs the           no import of calculateSolarPotential,
    FULL degree-day engine before/after         no region param in the function
    per measure, sets pricedByEngine by          signature)
    MEASURING whether output moved
                                             → hand-derives residualUsefulHeat from
                                               a post-hoc efficiency multiply,
                                               never re-runs the engine per measure
```

Both terminate in the same `envelope-retrofits.ts` / `hvac-retrofits.ts` / `lighting-retrofits.ts` generator functions and the same `computeFinancials`/DCF — the divergence is entirely upstream of those generators, in how each path arrives at its `wallU`/`avgWwr`/demand inputs, and in diagnostics' total absence of a PV measure.

### Recommended Project Structure (no new top-level directories needed)

```
src/lib/energy/
├── delivered-from-demand.ts   # signature change (D-05/D-07) — named end uses in
├── primary-energy.ts          # unchanged — already accepts/nets renewable correctly
├── system-breakdown.ts        # MUST change — lighting term currently independent
├── climate-data.ts            # gains regionalized coolingSeasonSolar/summerDesignTemp (D-20)
├── [new: pv-generation.ts?]   # D-10's extraction target (naming is Claude's discretion)
└── [new: climate-region.ts?]  # D-17's ClimateRegion value object (naming is Claude's discretion)
```

### Pattern: measuring `pricedByEngine` by re-running the engine, never by a hand-kept list

**What:** `retrofit-delta.ts`'s `computeRetrofitDelta` (`:608-625`) applies each measure id ALONE to the baseline materials, re-runs `runEnergyEngine`, and compares outputs (`runsAgree`) to decide `pricedByEngine`. It does not maintain a static list of "fields the engine reads."
**When to use:** This is the existing, working pattern D-07's structural requirement should extend to, rather than reinventing a provenance flag by hand. Once `deliveredFromDemand` honestly reads lighting/renewable, `runsAgree` will automatically flip `pricedByEngine` to `true` for LED/PV measures with **no changes needed to `retrofit-delta.ts`'s measurement logic itself** — only to the `UNPRICED_REASONS` map, whose entries for `lighting.lightingPowerDensity` and `renewable.solarPV.capacity` (`retrofit-delta.ts:218-233`) become dead (unreachable, since `change()` only attaches a reason when `pricedByEngine` is false) rather than wrong. This is a structurally safe consequence, not a live string that needs manual editing — but the two dead map entries should be removed as part of this phase's cleanup, since AGENTS.md's "the label lies while the number is right" applies to code comments that assert false things too (the JSDoc header of `retrofit-delta.ts:22-27` and `measure-claim.ts:57-63` explicitly name the 15%/`renewable: 0` gate and must be rewritten alongside the fix).
**Example (existing code, read in full):**
```typescript
// Source: src/lib/retrofit/retrofit-delta.ts:608-616
const measures: RetrofitMeasureEffect[] = ids.map((id) => {
  const unrecognized = !isKnownMeasureId(id);
  const soloMaterials = applyPhaseToMaterials(materials, "retrofit", [id], context);
  const solo = runEnergyEngine(soloMaterials, recipe, climate);
  const priced = !runsAgree(before, solo);
  // ...
});
```

### Anti-Patterns to Avoid

- **A third economics/energy computation path.** The pre-existing `.planning/research/ARCHITECTURE.md` (project-level research, same date, written before CONTEXT.md's decisions were locked) already names this: if the diagnostics path's missing PV measure or `wallU` formula proves awkward to converge, the temptation is a corpus- or diagnostics-specific third derivation. D-13 forecloses this explicitly — converge onto one shared core, make both existing paths thin adapters.
- **Preserving the "additive, backward-compatible" signature shape from the earlier project-level research.** `.planning/research/ARCHITECTURE.md`'s Q2 (written before phase discussion) recommended an **additive-only** change (`lightingDemandKwh?: number` optional field, falling back to the old `totalDemand * 0.15` ratio when absent) specifically to avoid touching ~380 tests. **D-07 explicitly supersedes this recommendation**: "no ratio arithmetic survives inside the function" and "a reviewer must be able to see the impossibility from the signature" rule out keeping a `?? totalDemand * 0.15` fallback inside `deliveredFromDemand` itself. The planner should treat the additive-fallback shape in the older research file as **superseded design**, not a template — CONTEXT.md's locked decision governs.
- **Fixing `deliveredFromDemand` and calling PHYS-01/03 satisfied without touching `calculateSystemBreakdown`.** See Summary — this leaves the on-screen site-intensity figure and the meter-calibration figure silently disagreeing with the grade.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| kWp → annual kWh generation | A second PV-generation formula inside `src/lib/energy/` | Extract `solar-potential.ts:90-91`'s existing formula (D-10) | Two formulas computing the same physical quantity is exactly the "two model registries" / "two economics paths" failure pattern this codebase has already hit twice |
| Lighting kWh from LPD | A new formula in `deliveredFromDemand` | `use-retrofit-scenario.ts:431-432`'s existing `(LPD × totalFloorArea × annualOperatingHours) / 1000`, already validated and matching `generateLightingRetrofits`' saving formula (`lighting-retrofits.ts:33-34`) | The formula already exists in two places and agrees; a third independent derivation risks a fourth disagreement |
| Named-assumption disclosure for a defaulted value | A convenience wrapper that attaches a source reference to a defaulted number (explicitly forbidden by AGENTS.md) | `assumptionFact`/`createEnergyFact` (`ledger-baseline-model.ts:142-149`), already used for `lightingPowerDensityWPerSqm` | This is the exact mechanism whose bypass AGENTS.md calls out as "how the guarantee dies" |
| Region→irradiance mapping | A second lowercase-region lookup table for `ClimateRegion` | `SIDO_TOKENS[prefix].token.toLowerCase()`, verified byte-exact against all 17 `REGIONAL_IRRADIANCE` keys this session | Avoids a third keyspace where D-17 explicitly wants to collapse two down to one |
| Provenance discriminated union for a named-default fallback | A new ad hoc `{ source, assumption }` shape | `SystemRatioProvenance` pattern already in `system-breakdown.ts:73-76` | Working precedent in the same file family that needs to change anyway |

**Key insight:** almost every "don't hand-roll" item in this phase is "don't hand-roll a second implementation of something this codebase already computes correctly once" — the physics formulas are not missing, they are disconnected from the split that gates the grade.

## Common Pitfalls

### Pitfall 1: Fixing `deliveredFromDemand` without touching `calculateSystemBreakdown` (site intensity silently stays honest-looking but wrong)
**What goes wrong:** The grade moves (satisfies half of PHYS-01), the on-screen "site energy intensity" figure (`energy-cards.tsx:194`) and the meter-calibration figure (`report-stage.tsx:200-202`) do not, because they read `breakdown.lighting`/`breakdown.total` from the untouched `calculateSystemBreakdown`.
**Why it happens:** `calculateSystemBreakdown` has its own complete, independently-provenanced lighting derivation (`SYSTEM_RATIOS`) that looks finished and already has honest disclosure machinery (`SystemRatioProvenance`) — it is easy to read it as "already correct" and skip it.
**How to avoid:** Verify D-03 by checking BOTH `useEnergyMetrics().primaryEnergyPerArea` and `useEnergyMetrics().siteTotal / floorArea` move on the same lighting-measure test case.
**Warning signs:** A test that only asserts on `rating.primaryEnergyPerArea` or `grade` after an LED/PV change, never on `siteTotal`/`breakdown.lighting`.

### Pitfall 2: Converging the two economics paths onto a shared core without first giving diagnostics a PV measure
**What goes wrong:** D-15's contract test compares measure IDs, kWh, grade delta and financials. If diagnostics has zero PV measures and the twin has one, the two measure-id sets can never be equal, and the "shared core" refactor (D-13) will not by itself make the contract test pass — a genuinely new measure-generation call must be added to whatever adapter `retrofit-bridge.ts` becomes.
**Why it happens:** The pre-CONTEXT.md project-level research (`.planning/research/ARCHITECTURE.md`, Q3) frames the diagnostics-path problem as "two different `wallU` formulas" and recommends converging on `computeRetrofitDelta` — true, but incomplete, since it does not surface the "diagnostics has no PV measure at all" gap (confirmed this session by reading `retrofit-bridge.ts` in full: no `calculateSolarPotential` import, no `region` parameter).
**How to avoid:** Before writing the D-15 contract test, list both paths' full measure-id sets for a fixture building and diff them — PV will be the first, most obvious gap.
**Warning signs:** A contract test that only checks financials/kWh equality for measure ids that exist on BOTH sides today (envelope, HVAC, lighting) — silently excluding PV because "diagnostics doesn't have it yet" would defeat D-15's purpose.

### Pitfall 3: Assuming PHYS-05 needs a batch regeneration script
**What goes wrong:** Time is spent building a `scripts/regenerate-datasets.mjs` that does not need to exist, because `loadReferenceEnergyDataset` (`energy-dataset-server.ts:19-49`) computes the dataset live per request from committed static `manifest.json`/`energy-inputs.ts` files plus the current code — there is no static energy-dataset JSON artifact under `public/reference-buildings/<id>/` to regenerate (confirmed by directory listing: only `manifest.json`, `roof-planes.json`, `spaces.json`, `openings.json`, and `.glb`/`.svg` geometry files exist per building — no `energy-dataset.json` or similar).
**Why it happens:** PHYS-05's wording ("regenerated... with a raised schema version") reads like a batch/ETL requirement, and the sibling `public/releases/` directory (a genuinely batch-generated, static-file product for a different, superseded milestone) reinforces that impression.
**How to avoid:** Confirm live-computation by reading `energy-dataset-server.ts` before scoping PHYS-05 work; the actual work is (a) bump `ENERGY_DATASET_SCHEMA_VERSION`, (b) rewrite `L-GRADE-SHARES`/`L-SITE-TOTAL` text in place, (c) verify each of the seven datasets' live output actually changed as physics-correctness predicts (a fixture/snapshot test, not a script), (d) write the changelog entry somewhere — see Pitfall 4.
**Warning signs:** A plan task titled "run the corpus/dataset regeneration script" for this phase — no such script exists yet, and building one is out of this phase's stated scope (Phase 4 territory per REQUIREMENTS.md SWEEP-02).

### Pitfall 4: Writing PHYS-05's changelog entry into `public/releases/CHANGELOG.md` without checking what that file already documents
**What goes wrong:** `public/releases/CHANGELOG.md` (read in full) is exclusively the changelog for the v7.0 "Portfolio Prediction Data Product" (`portfolio-xgb` model family, feature schema `1.0.0`, `public/releases/v0.1.0/`) — a different, explicitly superseded product (per REQUIREMENTS.md Out of Scope: "The old v6.0 audit deliverables and v7.0 prediction plans... Superseded 2026-09-15"). It has never mentioned the seven reference buildings or `ENERGY_DATASET_SCHEMA_VERSION`. Appending a physics-fix entry there would misfile the changelog under an unrelated, dead product's release history.
**Why it happens:** CONTEXT.md's canonical_refs lists this exact path as "where the regeneration is recorded" — reasonable to take at face value without opening the file.
**How to avoid:** The planner must make an explicit decision (new file under `src/lib/reference-buildings/` or `docs/`, or a new top-level section within `public/releases/CHANGELOG.md` clearly separated from the portfolio-prediction entries) rather than silently appending.
**Warning signs:** A changelog entry that reads naturally next to `portfolio-xgb`/`MAPE: 8.4%` language but describes a completely unrelated schema (`ENERGY_DATASET_SCHEMA_VERSION`).

### Pitfall 5: The `calculateSolarPotential` sixth-positional-argument hazard reappearing during the D-10 extraction
**What goes wrong:** `calculateSolarPotential(roofArea, roofType, region, feedInTariffRate, electricityPrice, geometricKWp)` — `geometricKWp` is argument 6. The function's own JSDoc (`solar-potential.ts:75-80`) already documents that passing it as argument 5 silently prices the system per kWh at that number and leaves sizing on the ratio path, with **no type error**. Extracting the generation-only arithmetic (D-10) is an opportunity to eliminate this hazard (e.g. an options object), but doing the extraction mechanically (copy-pasting the same positional signature into the new home) preserves the hazard in a second location.
**How to avoid:** When extracting, prefer a named-parameter/options-object signature for the new `src/lib/energy/` function, even though `solar-potential.ts`'s own wrapper (kept for its cost/DCF fields per D-10 — "extraction, not a reimplementation") may keep its existing positional signature for backward compatibility with its own callers.
**Warning signs:** A new call site passing five or six positional numeric arguments to the extracted function.

## Runtime State Inventory

Not applicable — this is a pure code/logic refactor phase (fuel-split arithmetic, region resolution, retrofit economics convergence). No rename, rebrand, or migration of external identifiers, stored data keys, OS-registered state, or secrets is involved.

- **Stored data:** None — no database, no persisted collection/user-id renamed. `MaterialProperties` in Zustand `material-store` keeps its existing field names (`lighting.lightingPowerDensity`, `renewable.solarPV.capacity`); this phase changes how those values are *used*, not their keys.
- **Live service config:** None — no external service configuration changes.
- **OS-registered state:** None.
- **Secrets/env vars:** None — no new env var or secret key introduced.
- **Build artifacts:** None — no package rename, no `pyproject.toml`/`package.json` identifier change.

## Package Legitimacy Audit

(Repeated per template — see above: not applicable, no new packages.)

## Code Examples

### The formula D-01 needs to route into the split (already validated, already in production)

```typescript
// Source: src/hooks/use-retrofit-scenario.ts:431-432 (read in full this session)
const lightingDemand =
  (materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000;
```

### The saving formula the LED measure already computes (matches D-01's target shape)

```typescript
// Source: src/lib/retrofit/lighting-retrofits.ts:33-34 (read in full this session)
const annualEnergySaving =
  ((currentLPD - targetLPD) * floorArea * annualOperatingHours) / 1000;
```

### The renewable-netting logic that already exists and needs no change (D-11's cap)

```typescript
// Source: src/lib/energy/primary-energy.ts:62-77 (read in full this session)
// On-site renewable generation substitutes grid electricity: net it
// against the electric leg BEFORE applying the 2.75 factor (capped so a
// large PV array cannot drive electric consumption negative).
const reUsed = Math.min(re, delivered.electric);
const electricNet = delivered.electric - reUsed;
// ...
const primaryRenewable =
  reUsed > 0 ? -reUsed * PRIMARY_ENERGY_FACTORS.renewable : 0;
```
D-11 requires the **clipped** amount (`re - reUsed`, currently computed nowhere) to be reported explicitly rather than silently discarded — this is a genuinely new field, not present in `PrimaryEnergyBreakdown` today (verified: the interface has no "clipped"/"curtailed" field).

### The refusal precedent D-18 generalizes

```typescript
// Source: src/lib/energy-diagnostics/ledger-climate.ts:60-87 (read in full this session)
export function resolveLedgerWeatherSource(
  input: Readonly<{ sigunguCd?: string; platPlcNm?: string; newPlatPlc?: string }>,
): LedgerWeatherResolution | null {
  // ... returns null when neither sigunguCd prefix nor address token matches —
  // never a national-mean fallback.
}
```

### The region-token / irradiance-key correspondence (verified this session, both tables read in full)

`SIDO_TOKENS` (`ledger-climate.ts:19-39`) tokens, lowercased, are byte-identical to every key in `REGIONAL_IRRADIANCE` (`solar-potential.ts:19-24`): `seoul, busan, daegu, incheon, gwangju, daejeon, ulsan, sejong, gyeonggi, gangwon, chungbuk, chungnam, jeonbuk, jeonnam, gyeongbuk, gyeongnam, jeju` — 17 entries each, exact match (both the old `45` and new `52` 전라북도 codes map to the single token `"Jeonbuk"`, which still matches `REGIONAL_IRRADIANCE["jeonbuk"]`). The `ClimateRegion` value object (D-17) can derive its irradiance key as `token.toLowerCase()` with no new mapping table.

### The seven `useRetrofitScenario` call sites and their region-relevant scope (all read this session)

| Call site | `sidoPrefix` source already in scope | `region` passed today |
|-----------|----------------------------------------|------------------------|
| `src/components/generative/energy-panel.tsx:125` | `scenarioInputs.sidoPrefix` | No |
| `src/components/reference-building/reference-retrofit.tsx:180` | `climate.sigunguCd.slice(0, 2)` | No |
| `src/components/report/report-stage.tsx:160` | `scenarioInputs.sidoPrefix` (conditional on `scenarioApplies`) | No |
| `src/components/twin/energy-instrument-hud.tsx:157` | `sidoPrefix` prop (component-level, already required) | No |
| `src/components/workspace/equipment-info-panel.tsx:73` | `publishedInputs.sidoPrefix` | No |
| `src/components/workspace/equipment-insight-card.tsx:54` | `publishedInputs.sidoPrefix` | No |
| `src/components/workspace/scene-outliner.tsx:130` | `publishedInputs.sidoPrefix` | No |

Five of the seven read `sidoPrefix` from `scenario-store`'s `ScenarioBuildingInputs.sidoPrefix` (`scenario-store.ts:32`, published once via `setBuildingInputs`) — confirming D-19's "resolve once at the payload boundary" can attach to that exact existing field rather than requiring new prop-drilling. Extending `ScenarioBuildingInputs` with the resolved `ClimateRegion` object (or deriving `region` from its existing `sidoPrefix` at each of the seven call sites) is mechanical either way.

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat 15%/10% ratio, `renewable: 0` in `deliveredFromDemand` | Named end uses (`hvac`, `lighting`, `dhw`, `plug`) mapped by `fuelType` | This phase (D-05/D-07) | Grade and primary intensity become sensitive to lighting/PV measures |
| Two disjoint region keyspaces (시도 digits for climate, lowercase English for irradiance) | One `ClimateRegion` value object resolved once | This phase (D-17) | Every climate/irradiance consumer reads one object; region wiring becomes possible at all seven call sites |
| Diagnostics' own `wallU`/`avgWwr` re-derivation, no PV measure | Thin adapter over `computeRetrofitDelta`, PV measure added | This phase (D-13) | PHYS-04 contract test becomes writable |

**Deprecated/outdated:**
- The pre-CONTEXT.md `.planning/research/ARCHITECTURE.md`'s Q2 "additive, not replacing" signature recommendation for `deliveredFromDemand` — superseded by D-07's structural requirement. Do not use that file's proposed `DemandLike` shape as a template.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The planner will need to decide a new home for PHYS-05's changelog entry, since `public/releases/CHANGELOG.md` is scoped to the superseded v7.0 product | Common Pitfalls / Summary | Low — this is a documented gap requiring a decision, not a claim about physics; worst case is a changelog entry filed in a file that reads confusingly next to unrelated content |
| A2 | `getOperatingHours`/`USE_CODE_OPERATING_HOURS` exporting is "mechanical" and involves no behavior change to `inferEquipmentSpecs` | Standard Stack table | Low — verified by reading the whole function; only risk is a future edit to the exported function's behavior inadvertently affecting the MEP equipment panel, which is out of this phase's scope but shares the function |
| A3 | The `SIDO_TOKENS`/`REGIONAL_IRRADIANCE` key correspondence will remain a reliable mapping basis (no `[VERIFIED]` claim about whether MOTIE/KEMCO regard these irradiance figures as current — they are engineering constants already in production, unchanged by this phase) | Code Examples | Low — this phase does not touch the irradiance *values*, only how the *key* reaches them |

**If this table is empty:** N/A — three low-risk process assumptions logged above; no physics-value assumption in this research is unverified against source code.

## Open Questions

1. **Does `calculateSystemBreakdown`'s lighting term get replaced entirely, or reconciled with `deliveredFromDemand`'s new named-end-use lighting figure?**
   - What we know: both currently derive lighting independently; D-03 requires site intensity (which reads `calculateSystemBreakdown.total`) to move on a lighting change.
   - What's unclear: whether the plan should make `calculateSystemBreakdown` call the same lighting-kWh computation `deliveredFromDemand` now takes as an input (likely the cleaner fix, since both would then agree by construction), or whether `SYSTEM_RATIOS`-based hvac/dhw/plug splitting must be preserved for some other consumer this research did not find.
   - Recommendation: the planner should grep for every other consumer of `SystemBreakdown.hvac`/`.dhw`/`.plugLoads` (not just `.lighting`) before deciding whether the whole function is replaced or only its lighting field is patched to agree.

2. **Where does the D-15 contract test's realistic fixture come from?**
   - What we know: `retrofit-delta.test.ts` already has a working fixture pattern (`makeMaterials()`, `makeRecipe()`, hand-composed engine comparison) that could be extended; `retrofit-bridge.ts` currently reads from `CompiledDegreeDayInput.payload` which has a different shape than the twin's raw `MaterialProperties`/`BuildingRecipe`/`ClimateData`.
   - What's unclear: whether a single shared fixture building can be constructed that is valid input to BOTH `useRetrofitScenario`'s hook-shaped inputs and `analyzeRetrofitEconomics`'s `DegreeDaySimulationRun`-shaped input, without a large adapter-construction cost inside the test itself.
   - Recommendation: research this concretely during planning by reading `CompiledDegreeDayInput`'s full type (`src/lib/energy-diagnostics/adapter.ts`, not read this session) alongside `MaterialProperties`/`BuildingRecipe`.

3. **Does `L-CLIMATE`'s limitation text (`energy-dataset.ts:64`, "The climate is the explicitly assumed engine climate... not a weather series for the IFC's declared site") need updating alongside `L-GRADE-SHARES`/`L-SITE-TOTAL` once D-20 regionalizes `coolingSeasonSolar`/`summerDesignTemp`?**
   - What we know: `L-CLIMATE`'s ID is not named in D-08's "keep these IDs" list, so it may not be protected the same way, but its text describes exactly the climate assumption this phase partially removes.
   - What's unclear: whether `L-CLIMATE`'s text remains accurate after D-20 (climate becomes partially regionalized, partially still national/assumed for setpoints) or needs its own in-place rewrite.
   - Recommendation: the planner should re-read `L-CLIMATE`'s exact wording against the post-D-20 state before finalizing which limitation IDs get rewritten.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TypeScript compiler | `tsc --noEmit` verification | ✓ (confirmed this session) | 5.9.3 | — |
| Vitest | Unit test verification | ✓ (confirmed this session) | 4.1.2 | — |
| Playwright | E2E verification | ✓ (confirmed this session) | 1.58.2 | — |
| ESLint | Lint verification | Assumed present (per AGENTS.md command; not separately version-checked this session) `[ASSUMED]` | — | — |

No external service dependency (data.go.kr, VWorld) is introduced or touched by this phase's edits — all changed modules are pure, offline, `src/lib/energy/*` / `src/lib/retrofit/*` functions and the client hooks/components that call them.

**Missing dependencies with no fallback:** None found.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (confirmed installed) |
| Config file | `vitest.config.ts` |
| Quick run command | `node node_modules/vitest/vitest.mjs run src/lib/energy` (scope to the changed directory; Vitest accepts a path/glob positional filter) |
| Full suite command | `node node_modules/vitest/vitest.mjs run` |

Per AGENTS.md, bare `pnpm`/`pnpm exec` must not be used on this machine — invoke `node node_modules/<pkg>/...` directly, exactly as shown.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHYS-01 | LED measure moves grade AND site intensity | unit | `node node_modules/vitest/vitest.mjs run src/hooks/__tests__/use-energy-metrics.test.tsx` | ✅ exists, needs new assertions on `siteTotal` moving, not just `grade` |
| PHYS-02 | PV measure moves primary energy and grade | unit | `node node_modules/vitest/vitest.mjs run src/lib/retrofit/__tests__/retrofit-delta.test.ts` | ✅ exists, needs a case exercising a `pvRoofType*` measure id and asserting `pricedByEngine: true` |
| PHYS-03 | Unknown LPD/PV renders as a named assumption | unit | New test against `material-inference.ts`'s LPD fact-wrapping (does not exist yet) | ❌ Wave 0 gap — `material-inference.ts`'s LPD is not currently fact-wrapped at all |
| PHYS-04 | Twin and diagnostics agree on measure ids/kWh/grade/financials for the same building | unit (contract test, build-failing per D-15) | New test, e.g. `src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` | ❌ Wave 0 gap — does not exist; this is D-15's literal requirement |
| PHYS-05 | Seven datasets regenerate under corrected physics, schema bumped, changelog recorded | unit (dataset snapshot) + manual (changelog) | `node node_modules/vitest/vitest.mjs run src/lib/reference-buildings` | ✅ `klassiqua-office-1970.test.ts`/`kit-office-energy.test.ts` exist and directly assert `calculateEfficiencyRating(deliveredFromDemand(demand), ...)` output — these WILL need their hard-coded expected numbers updated, this is expected breakage, not a regression (see Common Pitfalls / AGENTS.md "the label lies" discipline: read each failure's intent before patching) |

### Sampling Rate
- **Per task commit:** `node node_modules/vitest/vitest.mjs run <changed-directory>`
- **Per wave merge:** `node node_modules/vitest/vitest.mjs run` (full suite — this phase's signature change touches 8 test files directly by import and an unknown-but-bounded number transitively through `use-energy-metrics`/`retrofit-delta`/`energy-dataset`, so a full-suite run at wave merge is required, not optional)
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS `node node_modules/typescript/bin/tsc --noEmit` clean (the D-05/D-07 signature change is exactly the kind of change `tsc` catches at every call site — see Verification Commands below)

### Wave 0 Gaps
- [ ] `src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` (or similar) — D-15's build-failing contract test does not exist yet
- [ ] A test asserting `material-inference.ts`'s LPD is disclosed as an assumption (PHYS-03) — no existing test covers this non-ledger inference path
- [ ] A test asserting `useEnergyMetrics().siteTotal` (not just `.grade`/`.primaryEnergyPerArea`) moves on a lighting change — closes the Pitfall 1 gap

*(Framework install: none needed — Vitest, Playwright, TypeScript, ESLint all already present per Environment Availability.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase touches no auth surface |
| V3 Session Management | No | No session state introduced |
| V4 Access Control | No | No new access-controlled resource |
| V5 Input Validation | Marginal | `deliveredFromDemand`'s new named end-use inputs should still guard against `NaN`/negative values the way the current function implicitly does via plain arithmetic — no new external input surface, all inputs originate from already-validated internal `MaterialProperties`/`AnnualDemand` types |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

None specific to this phase — it is a pure computation refactor with no new network-facing surface, no new user input path, and no new persisted data. The `data.go.kr`/VWorld-facing routes and the `icn1` region pin are unaffected (no new API route is added).

## Sources

### Primary (HIGH confidence — read in full or with substantial context this session)
- `src/lib/energy/delivered-from-demand.ts` (full)
- `src/lib/energy/primary-energy.ts` (full)
- `src/lib/energy/system-breakdown.ts` (full)
- `src/lib/compliance/efficiency-rating.ts` (full)
- `src/lib/energy/energy-grade.ts` (full)
- `src/hooks/use-energy-metrics.ts` (full)
- `src/hooks/use-retrofit-scenario.ts` (full)
- `src/lib/energy-diagnostics/retrofit-bridge.ts` (full)
- `src/lib/retrofit/retrofit-delta.ts` (full)
- `src/lib/retrofit/solar-potential.ts` (full)
- `src/lib/retrofit/lighting-retrofits.ts` (full)
- `src/lib/retrofit/measure-claim.ts` (partial, lines 45-75)
- `src/lib/energy-diagnostics/ledger-climate.ts` (full)
- `src/lib/energy/climate-data.ts` (full)
- `src/lib/energy/equipment-specs.ts` (lines 1-230)
- `src/lib/material-inference.ts` (lines 80-150)
- `src/lib/energy-diagnostics/ledger-baseline-model.ts` (grep + targeted context around `assumptionFact`/`createEnergyFact`)
- `src/lib/reference-buildings/energy-dataset.ts` (lines 1-110)
- `src/lib/reference-buildings/energy-dataset-server.ts` (full)
- `src/store/scenario-store.ts` (full)
- `public/releases/CHANGELOG.md` (full)
- `public/reference-buildings/*` and `public/releases/*` directory listings (via `find`)
- All seven `useRetrofitScenario` call sites: `energy-panel.tsx`, `reference-retrofit.tsx`, `report-stage.tsx`, `twin/energy-instrument-hud.tsx`, `workspace/equipment-info-panel.tsx`, `workspace/equipment-insight-card.tsx`, `workspace/scene-outliner.tsx` (grep-scoped reads)
- `src/lib/energy/__tests__/delivered-from-demand.test.ts` (full)
- `src/lib/retrofit/__tests__/retrofit-delta.test.ts` (lines 190-230)
- `.planning/phases/01-honest-physics/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` (full, required reading)
- `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md` (full, required reading)
- `package.json` scripts section (confirms `vitest run`/`playwright test` invocation shape)
- Direct tool version checks: `node node_modules/typescript/bin/tsc --version` → 5.9.3; `node node_modules/vitest/vitest.mjs --version` → 4.1.2 (win32-x64, node v24.19.0); `node node_modules/@playwright/test/cli.js --version` → 1.58.2

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` and `.planning/research/PITFALLS.md` — project-level research generated the same day (2026-09-15), before CONTEXT.md's phase-specific decisions were locked. Used as a cross-check and explicitly flagged where its Q2 recommendation (additive `deliveredFromDemand` signature) is **superseded** by D-07's structural requirement.

### Tertiary (LOW confidence / unverified)
- Whether ESLint's exact version matches what AGENTS.md's command implies — not separately checked this session; assumed present given `eslint.config.mjs` exists in the repo per `.claude/CLAUDE.md`'s own Technology Stack listing.
- `CompiledDegreeDayInput`'s exact shape (`src/lib/energy-diagnostics/adapter.ts`) was referenced but not read this session — flagged as Open Question 2 for the planner to resolve before designing the D-15 contract test fixture.

## Metadata

**Confidence breakdown:**
- Standard stack / architecture: HIGH — every claim traces to a file:line read this session, including two negative claims explicitly verified by reading whole files (`system-breakdown.ts` does not import `delivered-from-demand`; `retrofit-bridge.ts` does not import `calculateSolarPotential`).
- Blast radius (D-05/D-07): HIGH for production call sites (5 confirmed via grep + spot-read: `report-stage.tsx:263`, `properties-panel.tsx:243`, `use-energy-metrics.ts:104`, `retrofit-delta.ts:278`, `energy-dataset.ts:89`) and test files (8 confirmed via grep, not 6 as CONTEXT.md states — see discrepancy note below). MEDIUM for the exact shape of every downstream ripple (e.g., whether `report-stage.tsx`'s `calibrateEnergy` call needs its own edit beyond what `calculateSystemBreakdown`'s fix provides) — flagged as Open Question 1.
- Pitfalls: HIGH — five pitfalls, each grounded in a specific file:line contradiction or gap found by reading source, not inferred from documentation.
- Validation architecture: HIGH — all four CLI tools confirmed runnable this session with exact version output.

**Discrepancy note:** CONTEXT.md's code_context states "Six test files construct its input directly." This research's grep of `deliveredFromDemand` imports across `src/**/__tests__/*` found **eight**: `retrofit-delta.test.ts`, `klassiqua-office-1970.test.ts`, `kit-office-energy.test.ts`, `energy-seed-physics.test.ts`, `grade-table-by-use.test.ts`, `delivered-from-demand.test.ts`, `use-energy-metrics.test.tsx`, `grade-basis.test.ts`. The planner should treat eight as the confirmed count for this phase's test-blast-radius estimate.

**Research date:** 2026-09-15
**Valid until:** 30 days (stable internal codebase, no external API/library version dependency introduced by this phase)
