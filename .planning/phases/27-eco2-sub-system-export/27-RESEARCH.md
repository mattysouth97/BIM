# Phase 27: ECO2 Sub-System Export - Research

**Researched:** 2026-04-12
**Domain:** Energy export file extension — TypeScript, pure data transformation
**Confidence:** HIGH (all findings from direct source inspection)

## Summary

Phase 27 extends the existing `generateECO2Input()` function in `src/lib/energy/eco2-export.ts` to
include inferred sub-system data fields alongside the envelope data already present. The critical
discovery is that the export schema **already contains** `hvac`, `lighting`, and `dhw` top-level
sections — they are populated today from `materials.hvac.*` and `materials.lighting.*`. The Phase 27
work is therefore not "adding new sections" but (a) supplying those fields from `inferEquipmentSpecs()`
when `materials` values are at their code-estimate defaults, and (b) stamping every inferred field with
`dataSource: "estimated-inferred"` metadata so GX auditors know what was calculated vs. user-configured.

The backward-compatibility constraint (SC3) is already satisfied structurally: callers that pass
`materials` without a `SystemBreakdown` will continue to receive the same output. The new sub-system
block is additive via an optional field on `ECO2ExtraOptions`, exactly matching the existing pattern
used for `primaryEnergy`, `retrofitScenarios`, etc.

**Primary recommendation:** Add an optional `subSystems?: ECO2SubSystems` field to `ECO2ExtraOptions`.
When present, merge into the output JSON under a new top-level `subSystems` key with a
`dataSource: "estimated-inferred"` sentinel. When absent, output is identical to today.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (project) | 5.x | Type-safe data schema extension | Already in use; no new deps needed |
| Vitest | already installed | Unit tests for pure export function | Project test framework (vitest.config.ts) |

No new npm packages are required. This phase is pure TypeScript data transformation.

**Version verification:** `npm view vitest version` — not needed, already installed and used in
`src/lib/energy/__tests__/system-breakdown.test.ts`.

## Architecture Patterns

### Recommended Project Structure

No new files for the core change. One new test file:

```
src/lib/energy/
├── eco2-export.ts          ← modify: add ECO2SubSystems type + subSystems field
└── __tests__/
    └── eco2-export.test.ts  ← create: Wave 0 gap (no existing test for this module)
```

### Pattern 1: Additive Optional Extra Field (established project pattern)

**What:** The existing `ECO2ExtraOptions` interface uses optional fields spread into the output
with conditional spreading (`...(extra?.X !== undefined && { X: extra.X })`). Every optional
extension added since Phase 7 follows this exact pattern.

**When to use:** Whenever new data is available at call time but should not break callers that
lack it.

**Example (from existing eco2-export.ts lines 229-243):**
```typescript
// Source: src/lib/energy/eco2-export.ts
...(extra?.primaryEnergy !== undefined && {
  primaryEnergy: extra.primaryEnergy,
}),
...(extra?.retrofitScenarios !== undefined && {
  retrofitScenarios: extra.retrofitScenarios.slice(0, 3),
}),
```

**Apply same pattern for sub-systems:**
```typescript
// New addition — same idiom
...(extra?.subSystems !== undefined && {
  subSystems: extra.subSystems,
}),
```

### Pattern 2: Sub-System Data Source from equipment-specs.ts

`inferEquipmentSpecs()` in `src/lib/energy/equipment-specs.ts` already computes per-equipment
values keyed on mesh `userData.type` prefix. For the export we do NOT need per-mesh granularity.
We need building-level summary fields that map to the three ECO2 sub-system inputs.

The data already exists in `materials.hvac` and `materials.lighting`. The gap is that
`materials` values are code-estimates, not user-supplied, so they need a `dataSource` label.
The simplest approach: derive the three export fields directly from `materials` + `recipe.era`,
using the same era-to-grade tables already in `equipment-specs.ts`.

**HVAC system type:** Use `materials.hvac.heating.systemType` + `materials.hvac.cooling.systemType`
directly — these are already populated by material-store defaults.

**Lighting power density (W/m²):** Use `materials.lighting.lightingPowerDensity` directly
(already a number in W/m²). Cross-validate against `lpdByGrade` in `equipment-specs.ts` for
the building's era — they should agree. If they differ by > 2 W/m², log a warning but use the
`materials` value (it is user-overridable).

**DHW system type:** Use `materials.hvac.dhw.systemType` directly.

### Pattern 3: Metadata Labeling for Estimated Fields

