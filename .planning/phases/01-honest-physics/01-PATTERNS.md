# Phase 1: Honest Physics - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** ~14 direct edit targets (per CONTEXT.md canonical_refs + RESEARCH.md blast-radius) plus 2 new modules
**Analogs found:** 6 / 8 categories (2 explicit "no analog found")

**Orientation:** This is a brownfield refactor. Almost every file below is MODIFIED, not created, and its "analog" is its own current shape — the executor's job is to preserve the surrounding conventions (header comment, purity discipline, provenance idiom) while changing the load-bearing logic named in CONTEXT.md's decisions. Two genuinely new files exist (D-10's extraction target, D-17's `ClimateRegion`); their analogs are sibling files in the same directory, read in full below.

## File Classification

| File | Status | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|-----------------|---------------|
| `src/lib/energy/delivered-from-demand.ts` | MODIFIED (signature change, D-05/D-07) | service (pure fuel-split) | transform | itself (current file, read in full) | exact — preserve header-comment convention, `DemandLike`-style named-input pattern |
| `src/lib/energy/system-breakdown.ts` | MODIFIED (D-03, lighting term) | service (pure ratio-attribution) | transform | itself (current file, read in full) — also see `SystemRatioProvenance` as the reusable provenance-union pattern | exact |
| `src/lib/energy/primary-energy.ts` | UNCHANGED per RESEARCH.md (renewable netting already correct) — only D-11's "clipped kWh" field is new | service (pure) | transform | itself | exact (additive field only) |
| `src/lib/energy/[new pv-generation module]` | NEW (D-10 extraction) | utility (pure arithmetic) | transform | `src/lib/retrofit/solar-potential.ts:69-141` (`calculateSolarPotential`, generation-only slice, lines 82-91) | role-match — same directory-convention analog is `delivered-from-demand.ts`'s own header style |
| `src/lib/energy/[new climate-region module]` | NEW (D-17 value object) | model/value-object (pure) | transform | `src/lib/energy-diagnostics/ledger-climate.ts:60-87` (`resolveLedgerWeatherSource`) | exact — same refuse-vs-guess contract, same 시도-code-then-address resolution shape |
| `src/lib/energy/equipment-specs.ts` | MODIFIED (export `getOperatingHours`, D-02) | utility (pure lookup) | transform | itself | exact — mechanical, add `export` |
| `src/lib/energy-diagnostics/ledger-baseline-model.ts` | MODIFIED (assumption-fact wrapping for lighting/PV/climate per D-04/D-12/D-20) | model (fact construction) | transform | itself — `assumptionFact` helper at lines 142-162 is the idiom to reuse verbatim | exact |
| `src/lib/material-inference.ts` | MODIFIED (D-04 — wrap inferred LPD in a fact; currently NOT fact-wrapped) | service (inference) | transform | `ledger-baseline-model.ts`'s `assumptionFact` (cross-file analog — `material-inference.ts` has no fact-wrapping today) | role-match, cross-file — no in-file precedent exists |
| `src/hooks/use-retrofit-scenario.ts` | MODIFIED (D-13 thin-adapter, D-21 region wiring) | hook (client, request-response over stores) | CRUD-like (reads stores, computes, returns) | itself — LPD formula already at lines 431-432 | exact |
| `src/lib/energy-diagnostics/retrofit-bridge.ts` | MODIFIED (D-13 thin-adapter, add PV measure per PHYS-04 gap) | service (pure adapter) | transform | `use-retrofit-scenario.ts` (the sibling path it must converge with) | role-match |
| `src/lib/retrofit/retrofit-delta.ts` | MODIFIED (shared core target of D-13; `pricedByEngine`/`runsAgree` machinery already correct per RESEARCH.md) | service (pure) | transform | itself, `computeRetrofitDelta` at lines 608-625 | exact |
| `src/lib/reference-buildings/energy-dataset.ts` | MODIFIED (D-08 — rewrite `L-SITE-TOTAL`/`L-GRADE-SHARES` text in place; bump schema version) | service (pure dataset builder) | transform | itself — `ENERGY_DATASET_LIMITATIONS` array at lines 60-68 | exact |
| `src/components/viewer/energy-cards.tsx` | MODIFIED (disclosure text must be re-derived, per AGENTS.md "label lies" rule) | component | request-response (renders computed metrics) | itself | exact |
| `src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` (or similar) | NEW (D-15 contract test) | test | transform (assertion) | **no analog found** — see below | none |

