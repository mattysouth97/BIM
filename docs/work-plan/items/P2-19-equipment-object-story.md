---
id: P2-19
title: Object story — clicked equipment narrates identity → current operation → upgrade savings
priority: P2
area: ux
status: done
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-04, UC-06, UC-07, UC-08]
---

# P2-19 — Equipment object story (identity / now / future savings)

User feedback (GX team): "The Three.js objects don't tell me what I need to
know. The story I want is: what is the object, how is it operated now, and
can it be operated in the future to return savings." Clicking a MEP mesh
previously ended at inferred specs; the retrofit/DCF engine that answers
"what would upgrading return" was only reachable through the budget scenario
UI, never connected to the selected object.

## 1. Requirement (RE)
- Selecting a 3D equipment object must narrate three acts: (1) what it is,
  (2) how it operates now — including a PRICED annual energy cost, and
  (3) which upgrades apply to it and what they return (₩/yr, payback, NPV).

## 2. Specification (SDD)
- New pure module `src/lib/retrofit/equipment-story.ts`:
  - `storyCategoryFor(componentType)` maps MEP prefixes → measure category
    (cooling/heating/vent/dhw → hvac; lighting → lighting; microgrid →
    renewable/expansion; shell/unknown → null = honest "no direct measure").
  - `buildEquipmentStory()` prices current consumption (heating/DHW at the
    building's resolved heating fuel, everything else at electricity, via
    ENERGY_PRICES) and filters the financially-enriched measure list to the
    equipment's category, cheapest payback first, capped at 3.
- `equipment-info-panel.tsx` restructured into the 3-act card. It consumes
  `useRetrofitScenario` with the SAME published-inputs convention as
  SceneOutliner, so every number shown on the object is identical to the
  Twin scenario rail's. Uses lang-aware `formatKrw`/`formatYears` (P2-15).
- Measure names stay in official Korean per the P2-06 i18n policy.

## 3. Constraints (CDD)
- **Must not**: invent a second savings engine (reuse useRetrofitScenario);
  show any value as measured (EQ-02 amber 추정 badges everywhere, footer
  disclaimer now covers savings/payback); conflate equipment 1~5 grades with
  building certification grades (D-04).
- **Fitness**: category filtering never leaks other systems' measures;
  null-category equipment gets an explanation, not unrelated numbers.

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] Story module pure + unit-tested (9 tests: category mapping, payback
        sort/cap, fuel pricing rule, null-category, cross-category leak guard)
  - [x] Panel shows current annual cost and per-measure 절감/회수/NPV
  - [x] Numbers sourced from the shared scenario engine (no duplication)
  - [x] Empty states honest: no catalog match / data not ready / already
        efficient
- **Done when**: clicking any MEP object answers "what, how now, what could
  it save" in one card. 1258 tests, lint 0 errors, build green.
