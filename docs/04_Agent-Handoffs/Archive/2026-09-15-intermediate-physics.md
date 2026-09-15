# Intermediate physics continuation (superseded)

### Local continuation — 2026-09-15

v6.0 Building Energy Repository, Phase 01 Plans 01–02 are verified locally:
explicit LPD lighting reaches primary grade and the displayed annual site
intensity; use-code defaults, user inputs, assumed LED targets and unknown
sources remain distinguishable in a shared Korean/English disclosure.
See [[Twin Energy Model]] and `.planning/phases/01-honest-physics/01-01-PLAN.md`.

- Unit suite: **5,581 passed**, 4 existing skipped (463 passed files, one skipped).
- TypeScript passed; ESLint `src`: 0 errors, 6 existing warnings.
- KIT Office browser: visible lighting equation re-derived in Korean/English;
  primary 699.5 and site 410.8 kWh/m²·yr correctly distinguished. Desktop and
  390px mobile inspected, with no horizontal document overflow on that page.
- No full Playwright suite, production build or deployment in this continuation.
- GSD found a missing phase UI contract. `01-UI-SPEC.md` is now reviewed and
  user-confirmed; the UI safety gate passes.
- The user approved `01-02-PLAN.md`'s proposed climate basis on 2026-09-15;
  checkpoint committed before code. Region resolution now reaches scenario/PV
  consumers and unknown regions visibly withhold PV. Historical sourced city
  summer temperatures and named province fallbacks remain distinguishable;
  seasonal solar uses the approved PSH-ratio assumption. Source ledger updated.
  A missing location in generated designs no longer becomes a Seoul code.
  Mobile climate text wraps at390px and remains reachable by the HUD's scroll.
  PV primary-energy integration, retrofit parity and
  dataset-version/limitation updates remain Plans 03–05. CO₂ and the hook's
  predicted-versus-actual delta still derive from HVAC demand.
- These intermediate physics changes are **not a release-ready completed phase**.
  Preserve unrelated `.claude/settings.local.json`, `.planning/config.json` and
  pre-existing GSD runtime artifacts in this shared checkout.