**What:** Every optional section in the output already follows the pattern of carrying its
own `dataSource` discriminant. Phase 23's `SystemBreakdown` interface uses
`hvacDataSource: EnergyDataSource`, `lightingDataSource: EnergyDataSource`, etc. The export
should mirror this — not bury it in a single global flag.

**Recommended ECO2SubSystems interface:**
```typescript
// Source: derived from material-types.ts + equipment-specs.ts patterns
export interface ECO2SubSystems {
  hvac: {
    heatingSystemType: string;       // from materials.hvac.heating.systemType
    coolingSystemType: string;       // from materials.hvac.cooling.systemType
    heatingFuelType: string;         // from materials.hvac.heating.fuelType
    heatingEfficiency: number;       // COP or %
    coolingEfficiency: number;       // COP
    dhwSystemType: string;           // from materials.hvac.dhw.systemType
    dhwEfficiency: number;           // from materials.hvac.dhw.efficiency
    dataSource: "estimated-inferred";
    standardRef: "KS B 6364";
  };
  lighting: {
    lightingPowerDensity_Wm2: number; // from materials.lighting.lightingPowerDensity
    lampType: string;                 // from materials.lighting.lampType
    controlType: string;              // from materials.lighting.controlType
    dataSource: "estimated-inferred";
    standardRef: "KSC IEC 62301";
  };
  metadata: {
    inferenceNote: string;  // human-readable: "Fields inferred from building era and Korean building codes"
    inferenceTimestamp: string; // ISO string
  };
}
```

**Key design decision:** Use `"estimated-inferred"` (the existing `EnergyDataSource` variant
from `system-breakdown.ts`) — NOT a new string literal. This keeps provenance vocabulary
consistent across the entire codebase.

### Pattern 4: Call Site — energy-cards.tsx

The existing call at `energy-cards.tsx:185` is:
```typescript
const content = generateECO2Input(materials, effectiveRecipe, metrics);
```

To add sub-system data, pass it via the `extra` argument (fourth parameter):
```typescript
const subSystems = buildSubSystems(materials);  // new pure helper
const content = generateECO2Input(materials, effectiveRecipe, metrics, { subSystems });
```

`buildSubSystems()` is a pure synchronous function — no hooks, no store reads — making it
trivially testable and stable across renders.

### Anti-Patterns to Avoid

- **Do NOT create a new top-level parameter on `generateECO2Input()`:** The function signature
  is already `(materials, recipe, metrics, extra?)`. Adding a fifth parameter would break all
  existing callers. Use `ECO2ExtraOptions.subSystems` instead.
- **Do NOT inline sub-system logic inside `generateECO2Input()`:** Extract to a
  `buildSubSystems(materials)` pure helper so it is independently testable.
- **Do NOT import from `energy-grade.ts` in equipment-specs.ts:** Per the existing D-04
  directive in `equipment-specs.ts` — the two grade scales must not be conflated.
- **Do NOT change the existing `hvac` and `lighting` sections** in `ECO2InputData`: they
  are already present and populated. The new `subSystems` section is an additive extension
  with provenance metadata, not a replacement.
- **Do NOT use a new `EnergyDataSource` string:** `"estimated-inferred"` already exists in
  `system-breakdown.ts`. Reuse it. Introduce no new vocabulary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Era-to-LPD mapping | Custom W/m² table | `lpdByGrade` in `equipment-specs.ts` | Already tested and keyed to Korean era boundaries |
| Data provenance typing | New string union | `EnergyDataSource` from `system-breakdown.ts` | Already covers all three variants including `"estimated-inferred"` |
| HVAC type values | Custom string map | `HVACProperties` union types from `material-types.ts` | Already constrains valid strings |
| JSON serialization | Custom serializer | `JSON.stringify(data, null, 2)` (already used) | Output is already 2-space indented JSON |

**Key insight:** All source data is already available in `materials` (populated by material-store
defaults from `korean-building-codes.ts`). No new computation pipeline is needed — only a new
schema section that reads from existing fields and stamps them with provenance metadata.

## KS F 1900 Standard — Pre-Planning Blocker Assessment

KS F 1900 (Korean building energy performance standard) specifies the official ECO2 input format
for energy certification. The exact schema is behind the Korean Standards Association paywall.

**What is known with HIGH confidence (from codebase inspection):**

The existing `ECO2InputData` interface (eco2-export.ts lines 17-107) was already designed to be
"ECO2-compatible" per the file header comment. It contains:
- Building geometry fields
- Full envelope U-values, SHGC, airtightness
- HVAC system type, fuel type, efficiency, capacity
- Lighting power density, control type, lamp type
- DHW system type, efficiency, storage volume
- Calculated energy demand, grade, CO2

