---
phase: 02-retrofit-panel
status: ready
---

# Retrofit panel UI contract

The user requested all phases quickly, mobile sheets from bottom navigation,
desktop side drawers, and modern minimalist typography. This phase changes
content inside those existing containers, using the existing sans family and
semantic neutral colors. No additional entry route or benchmark is introduced.

## Content order

1. Chosen work and optional user budget.
2. Paired modeled energy/carbon, with clear before and after labels and units.
3. Annual modeled bill saving and inspectable calculation basis.
4. Source origins, named assumptions, and verification before capital commitment.
5. Corpus position: explicitly not yet available.

The candidate controls wrap into a vertical list in narrow drawers. Full Korean
and English names, field changes and evidence remain visible. Values use tabular
sans figures; headings 13–16 px, body 11–13 px, source details at least 10 px.
Spacing uses 8/12/16 px steps and hairline separators. No return grade or decorative
financial animation. Selected controls retain aria-pressed and visible focus.

## States and verification

- No material/recipe: show why outcomes are unavailable, no zero-money placeholder.
- Nothing selected: show baseline equals after, without implying a recommendation.
- Unsupported measure: display engine refusal and omit unsupported currency.
- Signed increase: show increased energy/cost/carbon without clamping to a saving.
- Unsaved input edits: show session-only status from the core's actual count.
- Corpus position: unavailable until a qualified peer group exists.

At 390 and 1440 px in KO/EN: no horizontal overflow, complete text, reachable
controls and evidence inside the scrolling drawer. Existing close/Escape/focus
and bottom-navigation geometry remain governed by Phase1's drawer tests.

Inline UI review: layout, typography, color, spacing, interaction, responsive
behavior and evidence copy have explicit contracts; no outstanding design choice
requires another user decision.
