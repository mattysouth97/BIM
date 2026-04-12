---
phase: 27
validated: 2026-04-12
nyquist_compliant: true
wave_0_complete: true
criteria_covered: 3/3
---

# Phase 27: ECO2 Sub-System Export — Nyquist Validation

## Summary

Phase 27 extended `generateECO2Input` to include HVAC type, lighting power density, and DHW
system type fields tagged as `estimated-inferred`, while preserving backward compatibility
with envelope-only callers. All three success criteria have automated test coverage.

## Success Criteria Coverage

| # | Criterion | Status | Test File(s) |
|---|-----------|--------|--------------|
| 1 | Export file includes HVAC type, lighting power density, DHW system type fields | COVERED | `src/lib/energy/__tests__/eco2-export.test.ts` — "includes HVAC heating/cooling/DHW system types and lighting power density" (SC1 suite) |
| 2 | All sub-system fields labeled `estimated`/`inferred` in metadata | COVERED | `src/lib/energy/__tests__/eco2-export.test.ts` — "stamps every sub-system block with dataSource 'estimated-inferred'" (SC2 suite), "emits inferenceNote string and ISO-8601 inferenceTimestamp" |
| 3 | Existing envelope-only export unchanged | COVERED | `src/lib/energy/__tests__/eco2-export.test.ts` — "omits subSystems key when no extra arg is passed" (SC3 suite), "retains all core sections when called without extra arg" |

## Build Evidence

- `pnpm build`: passes (0 TypeScript errors) per 27-VERIFICATION.md
- 5 new unit tests passing (`eco2-export.test.ts`) per 27-VERIFICATION.md
- 136 total energy suite tests passing per 27-VERIFICATION.md
