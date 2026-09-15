---
phase: 02-retrofit-panel
status: passed
verified: 2026-09-15
requirements: [PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05]
---

# Retrofit panel verification

All five panel requirements are implemented and locally verified. Work and
Energy are vertically stacked in desktop side drawers and mobile sheets above
the bottom navigation. Before/after site, primary, carbon and grade values come
from the selected package's engine runs. Annual bill savings use the same
before/after purchased-energy carriers and visible assumed tariffs.

Measured geometry, assumed physical inputs and user edits remain distinct.
Verification guidance is visible before capital decisions. Corpus position has
an explicit unavailable slot; no invented percentile appears. The unused budget
slider/default are removed, while the reachable optional budget is retained.

Evidence: 77 focused panel tests; four Korean/English browser cases at390/1440px;
four shared drawer cases; and the integrated checks in `01-VERIFICATION.md`.
The original final-Escape failure was fixed in `906248d` and the four bilingual
cases passed through that final assertion on the integration branch. Mobile and
desktop screenshots were inspected, with full wrapping and no horizontal overflow.
