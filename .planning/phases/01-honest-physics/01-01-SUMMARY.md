---
phase: 01-honest-physics
plan: "01"
subsystem: energy
tags: [lighting, provenance, primary-energy, react, vitest]
requires: []
provides:
  - Shared LPD lighting load in primary grading and site totals
  - Named fuel-declaring end uses without share arithmetic in the fuel split
  - Bilingual lighting equation and field-source disclosure
affects: [01-02, 01-03, 01-04, 01-05]
tech-stack:
  added: []
  patterns: [shared pure lighting helper, field-level source provenance]
key-files:
  created: [src/lib/energy/lighting-load.ts, src/lib/energy/end-uses.ts, src/components/viewer/lighting-load-disclosure.tsx, src/lib/__tests__/material-inference-lpd.test.ts]
  modified: [src/lib/energy/delivered-from-demand.ts, src/lib/energy/system-breakdown.ts, src/hooks/use-energy-metrics.ts, src/lib/material-inference.ts, src/components/viewer/energy-cards.tsx]
key-decisions:
  - Keep field provenance in MaterialProperties; do not fabricate EnergyFact evidence for store defaults
  - Distinguish assumed retrofit targets from user-entered LPD
  - Correct the reference card and its grade explanation to share the actual site total
requirements-completed: [PHYS-01, PHYS-03]
coverage:
  - id: lighting-physics
    description: Lighting changes primary and site energy through one load computation
    requirement: PHYS-01
    verification:
      - kind: unit
        ref: src/hooks/__tests__/use-energy-metrics.test.tsx
        status: pass
      - kind: unit
        ref: src/lib/energy/__tests__/lighting-load.test.ts
        status: pass
    human_judgment: false
  - id: lighting-provenance
    description: Actual assumed LPD and operating hours reach the rendered bilingual equation
    requirement: PHYS-03
    verification:
      - kind: unit
        ref: src/lib/__tests__/material-inference-lpd.test.ts
        status: pass
      - kind: automated_ui
        ref: src/components/viewer/__tests__/energy-breakdown-chart.test.tsx
        status: pass
      - kind: automated_ui
        ref: qa-evidence/phase01-task3/task3-lighting-disclosure-mobile.png
        status: pass
    human_judgment: false
completed: 2026-09-15
status: complete
---

# Plan 01-01 — Explicit lighting and named energy end uses

**LPD now changes both primary-energy grading and the site's displayed annual
intensity; the equation exposes the exact input values and their assumptions.**

## Task Commits

1. Task 1, failing tracer and split contracts: `f0f957e`.
2. Task 2, shared lighting computation and named end-use conversion: `b4eefbf`.
3. Task 3, source metadata, rendered explanations and reconciled contracts:
   `79256df`.

Task 1/2 were recovered from committed work. Task 3 executed inline in Codex;
no independent-agent execution or review is claimed.

## Accomplishments and Decisions

`EndUseLoads` carries named HVAC heating/cooling, lighting, DHW and plug loads,
each with a declared fuel and provenance, plus on-site generation. The fuel
split only routes those inputs; ratio arithmetic belongs to the builder. DHW
and plug remain named ratio assumptions. Oil uses the existing named gas-factor
proxy; district heating/cooling route to their corresponding primary factors.

`modeledLightingLoad` computes LPD × conditioned intensity area × annual hours
/ 1000. Both grade and system breakdown use it. `LightingProperties` carries
optional `lpdProvenance`, leaving persisted old records readable. Defaults name
the actual table key and LPD. Editing LPD marks user input; applying an LED
target marks an assumed retrofit target. Old records without source metadata
explicitly read as assumptions. No `createEnergyFact` import was added to
material inference: store-level defaults are not canonical register evidence.

The shared disclosure reaches both the viewer chart and real reference-model
panel. The latter route required an explicit mount because the config chart
was not discoverably reachable there. Energy cards and their grade explanations
now use `siteTotal / intensityFloorAreaSqm`, including lighting, rather than
continuing to display HVAC-only demand under a site label.

