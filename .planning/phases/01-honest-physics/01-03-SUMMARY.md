---
phase: 01-honest-physics
plan: "03"
status: complete
subsystem: energy
requirements-completed: [PHYS-02, PHYS-03]
key-files:
  created: [src/lib/energy/pv-generation.ts, src/components/viewer/pv-generation-disclosure.tsx, src/lib/energy/__tests__/pv-primary-energy.test.ts]
  modified: [src/lib/energy/end-uses.ts, src/lib/energy/primary-energy.ts, src/lib/retrofit/retrofit-delta.ts, src/hooks/use-energy-metrics.ts]
completed: 2026-09-15
---

# Plan 01-03 — PV reaches primary energy

Declared capacity now supplies the shared annual PV calculation. A resolved
region is required; missing region is a named refusal, not a no-array assertion.
Zero capacity carries an assumption with its pessimistic bias stated. Generation
nets only against annual electricity demand; surplus is reported separately as
`clippedGenerationKWh`, with no further grade or export-revenue credit.

The regional end-use object reaches metrics, reports, properties, published
baselines and all isolated retrofit reruns. Obsolete PV-unpriced claims were
removed. A known proposed addition beside an unknown existing array credits only
the addition and explicitly states the missing existing generation.

## Commits

- `0e2662b`: Task 1 shared named-input generation arithmetic.
- `5443bbb`: Tasks 2–3 connected physics, provenance and disclosures together so
  the numerical change and its explanation remain in the same reviewed commit.
- Follow-up test commit: PV physical changes now appear behind the priced
  details toggle; the bilingual geometry test opens it before parsing claims.

## Verification

- 1,276 targeted physics, retrofit, inference, reference UI and disclosure tests
  passed; full TypeScript passed; scoped ESLint has no errors (two pre-existing
  exhaustive-deps warnings).
- Full suite: 5,586 passed, 4 existing skips, 12 failed only because the PV claims
  test expected priced details to remain always visible. Updated it to open the
  detail toggle; all 14 cases in that file then passed. Integrated full-suite
  rerun belongs to final phase verification.
- Browser `/models/taltech-maemaja`, 390px: 63.36 kWp gives 74,467.01 kWh/yr;
  reported surplus 0; assumption and annual-not-hourly caveat visible; document
  scrollWidth and viewport both 390. Screenshot in local ignored QA evidence.
- New tests prove capacity changes primary energy and grade, oversized generation
  clips without negative electric primary energy, refusal differs from assumed
  zero, and rendered generation/surplus sentences reproduce their numbers.

No production deployment. Source-input accuracy is not claimed by calculation
consistency. Phase01 Plan04 proceeds in isolated worktree with these interfaces.
