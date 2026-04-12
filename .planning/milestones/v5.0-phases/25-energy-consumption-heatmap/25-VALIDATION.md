---
phase: 25
validated: 2026-04-12
nyquist_compliant: true
wave_0_complete: true
criteria_covered: 4/4
---

# Phase 25: Energy Consumption Heatmap — Nyquist Validation

## Summary

Phase 25 introduced per-floor PlaneGeometry heatmap meshes coloured by kWh/m² using the
existing GRADE_THRESHOLDS/GRADE_COLORS from energy-grade.ts, living in the "energy-zones"
layer group. All four success criteria have automated test coverage.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | Each floor renders color plane by kWh/m² (Korean grade gradient) | COVERED | `src/lib/layers/__tests__/energy-heatmap-builder.test.ts` — "each child is a THREE.Mesh with PlaneGeometry + MeshBasicMaterial(vertexColors:true)", `kwhmToColor` tests verify grade gradient mapping |
| 2 | Heatmap colors update when material slider changes | COVERED | `src/lib/layers/__tests__/energy-heatmap-builder.test.ts` — `buildEnergyHeatmap` pure-function tests verify output changes with different `perFloorKwh` input values |
| 3 | Heatmap remains visible when structure layer is hidden | COVERED | `src/lib/layers/__tests__/energy-heatmap-builder.test.ts` — "returns a THREE.Group named 'energy-heatmap' with only above-floor children" confirms separate group; `src/lib/layers/__tests__/layer-manager.test.ts` — "hiding one layer does not affect others" |
| 4 | Heatmap geometry on separate `THREE.Mesh` floor planes (not InstancedMesh) | COVERED | `src/lib/layers/__tests__/energy-heatmap-builder.test.ts` — "each child is a THREE.Mesh with PlaneGeometry" (not InstancedMesh), "returns a THREE.Group named 'energy-heatmap'" |

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 25-VERIFICATION.md
- 10 unit tests passing (`energy-heatmap-builder.test.ts`) per 25-VERIFICATION.md
- 466 total tests passing per 25-VERIFICATION.md
- Human visual verification: approved per 25-VERIFICATION.md
