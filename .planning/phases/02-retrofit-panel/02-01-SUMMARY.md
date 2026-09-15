---
phase: 02-retrofit-panel
plan: 01
status: passed
requirements: [PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05]
---

# Retrofit panel implementation

Work and Energy drawer content now stacks vertically at mobile and desktop widths. Work shows the actual selected package and its paired engine bill calculation. Energy shows gross site energy, primary energy, carbon and grade before/after that same selection. No visible monetary output is derived from an isolated-measure proxy return.

Verification separates extracted geometry, thermal/system assumptions and user input from measured operating energy. It lists checks needed before capital decisions, shows the actual local-edit count, and reserves a clearly unavailable corpus-comparison section. The unreachable budget slider and its unused default constant were removed; the reachable optional budget field remains.

## Evidence

- 77 focused tests across seven files passed.
- TypeScript and scoped ESLint passed.
- Four browser cases (Korean/English, 390/1440 px) passed vertical card geometry, no horizontal overflow, empty selection, PV-only paired bill/primary/carbon changes and unchanged gross site consumption.
- The first run failed final Escape-close. Root fixed outside-focus Escape in906248d; all four integrated cases now pass through that final assertion.
- Browser screenshots are in the local Playwright test-results directories. The test now waits for both model and roof-plane readiness before editing the selection.

The isolated worktree used the root-owned whole-carbon metrics correction from 03f5a6e for runtime validation; that file is excluded from this UI commit because the integration branch already contains it.