## Pattern Assignments

### `src/lib/energy/delivered-from-demand.ts` (service, transform) — MODIFY

**Analog:** itself, current state (full file read this session, reproduced above in Read output)

**Header-comment convention to preserve** (lines 1-5):
```typescript
// src/lib/energy/delivered-from-demand.ts
// P1-05 — the single shared fuel-split and building-type derivations.
// Previously report-stage, properties-panel, and (implicitly) the grade path
// each derived these independently; this module is now the only source.
// Pure functions — no React, no stores.
```
This module already documents itself as "the only source" for a prior consolidation (P1-05). The new D-05/D-07 signature change is a second consolidation of the same kind — the replacement header comment should extend this lineage (name the phase, name what was unified), not erase the P1-05 history.

**Current signature to replace** (lines 11-32):
```typescript
export interface DemandLike {
  heatingDemand: number; // kWh/yr delivered
  coolingDemand: number; // kWh/yr delivered
  totalDemand: number; // kWh/yr delivered
}

export function deliveredFromDemand(demand: DemandLike): DeliveredEnergy {
  return {
    electric: demand.coolingDemand + demand.totalDemand * 0.15,
    gas: demand.heatingDemand + demand.totalDemand * 0.1,
    districtHeating: 0,
    districtCooling: 0,
    renewable: 0,
  };
}
```
D-07's structural requirement ("no ratio arithmetic survives inside the function... visible from the signature") means the replacement input type must carry four named end uses (`hvac`/`lighting`/`dhw`/`plug`) each with `fuelType`, and the function body becomes a fuel-routing switch/reduce, not arithmetic on a bare total. `isResidentialOccupancy`/`buildingTypeForGrade`/`gradeTableIsFromOccupancy` (lines 39-93) are untouched by this phase and must keep working — do not reflow them into the new input shape.

---

### `src/lib/energy/system-breakdown.ts` (service, transform) — MODIFY

**Analog:** itself, current state (full file read)