## Changed Numeric Contracts

Lighting is no longer a fixed fraction of an HVAC-derived total, and primary
energy now applies the declared heating/cooling fuel factors independently.
The seven-building tests re-derive primary intensity from separate pinned
hours, HVAC/auxiliary ratios and primary factors instead of calling the split
under test. HVAC thermal-demand fixture values themselves did not change.

Updated grade snapshots: Clinic 1+ → 4; Schependomlaan 1++ → 2; Duplex 4 → 7;
FZK 2 → 7; KIT Office 5 → 7; Klassiqua 2 → 5. Other existing bounds remain valid.
The LED fixture now has a primary reduction of
`(6 - 18) × 4380 / 1000 × 2.75 = -144.54 kWh/m²·yr` and is priced rather than
labelled unmodeled. Retrofit delta's `sitePerSqm` still denotes HVAC demand at
this intermediate point; Plan 04 owns convergence. Dataset schema/limitation
text remains pending Plan 05; these updated tests are not a release claim.

## Verification

- Full Vitest: **5,550 passed, 4 pre-existing skipped**, 461 passed files and one
  skipped file; process exit 0. No test was disabled or newly skipped.
- TypeScript `--noEmit`: exit 0.
- ESLint `src`: exit 0, 0 errors and 6 existing warnings.
- `git diff --check`: passed.
- Browser `/models/kit-office`, KO and EN: parsed equation
  `10 × 2266.66 × 4380 / 1000 = 99279.708`; arithmetic equals the visible result.
  The grade explanation correctly names primary 699.5 versus site 410.8.
- Mobile 390×844: document client/scroll widths both 390; disclosure width358.
  Desktop and mobile screenshots inspected. Local ignored evidence:
  `qa-evidence/phase01-task3/`.
- Acceptance checks passed, including obsolete lighting-unpriced copy removal.
- Schema drift gate passes; codebase drift check explicitly skipped because no
  mapped commit exists. UI gate passes after the contract repair described below.
- Full Playwright CLI suite, production build and deployment were not run.

The unit output contains a pre-existing DWG happy-dom external-script failure
diagnostic; the suite and explicit process exit still pass. This is retained
in the local test log, not hidden.

## Deviations and Issues

1. Added store override and retrofit application provenance to prevent a valid
   default-source sentence from becoming stale after the value changes.
2. Added the real reference-panel disclosure and corrected actual displayed
   site intensity; changing a variable name alone did not correct the card.
3. Updated two additional dataset/claim contracts found by the full suite;
   every shifted grade is explained above and independently re-derived.
4. Scoped the plan's overly broad quoted-`lighting.*` grep to
   `UNPRICED_REASONS`. Legitimate lighting field-change tracking remains; deleting
   it to satisfy that grep would break the implementation.
5. GSD's UI safety gate found a missing `01-UI-SPEC.md`. Authored and checked
   the contract inline against the existing UI and installed inventory. The user
   confirmed scope and wrapping verbatim: **"현재 범위와 줄바꿈 방식 확정"**.
   The compiled state probe initially missed the grade text; rerunning the
   confirmed explicit static-content classifications resolves all four applicable
   overflow/long-text considerations. No auto-approval was invented.

## Next Plan Readiness

Plan 01 is complete; Phase 01 is not complete. PHYS-03 here covers lighting
only; its shared requirement must not close before PV provenance is delivered.
The user has approved Plan 02's proposed climate basis. Record that reply
verbatim in its checkpoint SUMMARY before changing climate implementation.

PV remains zero in the grade builder until Plan 03. Retrofit parity is Plan 04.
Dataset version, limitation statements and seven-model release evidence are
Plan 05. CO₂ and hook predicted-versus-actual still follow HVAC demand. Do not
deploy this intermediate state as a completed physics phase.
