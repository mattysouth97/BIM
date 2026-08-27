---
type: project
status: implemented
last_verified: 2026-08-27
---

# Product Intent

What the product is *for*, and the constraints that follow. Everything here is
established from repository evidence or from explicit product decisions recorded
during development. Where intent could not be established, it says so.

## Purpose

Give someone assessing a real Korean building a defensible energy number and the
retrofit investment case that follows — starting from data that already exists
about that building, not from a survey they have to commission first.

## The primary workflow is fixed

```text
건물 검색  →  도면 업로드  →  디지털 트윈  →  보고서
```

This was settled as a product decision on 2026-08-27 and is not a working
assumption. New capability belongs *inside* one of these four steps. If a feature
does not fit one of them, that is a signal to reconsider the feature, not to add
a fifth step or a parallel entry screen.

The repository has twice drifted into having two competing front doors; both
times it made the product harder to explain. See [[Current State]].

## The central constraint: stated versus assumed

The 건축물대장 states:

- 연면적 / 건축면적 / 대지면적, 지상층수 / 지하층수, 높이
- 주용도코드, 구조코드, 지붕코드
- 사용승인일 / 허가일
- per-floor area and use (층별개요)

It states **nothing** about thermal performance, glazing, airtightness, HVAC,
lighting or occupancy. Those are supplied from era-indexed Korean code tables.

The product must never let the second category read as the first. This is
enforced at construction time, not by review: `createEnergyFact` throws unless a
fact carries source references, names an assumption, or is explicit user input.

Consequences that follow from this constraint, each with a regression test:

- A **documented zero** (`platArea=0`, `heit=0`, `bcRat=0`) means *unavailable*
  in this API. It must produce no fact at all — a missing value is honest where
  a zero is a lie.
- Era selection must report whether a date was actually read. The general-purpose
  `classifyEra` silently returns `1990-1999` for a blank date, and era drives
  every U-value, the window ratio, airtightness and floor height — so the
  traceable path uses `classifyEraExplicit` instead.
- An outline synthesised from 건축면적 is an inference, not survey geometry, and
  must never be labelled as dimensioned.
- Below-grade storeys are recorded but not extruded, because the engine prices
  every storey against outdoor air and no ground-coupling path exists. The
  excluded area is named rather than silently dropped.

## User outcomes that matter

1. **Zero-input first answer.** Choosing a building is the only input required to
   see an energy result. Anything that demands data entry before the first number
   works against the product.
2. **Visible uncertainty.** The user can always see how much of the answer is
   assumed, and what would improve it.
3. **Refinement moves the number.** Correcting a value must change the result
   visibly, and must be reversible.
4. **An investment case, not just a number.** The energy result has to reach
   NPV, payback and a subsidy program track to be actionable.

## Non-goals

- **Not a compliance/certification engine.** The degree-day core is a screening
  method. The adapter declares its own approximations explicitly (whole-building
  calculation, area-apportioned zone results, ratio-estimated non-HVAC end uses,
  no monthly or peak outputs) rather than implying dynamic-simulation fidelity.
- **Not a general BIM authoring tool.** Manual 3D family authoring was
  deliberately removed as a product mode; the 3D assets were retained.
- **Not a portfolio dashboard.** A campus/portfolio comparison branch existed and
  was left out of the restored front door because it reported every building's
  energy as `0` behind an "available after twin generation" badge — a placeholder
  presented as data.

## Terminology

| Term | Meaning |
|---|---|
| 건축물대장 | Korean building register; the product's primary data source |
| 표제부 / 층별개요 | Register title record / per-floor outline |
| Baseline | The energy model derived from the register alone, before refinement |
| Refinement | Replacing an assumed value with one the user knows or read from a drawing |
| Fact | A single traceable value with provenance (`EnergyFact`) |
| Assumption | A named, reversible record explaining a value the register did not state |
| Fidelity | How much of the twin is measured rather than assumed |
| 그린리모델링 | Korean green-remodeling subsidy program; drives the finance tracks |

## Uncertain

- The intended **commercial** model (who pays, per-building or per-seat) is not
  established anywhere in the repository.
- The generative "describe a building" entry is **not reachable at runtime**.
  `/studio` has no `describe` branch — it redirects `draw` to `?method=create`,
  `diagnose` to `?method=upload`, and everything else to the landing page — and
  the prompt panel's only host, `generative-studio.tsx`, has no importer outside
  its own test. Whether it is meant to return, or to be deleted along with its
  API routes, is not settled in writing.

## Related

- [[Project Overview]] · [[Current State]]
- [[ADR-002 - Provenance as a Construction-Time Invariant]] · [[Traceable Energy Diagnostics]]