This schema pre-exists Phase 27 and its `hvac` and `lighting` sections already match the
sub-system field requirements from SC1. The Phase 27 work is to ensure these fields are
populated from inferred data when no measured data is available, and that they carry explicit
`dataSource: "estimated-inferred"` metadata.

**Assumption (MEDIUM confidence — unverified against official KS F 1900 document):**

KS F 1900 ECO2 input likely requires:
- Heating system type code (e.g., "individual gas", "district heat")
- Lighting power density in W/m²
- DHW system type code
- All as separate input fields (not derived from energy grade)

**Risk mitigation:** The `subSystems` section is additive and clearly labeled. GX auditors
can manually verify field-level mapping to their ECO2 software input form. The export is a
JSON aide — not a direct machine-to-machine ECO2 feed — so exact field naming flexibility exists.
If the official KS F 1900 schema is later obtained, the `ECO2SubSystems` interface can be
renamed/restructured without breaking the existing `ECO2InputData` schema.

## Common Pitfalls

### Pitfall 1: Breaking Existing ECO2 Export Callers
**What goes wrong:** Adding a required parameter or changing the `ECO2InputData` shape causes
the existing `handleExport` callback in `energy-cards.tsx` to fail TypeScript compilation or
produce a different-shaped JSON that downstream importers cannot parse.
**Why it happens:** `generateECO2Input` is called in production with only 3 arguments.
**How to avoid:** Make `subSystems` optional on `ECO2ExtraOptions`. The function signature
`(materials, recipe, metrics, extra?)` is unchanged. Pass `extra.subSystems` only from the
updated call site.
**Warning signs:** TypeScript error "Expected 4 arguments" or "Property X is missing in type".

### Pitfall 2: Duplicate Sub-System Data in Output
**What goes wrong:** The output JSON has both the existing `hvac.heating.systemType` field AND
a new `subSystems.hvac.heatingSystemType` field with potentially different values.
**Why it happens:** `materials.hvac.heating.systemType` is already serialized into the `hvac`
section. A naive sub-system extension could contradict it.
**How to avoid:** The `subSystems` section should READ from the same `materials` source, not
recompute independently. `buildSubSystems(materials)` must use `materials.hvac.heating.systemType`
verbatim, not re-derive it from era. The only new value is the `dataSource` provenance stamp.
**Warning signs:** Two keys in the JSON with the same semantic meaning but different values.

### Pitfall 3: Wrong EnergyDataSource Variant
**What goes wrong:** Using `"estimated-from-era"` or `"estimated-from-recipe"` (from
`equipment-specs.ts`) instead of `"estimated-inferred"` (from `system-breakdown.ts`).
**Why it happens:** Two separate provenance vocabularies exist in the codebase:
- `EquipmentDataSource` in `equipment-specs.ts`: `"estimated-from-era" | "estimated-from-recipe"`
- `EnergyDataSource` in `system-breakdown.ts`: `"actual" | "estimated-ratio" | "estimated-inferred"`
**How to avoid:** The export layer should use `EnergyDataSource` (the energy-level vocabulary),
not `EquipmentDataSource` (the equipment-panel vocabulary). Import `EnergyDataSource` from
`system-breakdown.ts`.
**Warning signs:** TypeScript type error if the wrong import is used; string mismatch in tests.

### Pitfall 4: Test Missing for Envelope-Only Backward Compatibility
**What goes wrong:** SC3 ("existing envelope-only export unchanged") has no automated guard.
A future refactor could silently break it.
**Why it happens:** There are currently NO tests for `eco2-export.ts` in the `__tests__` folder.
**How to avoid:** Wave 0 must create `__tests__/eco2-export.test.ts` with an explicit test that
calls `generateECO2Input(materials, recipe, metrics)` (no `extra` arg) and asserts the output
JSON does not contain a `subSystems` key.
**Warning signs:** "no tests cover eco2-export.ts" in coverage report.

### Pitfall 5: LPD Unit Mismatch
**What goes wrong:** `materials.lighting.lightingPowerDensity` is in W/m² but the export field
name could imply kW or W/fixture if not named precisely.
**Why it happens:** The ECO2 form accepts W/m² but other standards use W/luminaire.
**How to avoid:** Name the export field `lightingPowerDensity_Wm2` (with unit suffix, following
the existing `totalHeatLoss_W` and `co2PerSqm_kgCO2` naming convention in `ECO2InputData`).

## Code Examples

