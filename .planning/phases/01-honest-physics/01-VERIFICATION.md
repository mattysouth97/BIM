---
phase: 01-honest-physics
status: passed
verified: 2026-09-15
requirements: [PHYS-01, PHYS-02, PHYS-03, PHYS-04, PHYS-05]
---

# Honest Physics verification

All five requirements are implemented and locally verified. Named lighting/PV
inputs reach site/primary/grade calculations; unknown inputs carry assumptions
or refusals. Twin and diagnostics share one retrofit core with numeric parity
tests. Published reference datasets use schema 2.0.0 with a tracked changelog and
executed seven-building before/after evidence. See the five plan summaries.

## Integrated checks

- Full unit run: 5,656 passed, four pre-existing skipped, 474 passed files and
  one skipped file. Subsequent final corpus/storage and caption checks: 59 passed.
- TypeScript passed. Full ESLint identified one API-link navigation issue,
  subsequently corrected and checked; six existing warnings remain.
- The complete browser run executed 178 cases: 167 initially passed. Eleven
  failures exposed obsolete panel/model assumptions and one animation timeout.
  Tests were updated to use actual drawer navigation and explicit missing energy
  states. Targeted reruns cover every failed case: 14 passed in the first retest,
  seven navigation/legend cases passed, and six final drawer/dataset cases passed.
  Five added corpus presentation cases also passed. No failed case was skipped.
- Four bilingual vertical-panel cases passed at 390/1440px, including PV-only
  primary/carbon savings and unchanged gross site energy.
- Actual window and roof edits on `/building/demo` produce two distinct changed
  fields in the Work caption. Source models are not overwritten.
- Asset budget passes with 20 existing warnings; untracked-import audit reports
  zero broken imports/assets and zero commit-order traps.

Local logs are under `qa-evidence/`; production verification is recorded in
`docs/04_Agent-Handoffs/CURRENT.md`. These checks establish calculation consistency
and implemented behavior, not accuracy against measured Korean building stock.
