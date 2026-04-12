---
phase: 27-eco2-sub-system-export
plan: "01"
subsystem: energy-export
tags: [eco2, energy, export, tdd, provenance, hvac, lighting]
dependency_graph:
  requires:
    - src/lib/energy/system-breakdown.ts   # EnergyDataSource type
    - src/lib/material-types.ts            # MaterialProperties, HVACProperties, LightingProperties
    - src/lib/energy/eco2-export.ts        # existing generateECO2Input (extended)
  provides:
    - ECO2SubSystems interface (stable public API for auditor tooling)
    - buildSubSystems() pure helper
    - ECO2ExtraOptions.subSystems optional field
  affects:
    - src/components/viewer/energy-cards.tsx  # handleExport now ships subSystems block
tech_stack:
  added: []
  patterns:
    - Additive optional ECO2ExtraOptions field (same spread idiom as primaryEnergy/retrofitScenarios)
    - Pure synchronous helper extracted from call site for independent testability
    - EnergyDataSource reuse across export and system-breakdown layers (no new vocabulary)
key_files:
  created:
    - src/lib/energy/__tests__/eco2-export.test.ts
  modified:
    - src/lib/energy/eco2-export.ts
    - src/components/viewer/energy-cards.tsx
decisions:
  - Reused EnergyDataSource union from system-breakdown.ts — no new provenance vocabulary introduced
  - subSystems is additive-optional — backward compatibility preserved structurally for all existing callers
  - buildSubSystems reads materials verbatim instead of re-deriving from era (Pitfall 2 guard)
  - dataSource literal "estimated-inferred" matches EnergyDataSource NOT EquipmentDataSource (Pitfall 3 guard)
metrics:
  duration: "~8 minutes"
  completed: "2026-04-12T00:49:49Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase 27 Plan 01: ECO2 Sub-System Export Summary

**One-liner:** ECO2 export now ships a `subSystems` block (HVAC type, LPD W/m², DHW type) stamped with `dataSource: "estimated-inferred"` provenance per STD-02.

## Objective Achieved

`generateECO2Input()` now accepts an optional `extra.subSystems` block that, when present, is merged into the exported JSON under a top-level `subSystems` key. Callers that pass no `extra` argument receive identical output to pre-Phase-27 (SC3 backward compatibility). The `energy-cards.tsx` export button now opts in automatically via `buildSubSystems(materials)`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TDD RED — failing Vitest coverage SC1/SC2/SC3 | d91fdb7 | src/lib/energy/__tests__/eco2-export.test.ts (new) |
| 2 | GREEN — ECO2SubSystems interface + buildSubSystems + ECO2ExtraOptions extension | 33bf2d2 | src/lib/energy/eco2-export.ts |
| 3 | Wire buildSubSystems into energy-cards.tsx handleExport | 33bf2d2 | src/components/viewer/energy-cards.tsx |

## Artifacts Produced

### `ECO2SubSystems` interface
Stable public API exported from `src/lib/energy/eco2-export.ts`. Shape:
- `hvac`: heatingSystemType, coolingSystemType, heatingFuelType, heatingEfficiency, coolingEfficiency, dhwSystemType, dhwEfficiency, dataSource, standardRef ("KS B 6364")
- `lighting`: lightingPowerDensity_Wm2 (W/m² unit suffix per naming convention), lampType, controlType, dataSource, standardRef ("KSC IEC 62301")
- `metadata`: inferenceNote (human-readable), inferenceTimestamp (ISO-8601)

### `buildSubSystems(materials: MaterialProperties): ECO2SubSystems`
Pure synchronous helper. Reads `materials.hvac.*` and `materials.lighting.*` verbatim — no era math, no re-derivation. Independently testable with no store/hook dependencies.

## Decisions Made

1. **Reused `EnergyDataSource` from `system-breakdown.ts`** — the `"estimated-inferred"` variant already existed. No new string union introduced. This keeps provenance vocabulary consistent across the entire energy layer.

2. **`subSystems` is additive-optional** — `ECO2ExtraOptions.subSystems?: ECO2SubSystems` follows the same pattern as `primaryEnergy`, `benchmarkResult`, `retrofitScenarios`. All existing 3-argument callers compile and behave unchanged.

3. **`buildSubSystems` reads `materials` verbatim** — avoids the Pitfall 2 scenario where `subSystems.hvac.heatingSystemType` and `hvac.heating.systemType` could diverge. Single source of truth.

4. **`lightingPowerDensity_Wm2` field name** — unit suffix appended per project naming convention (`totalHeatLoss_W`, `co2PerSqm_kgCO2`) to prevent LPD unit ambiguity (Pitfall 5 guard).

## Verification Results

- `npx vitest run src/lib/energy/__tests__/eco2-export.test.ts` — 5/5 tests passed
- `npx vitest run src/lib/energy/__tests__/` — 136/136 tests passed (13 test files)
- `pnpm build` — exit code 0, 0 TypeScript errors
- `pnpm lint` — 0 errors (54 pre-existing warnings, unchanged)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `buildSubSystems` reads live `materials` properties (populated by material-store defaults from `korean-building-codes.ts`). No hardcoded empty values or placeholder strings in the export path.

## Known Limitation / Open Question

**KS F 1900 exact field-code mapping not verified** — the official Korean building energy performance standard is behind the KSA paywall. GX auditors must validate that the string values (e.g., `"individual"` for heating systemType, `"gas"` for fuelType) map correctly to their ECO2 software input codes. The `metadata.inferenceNote` field in the JSON explicitly warns downstream consumers. A `// TODO: verify against KS F 1900 section field codes` comment is present in the `ECO2SubSystems` interface.

## Unlocks

- Phase 28 (procedural MEP 3D models) — independent of this work but shares `equipment-specs.ts` userData.type dispatch already in place.
- Future: if GX auditors provide official KS F 1900 field code mappings, `ECO2SubSystems` interface can be extended with a `fieldCode` property without breaking existing callers.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/lib/energy/__tests__/eco2-export.test.ts | FOUND |
| src/lib/energy/eco2-export.ts | FOUND |
| src/components/viewer/energy-cards.tsx | FOUND |
| .planning/phases/27-eco2-sub-system-export/27-01-SUMMARY.md | FOUND |
| commit d91fdb7 (RED tests) | FOUND |
| commit 33bf2d2 (GREEN + wiring) | FOUND |