### buildSubSystems — pure helper (new function)
```typescript
// Source: derived from material-types.ts HVACProperties + LightingProperties
import type { MaterialProperties } from "@/lib/material-types";
import type { EnergyDataSource } from "@/lib/energy/system-breakdown";

export interface ECO2SubSystems {
  hvac: {
    heatingSystemType: string;
    coolingSystemType: string;
    heatingFuelType: string;
    heatingEfficiency: number;
    coolingEfficiency: number;
    dhwSystemType: string;
    dhwEfficiency: number;
    dataSource: EnergyDataSource;
    standardRef: "KS B 6364";
  };
  lighting: {
    lightingPowerDensity_Wm2: number;
    lampType: string;
    controlType: string;
    dataSource: EnergyDataSource;
    standardRef: "KSC IEC 62301";
  };
  metadata: {
    inferenceNote: string;
    inferenceTimestamp: string;
  };
}

export function buildSubSystems(materials: MaterialProperties): ECO2SubSystems {
  return {
    hvac: {
      heatingSystemType:   materials.hvac.heating.systemType,
      coolingSystemType:   materials.hvac.cooling.systemType,
      heatingFuelType:     materials.hvac.heating.fuelType,
      heatingEfficiency:   materials.hvac.heating.efficiency,
      coolingEfficiency:   materials.hvac.cooling.efficiency,
      dhwSystemType:       materials.hvac.dhw.systemType,
      dhwEfficiency:       materials.hvac.dhw.efficiency,
      dataSource:          "estimated-inferred",
      standardRef:         "KS B 6364",
    },
    lighting: {
      lightingPowerDensity_Wm2: materials.lighting.lightingPowerDensity,
      lampType:                 materials.lighting.lampType,
      controlType:              materials.lighting.controlType,
      dataSource:               "estimated-inferred",
      standardRef:              "KSC IEC 62301",
    },
    metadata: {
      inferenceNote:      "Fields inferred from building era and Korean building codes (KS B 6364, KSC IEC 62301). Not measured data.",
      inferenceTimestamp: new Date().toISOString(),
    },
  };
}
```

### ECO2ExtraOptions extension
```typescript
// Extend the existing interface — additive, no breaking changes
export interface ECO2ExtraOptions {
  actualConsumption?: AnnualConsumption[];
  calibrationRatio?: number;
  primaryEnergy?: PrimaryEnergyResult;
  benchmarkResult?: BenchmarkResult;
  retrofitScenarios?: RetrofitScenario[];
  /** NEW — Phase 27: inferred sub-system data fields for ECO2 auditors */
  subSystems?: ECO2SubSystems;
}
```

### generateECO2Input spread (inside ECO2InputData construction)
```typescript
// Source: eco2-export.ts — add after retrofitScenarios spread, same pattern
...(extra?.subSystems !== undefined && {
  subSystems: extra.subSystems,
}),
```

### Updated call site in energy-cards.tsx
```typescript
// Source: energy-cards.tsx handleExport callback
import { generateECO2Input, downloadECO2File, buildSubSystems } from "@/lib/energy/eco2-export";

const handleExport = useCallback(() => {
  if (!materials || !effectiveRecipe || !metrics) return;
  const subSystems = buildSubSystems(materials);
  const content = generateECO2Input(materials, effectiveRecipe, metrics, { subSystems });
  const fileName = `eco2-input-${buildingPk.slice(0, 8)}.json`;
  downloadECO2File(content, fileName);
}, [materials, effectiveRecipe, metrics, buildingPk]);
```

### Test: envelope-only export unchanged (backward compatibility guard)
```typescript
// Source: new __tests__/eco2-export.test.ts
it("envelope-only call (no extra arg) does not include subSystems key", () => {
  const json = generateECO2Input(materials, recipe, metrics);
  const parsed = JSON.parse(json);
  expect(parsed).not.toHaveProperty("subSystems");
});
```