**The independent ratio table D-03 requires reconciling** (lines 37-53, 158-204):
```typescript
export const SYSTEM_RATIOS: Record<string, {hvac:number;lighting:number;dhw:number;plug:number}> = {
  "01": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 },
  "02": { hvac: 0.50, lighting: 0.07, dhw: 0.25, plug: 0.18 },
  "07": { hvac: 0.45, lighting: 0.40, dhw: 0.03, plug: 0.12 },
  "14": { hvac: 0.55, lighting: 0.25, dhw: 0.10, plug: 0.10 },
};
const DEFAULT_RATIOS = { hvac: 0.42, lighting: 0.28, dhw: 0.12, plug: 0.18 };
...
const hvac = demand.totalDemand;
const totalFromHvac = ratios.hvac > 0 ? hvac / ratios.hvac : 0;
const lighting = totalFromHvac * ratios.lighting;
const dhw = totalFromHvac * ratios.dhw;
const plugLoads = totalFromHvac * ratios.plug;
const total = hvac + lighting + dhw + plugLoads;
```
This is the second, textually unconnected table RESEARCH.md's Summary identifies. Per D-03/Open Question 1, the planner must decide whether `lighting` here is replaced by the same LPD×area×hours computation feeding the new `deliveredFromDemand`, or reconciled — but `hvac`/`dhw`/`plugLoads`'s `SYSTEM_RATIOS` derivation should not be assumed dead without first grepping every consumer of those three fields (RESEARCH.md's explicit recommendation, not yet done this session).

**The provenance discriminated-union idiom to reuse for D-05's "named end-use provenance"** (lines 73-104):
```typescript
export type SystemRatioProvenance =
  | { source: "use_code"; useCodePrefix: string }
  | { source: "generic_default"; useCodePrefix: string; assumption: string };

function resolveSystemRatios(mainPurpsCd: string): {
  ratios: {...};
  provenance: SystemRatioProvenance;
} {
  const useCodePrefix = (mainPurpsCd ?? "").slice(0, 2);
  const matched = SYSTEM_RATIOS[useCodePrefix];
  if (matched) {
    return { ratios: matched, provenance: { source: "use_code", useCodePrefix } };
  }
  const shares = `냉난방 ${Math.round(DEFAULT_RATIOS.hvac * 100)} / 조명 ${Math.round(DEFAULT_RATIOS.lighting * 100)} / 급탕 ${Math.round(DEFAULT_RATIOS.dhw * 100)} / 기타 ${Math.round(DEFAULT_RATIOS.plug * 100)}%`;
  const assumption = useCodePrefix
    ? `주용도코드 "${useCodePrefix}"에 대한 용도별 에너지 비율 자료가 없어 일반 평균값(${shares})을 적용했습니다. 실측값이 아닌 가정입니다.`
    : `주용도코드가 없어 일반 평균값(${shares})을 적용했습니다. 실측값이 아닌 가정입니다.`;
  return { ratios: DEFAULT_RATIOS, provenance: { source: "generic_default", useCodePrefix, assumption } };
}
```
This exact "discriminated union where the generic-default branch is *forced* to carry a Korean-language `assumption` string built from the numbers themselves (never hand-typed, so it cannot drift from the values)" is the closest in-repo precedent for CONTEXT.md's open discretion item "how named end-use provenance is represented on the split's input type." Reuse the shape, not just the concept: a `source` discriminant field, and string interpolation of the actual ratio/value into the assumption text so a future edit to the number cannot silently leave the sentence wrong (directly serving AGENTS.md's "the label lies while the number is right" rule).

---

### `src/lib/energy/primary-energy.ts` (service, transform) — MODIFY (additive only)

**Analog:** itself. No signature change needed per RESEARCH.md — `calculatePrimaryEnergy` already nets renewable correctly (lines 62-77, reproduced in full above). D-11 requires only a new field reporting the clipped amount:
```typescript
const reUsed = Math.min(re, delivered.electric);
const electricNet = delivered.electric - reUsed;
```
`re - reUsed` (the clipped/curtailed kWh) is currently computed nowhere and is not present on `PrimaryEnergyBreakdown` (lines 25-32). Add it as a new named field on that interface, following the existing kWh/year comment-per-field convention already used there (e.g. `renewable: number; // kWh/year primary offset from renewables (≤ 0)`).

---

### New: kWp→kWh extraction module (D-10) — CREATE in `src/lib/energy/`

**Analog:** `src/lib/retrofit/solar-potential.ts:69-141` (`calculateSolarPotential`, full function read)

**The exact arithmetic to extract, generation-only** (lines 82-91):
```typescript
const roofUtilization = ROOF_UTILIZATION_FACTORS[roofType];
const usableArea = roofArea * roofUtilization;
const systemSizeKWp =
  geometricKWp != null && geometricKWp >= 0 ? geometricKWp : usableArea / M2_PER_KWP;

const peakSunHours = REGIONAL_IRRADIANCE[region.toLowerCase()] ?? DEFAULT_PEAK_SUN_HOURS;
const annualGenerationKWh =
  systemSizeKWp * peakSunHours * 365 * TILT_FACTOR * PERFORMANCE_RATIO;
```
`TILT_FACTOR = 1.15`, `PERFORMANCE_RATIO = 0.80`, `M2_PER_KWP = 5.0`, `ROOF_UTILIZATION_FACTORS` and `REGIONAL_IRRADIANCE` (lines 19-33) are the constants this extraction must carry or import — D-10 says extraction, not reimplementation, so these values must be identical, not re-derived. Per RESEARCH.md Pitfall 5, the new module's exported signature should NOT copy `calculateSolarPotential`'s six-positional-argument shape (the `geometricKWp`-in-slot-6 hazard is documented in that function's own JSDoc, lines 60-68, and should be closed by using a named-parameter/options object in the new home, while `solar-potential.ts`'s own wrapper may keep its positional signature for its existing callers).

**Header-comment convention to follow** (from `delivered-from-demand.ts:1-5`, the sibling file in the same target directory): a short comment naming the phase/decision, why the module exists, and "Pure functions — no React, no stores."

---

### New: `ClimateRegion` value object (D-17) — CREATE in `src/lib/energy/`

**Analog:** `src/lib/energy-diagnostics/ledger-climate.ts:60-87` (`resolveLedgerWeatherSource`, full function read)

**The refuse-rather-than-guess shape to copy exactly** (lines 51-87):
```typescript
export type LedgerWeatherResolution = Readonly<{
  weatherSource: string;
  sidoCode: string;
  ko: string;
  via: "sigunguCd" | "address";
}>;

export function resolveLedgerWeatherSource(
  input: Readonly<{ sigunguCd?: string; platPlcNm?: string; newPlatPlc?: string }>,
): LedgerWeatherResolution | null {
  const prefix = String(input.sigunguCd ?? "").trim().slice(0, 2);
  const byCode = SIDO_TOKENS[prefix];
  if (byCode) {
    return Object.freeze({ weatherSource: `KR-${byCode.token}-TMY`, sidoCode: prefix, ko: byCode.ko, via: "sigunguCd" as const });
  }
  const address = `${input.platPlcNm ?? ""} ${input.newPlatPlc ?? ""}`;
  const matched = ADDRESS_TOKENS.find(([token]) => address.includes(token));
  if (matched) { /* ... same shape, via: "address" */ }
  return null;
}
```
D-18's refusal contract ("emits no PV figure" on an unresolvable region) is this function's existing `return null` — the new `ClimateRegion` resolver should return `ClimateRegion | null` with the identical two-tier resolution order (시군구코드 prefix, then address token scan), and should reuse `SIDO_TOKENS` (lines 19-39) as its code→token table rather than inventing a third one — RESEARCH.md's Code Examples section already verified `SIDO_TOKENS[prefix].token.toLowerCase()` is byte-exact against every `REGIONAL_IRRADIANCE` key. `Object.freeze` on the returned object is this file's existing immutability convention and should carry over given `ClimateRegion` is a value object per D-17.

Note: `SIDO_TOKENS` itself lives in `ledger-climate.ts` (an `energy-diagnostics` file), not `src/lib/energy/`. D-17's `ClimateRegion` module living in `src/lib/energy/` will need to either import `SIDO_TOKENS` (check for cross-layer-direction issues — `energy-diagnostics` currently depends on `lib/energy`, not vice versa, per the Architectural Responsibility Map) or the table may need relocating/duplicating; this is a real open construction decision the planner should resolve, not a copy-paste analog issue.

---

### `src/lib/energy-diagnostics/ledger-baseline-model.ts` (model, transform) — MODIFY (assumption-fact wrapping)

**Analog:** itself — `assumptionFact` helper, full definition read (lines 142-162):
```typescript
function assumptionFact<T>(
  key: string,
  value: T,
  now: IsoDateTime,
  assumptionId: string,
  unit?: string,
): EnergyFact<T> {
  return createEnergyFact({
    key,
    value,
    ...(unit ? { unit } : {}),
    status: "defaulted",
    confidence: null,
    sourceRefs: [],
    extractionMethod: "project_default",
    authority: "project_template",
    assumptionId,
    reviewedByUser: false,
    createdAt: now,
  });
}
```
This is the exact idiom D-04/D-12/D-20 must go through — a defaulted value passed through `createEnergyFact` with `status: "defaulted"`, empty `sourceRefs`, and a named `assumptionId` string constant (e.g. `LEDGER_USAGE_ASSUMPTION_ID` — used at line 1122 for other usage-table defaults). **Do not build a new convenience wrapper** — AGENTS.md is explicit that a helper attaching a source reference to a defaulted value is "exactly how the guarantee dies"; `assumptionFact` already is the sanctioned wrapper, reuse it verbatim by import or by mirroring it exactly in `material-inference.ts` (see next entry) if that file cannot import from `energy-diagnostics` for layering reasons.

A live call-site precedent, unread in full this session but confirmed by grep to exist at similar shape (line 1122): `return assumptionFact(key, value, now, LEDGER_USAGE_ASSUMPTION_ID, unit);` — the exact pattern an LPD default should follow once wired to a named assumption id.

---

### `src/lib/material-inference.ts` (service, transform) — MODIFY (D-04 gap)

**Analog:** cross-file — `assumptionFact` in `ledger-baseline-model.ts` above. **No in-file analog exists**: confirmed by reading lines 80-150, the inferred LPD assignment is a bare value with no fact-wrapping at all:
```typescript
// src/lib/material-inference.ts:112, :254-258
const lightingDefaults = LIGHTING_DEFAULTS[mainUse] || LIGHTING_DEFAULTS["default"];
...
lighting: {
  lightingPowerDensity: lightingDefaults.lpd,
  controlType: lightingDefaults.controlType,
  lampType: eraAtLeast(era, "2010-2019") ? "led" : lightingDefaults.lampType,
},
```
This is a plain object literal on `MaterialProperties`, not an `EnergyFact`-wrapped value — `MaterialProperties` itself may not even have a slot for a fact/provenance object today (not verified this session; the planner should check `material-types.ts` before assuming the field can carry a fact in place). This is the literal PHYS-03 gap RESEARCH.md's Validation Architecture table calls a "Wave 0 gap — no existing test covers this non-ledger inference path."

---

### `src/hooks/use-retrofit-scenario.ts` — MODIFY (D-13, D-21)

**Analog:** itself. The LPD formula already validated in production (line 431-432, quoted verbatim in RESEARCH.md and confirmed present):
```typescript
const lightingDemand =
  (materials.lighting.lightingPowerDensity * totalFloorArea * annualOperatingHours) / 1000;
```
This is the formula D-01 wants routed into the split — do not re-derive it; route this exact computed value into the new `deliveredFromDemand` named end-use input. `region = "seoul"` default at line 238 (per CONTEXT.md) is the D-21 wiring site to fix using the `ClimateRegion` object once it exists.

---

### `src/lib/retrofit/retrofit-delta.ts` — MODIFY (D-13 shared core target)

**Analog:** itself — the `pricedByEngine`-by-re-running-the-engine pattern (lines 608-625, quoted in RESEARCH.md, re-verified structurally sound):
```typescript
const measures: RetrofitMeasureEffect[] = ids.map((id) => {
  const unrecognized = !isKnownMeasureId(id);
  const soloMaterials = applyPhaseToMaterials(materials, "retrofit", [id], context);
  const solo = runEnergyEngine(soloMaterials, recipe, climate);
  const priced = !runsAgree(before, solo);
  // ...
});
```
This is the pattern that should NOT be reinvented — once `deliveredFromDemand` reads lighting/renewable honestly, `runsAgree` automatically flips `pricedByEngine` for LED/PV measures with no changes to this measurement logic. Only the `UNPRICED_REASONS` map entries (lines 218-233 per RESEARCH.md, not re-read this session) become dead and should be removed as cleanup — this file was not re-read in full this session beyond what RESEARCH.md already quoted; the planner should re-open it before editing.

---

### `src/lib/reference-buildings/energy-dataset.ts` — MODIFY (D-08)

**Analog:** itself — `ENERGY_DATASET_LIMITATIONS` array, full relevant slice read (lines 60-68):
```typescript
export const ENERGY_DATASET_LIMITATIONS = [
  { id: "L-MODEL-NOT-SURVEY", text: "..." },
  { id: "L-NO-METER", text: "..." },
  { id: "L-BASELINE", text: "..." },
  { id: "L-CLIMATE", text: "The climate is the explicitly assumed engine climate, not a weather series for the IFC's declared site. Read the climate assumption before comparing sites." },
  { id: "L-SCREENING", text: "..." },
  { id: "L-GRADE-SHARES", text: "The grade's fuel split adds 15% of HVAC total to electricity and 10% to gas, assigns heating to gas, and sets district energy and renewable contribution to zero. It does not read lighting power density or PV capacity. The grade is a comparison on Korean thresholds, not an official certificate." },
  { id: "L-SITE-TOTAL", text: "The estimated whole-building total uses end-use ratios to expand HVAC demand. It differs from the simplified fuel shares behind the grade; these totals must not be interchanged." },
] as const;
```
D-08 requires `L-SITE-TOTAL` and `L-GRADE-SHARES` text rewritten in place, same `id`, describing the NEW physics (named end uses, PV netting, regionalized PV) — not just word-tweaked, since the current text literally names "15%... 10%... sets district energy and renewable contribution to zero," every clause of which becomes false once this phase ships. Consumption sites for these IDs: `limitationIds: ["L-GRADE-SHARES", "L-SCREENING"]` (line 127) and `limitationIds: ["L-SITE-TOTAL"]` (line 136) — confirm both arrays still reference the same IDs after rewrite (they must, per D-08's reversibility note — already-published records cite these IDs). RESEARCH.md's Open Question 3 flags `L-CLIMATE`'s text as possibly also needing a rewrite once D-20 partially regionalizes climate — it is not in D-08's protected-ID list, so the planner should decide explicitly rather than leave it stale.

---

### `src/components/viewer/energy-cards.tsx` — MODIFY (disclosure re-derivation)

**Analog:** itself (partial read, lines 175-214) — this is where `siteTotal` (from `calculateSystemBreakdown`, per RESEARCH.md's diagram) reaches the rendered "site energy intensity":
```typescript
const { grade, gradeColor, demand, co2, heatLoss, siteTotal } = metrics;
...
const modeledSiteEui =
  floorAreaSqm > 0 && siteTotal > 0 ? siteTotal / floorAreaSqm : null;
```
No disclosure/assumption string was found rendered directly beside this figure in the slice read (lines 175-214) — the planner should search this file more broadly (it was only partially read this session) for where grade/LPD/PV disclosure text is composed, since RESEARCH.md's canonical AGENTS.md-derived rule ("the label lies while the number is right") applies directly to whatever caption sits next to `grade`/`modeledSiteEui` once D-04/D-12's assumption text starts actually flowing into the UI.

---

### D-15 contract test (twin vs diagnostics parity) — NEW test file

**No analog found.** RESEARCH.md's Open Question 2 and Validation Architecture table both confirm this explicitly: no existing test in this repo asserts that two independent code paths (`useRetrofitScenario` and `analyzeRetrofitEconomics`) agree on measure IDs, kWh, grade delta, and financials for the same building. `retrofit-delta.test.ts`'s fixture-construction pattern (`makeMaterials()`, `makeRecipe()`, hand-composed engine comparison — referenced but not re-read in full this session, lines 190-230 per RESEARCH.md sources) is the closest existing fixture-building convention to extend, but it constructs input for only ONE path (the shared `computeRetrofitDelta` core), not both hook-shaped (`use-retrofit-scenario.ts`) and `DegreeDaySimulationRun`-shaped (`retrofit-bridge.ts`) inputs from one fixture. The planner must read `src/lib/energy-diagnostics/adapter.ts`'s `CompiledDegreeDayInput` type (explicitly not read this session, RESEARCH.md Open Question 2) before designing this test's fixture. Do not invent a "closest existing contract test" — none exists.

## Shared Patterns

### Assumption-fact wrapping (D-04, D-12, D-14, D-20)
**Source:** `src/lib/energy-diagnostics/ledger-baseline-model.ts:142-162` (`assumptionFact`), built on `createEnergyFact` from `src/lib/energy-diagnostics/facts.ts` (not read this session — import site confirmed at line 48: `import { collectEnergyFacts, createEnergyFact } from "./facts";`)
**Apply to:** every new "named, visible assumption" this phase introduces — inferred LPD (`material-inference.ts`), `capacity: 0` PV statement, diagnostics' ratio-estimate PV sizing, D-20's setpoint-assumption naming for `indoorTemp`/`indoorCoolTemp`.
**Constraint:** `createEnergyFact` throws unless a fact cites sources, names an assumption, or is explicit user input (AGENTS.md, CONTEXT.md, RESEARCH.md all state this identically) — never build a second, convenience version of this wrapper.

### Discriminated-union provenance for "sourced vs. generic-default" (D-05/D-07's discretion item)
**Source:** `SystemRatioProvenance` in `src/lib/energy/system-breakdown.ts:73-104`
**Apply to:** the new `deliveredFromDemand` named end-use input's provenance representation, and any other "researched profile vs. fallback with a named assumption" choice this phase introduces.
**Key trait to copy:** the assumption text is built by string-interpolating the actual fallback numbers (`` `냉난방 ${Math.round(DEFAULT_RATIOS.hvac * 100)}...` ``), not hand-typed, so the sentence cannot drift from the values it describes — directly serves AGENTS.md's "the label lies while the number is right."

### Refuse-rather-than-guess region resolution (D-18)
**Source:** `resolveLedgerWeatherSource`, `src/lib/energy-diagnostics/ledger-climate.ts:60-87`
**Apply to:** the new `ClimateRegion` resolver (D-17) and any PV-sizing code path that currently defaults to `"seoul"` (`use-retrofit-scenario.ts:238`, `apply-phase.ts:207` per CONTEXT.md canonical_refs — not re-read this session).
**Key trait to copy:** returns `null`/refuses on no match, rather than a plausible national-mean fallback — verified as the deliberate contract, not an oversight.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/retrofit/__tests__/twin-diagnostics-parity.test.ts` (D-15 build-failing contract test) | test | transform/assertion | No existing test in this repo asserts two independent computation paths agree end-to-end (measure IDs + kWh + grade + financials). Closest fixture convention (`retrofit-delta.test.ts`) only feeds one path. RESEARCH.md explicitly flags `CompiledDegreeDayInput`'s shape as unread and required reading before this test can be designed. |
| Disclosure string rendering for LPD/PV assumptions in `energy-cards.tsx` | component | request-response | Not found in the slice read this session (lines 175-214); requires a fuller read of this file (and the reference-building pages named in CONTEXT.md) before an analog can be named with a file:line citation. Do not invent a generic "disclosure banner" pattern — search first. |

## Metadata

**Analog search scope:** `src/lib/energy/`, `src/lib/energy-diagnostics/`, `src/lib/retrofit/`, `src/lib/reference-buildings/`, `src/hooks/use-retrofit-scenario.ts`, `src/components/viewer/energy-cards.tsx` — all files named in CONTEXT.md canonical_refs plus RESEARCH.md's confirmed blast-radius list.
**Files read in full or targeted this session:** `delivered-from-demand.ts`, `system-breakdown.ts`, `primary-energy.ts`, `ledger-climate.ts`, `solar-potential.ts`, `ledger-baseline-model.ts` (lines 140-205, plus grep of all `assumptionFact`/`createEnergyFact` call sites), `material-inference.ts` (grep + context), `energy-dataset.ts` (grep + context), `energy-cards.tsx` (lines 175-214), `delivered-from-demand.test.ts` (full).
**Pattern extraction date:** 2026-09-15