### Test: sub-system export includes required fields with correct dataSource
```typescript
it("with subSystems extra, output contains HVAC type, LPD, and DHW type labeled estimated-inferred", () => {
  const subSystems = buildSubSystems(materials);
  const json = generateECO2Input(materials, recipe, metrics, { subSystems });
  const parsed = JSON.parse(json);
  expect(parsed.subSystems).toBeDefined();
  expect(parsed.subSystems.hvac.heatingSystemType).toBeTruthy();
  expect(parsed.subSystems.lighting.lightingPowerDensity_Wm2).toBeGreaterThan(0);
  expect(parsed.subSystems.hvac.dhwSystemType).toBeTruthy();
  expect(parsed.subSystems.hvac.dataSource).toBe("estimated-inferred");
  expect(parsed.subSystems.lighting.dataSource).toBe("estimated-inferred");
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Envelope-only ECO2 export (Phase 7) | Envelope + optional extras (primaryEnergy, benchmarks, retrofits) | Phase 9 | Pattern established for additive extensions |
| No sub-system provenance | `EnergyDataSource` discriminant | Phase 23 | Forces explicit labeling of estimated values |
| No equipment inference | `inferEquipmentSpecs()` + era-grade tables | Phase 26 | Sub-system data sources now available |

**Deprecated/outdated:**
- "modeled" EnergyDataSource variant: mentioned in system-breakdown.ts comment as SUPERSEDED — do not use.

## Open Questions

1. **KS F 1900 exact field naming**
   - What we know: The standard defines mandatory ECO2 input field names and codes for HVAC system types
   - What's unclear: Whether "gas-boiler" (our string) maps to the official Korean code (e.g., "01" for individual gas)
   - Recommendation: Add a `// TODO: verify against KS F 1900 section X` comment in `ECO2SubSystems`. GX auditors can validate against their ECO2 software input form before using for certification. The metadata `inferenceNote` field explicitly warns that values are inferred.

2. **Phase 26 completion status**
   - What we know: `equipment-specs.ts` (26-01-PLAN) is complete. `26-02-PLAN` (EquipmentClickHandler + EquipmentInfoPanel) is not yet started per ROADMAP.
   - What's unclear: Whether Phase 27 should wait for Phase 26 to fully complete, or can proceed independently
   - Recommendation: Phase 27 depends only on `equipment-specs.ts` (26-01, complete) for the era-grade tables. The UI panel (26-02) is not needed. Phase 27 can proceed immediately.

## Environment Availability

Step 2.6: SKIPPED — Phase 27 is pure TypeScript data transformation with no external runtime dependencies. All required modules (`vitest`, `typescript`) are already installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run src/lib/energy/__tests__/eco2-export.test.ts` |
| Full suite command | `npx vitest run src/lib/energy/__tests__/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STD-02 SC1 | Export includes HVAC type, LPD, DHW type | unit | `npx vitest run src/lib/energy/__tests__/eco2-export.test.ts` | Wave 0 |
| STD-02 SC2 | Sub-system fields carry `dataSource: "estimated-inferred"` | unit | same | Wave 0 |
| STD-02 SC3 | Envelope-only export unchanged when no extra arg | unit | same | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/energy/__tests__/eco2-export.test.ts`
- **Per wave merge:** `npx vitest run src/lib/energy/__tests__/`
- **Phase gate:** Full energy `__tests__/` suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/energy/__tests__/eco2-export.test.ts` — covers STD-02 SC1/SC2/SC3 (file does not exist; no tests currently cover eco2-export.ts)

## Sources

### Primary (HIGH confidence)
- Direct inspection of `src/lib/energy/eco2-export.ts` — full schema and function signature
- Direct inspection of `src/lib/energy/equipment-specs.ts` — inferEquipmentSpecs, era tables, LPD-by-grade
- Direct inspection of `src/lib/energy/system-breakdown.ts` — EnergyDataSource union, existing test patterns
- Direct inspection of `src/lib/material-types.ts` — HVACProperties, LightingProperties field names and union types
- Direct inspection of `src/components/viewer/energy-cards.tsx` — existing call site at line 185
- Direct inspection of `vitest.config.ts` — test framework config, path aliases
- Direct inspection of `src/lib/energy/__tests__/` — confirmed no eco2-export.test.ts exists

### Secondary (MEDIUM confidence)
- ROADMAP.md Phase 27 section — success criteria, dependency on Phase 26 (26-01 complete, 26-02 pending)
- REQUIREMENTS.md STD-02 — exact requirement text and phase mapping

### Tertiary (LOW confidence — needs GX auditor validation)
- KS F 1900 ECO2 input field naming: not directly verified (behind KSA paywall). Assumption is that JSON field names in `ECO2SubSystems` can be mapped by auditors to their ECO2 software input form.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all TypeScript already in use
- Architecture: HIGH — existing additive-extra pattern is clear from source inspection; pattern used 5 times already
- Pitfalls: HIGH — all five pitfalls derived from direct source inspection, not assumptions
- KS F 1900 schema: LOW — paywall prevents verification; flagged as open question

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable TypeScript domain; KS F 1900 note may need GX auditor input sooner)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STD-02 | ECO2 export includes sub-system data fields (HVAC type, lighting density, DHW system) extending the existing envelope-only export | `buildSubSystems(materials)` helper + `ECO2SubSystems` type + `ECO2ExtraOptions.subSystems` optional field covers all three fields with provenance metadata |

</phase_requirements>
