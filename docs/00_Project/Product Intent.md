---
type: project
status: implemented
last_verified: 2026-09-07
---

# Product Intent

What the product is *for*, and the constraints that follow. Everything here is
established from repository evidence or from explicit product decisions recorded
during development. Where intent could not be established, it says so.

## Purpose

Help building professionals turn incomplete evidence into a defensible retrofit
recommendation: what to improve, why, what it may achieve, and what to verify
before committing capital. Start from available data and make the limits of the
first screening result explicit.

The user's 2026-09-07 mission makes professional judgment and evidence-based
problem structure the development standard. Good taste means selecting the
important question and presenting its tradeoffs clearly. A useful model helps a
person inspect evidence, correct assumptions and explain a decision.

[[Business and Service Model]] defines the proposed initial customer, reviewed
decision package, assisted-service scope, test pricing and willingness-to-pay
experiments. These commercial hypotheses are not a launched paid service.
[[Energy0 Simulation Engine Research]] defines the proposed validation and
simulation programme; it is not an implemented replacement engine.

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

The gallery at `/` precedes these steps and has no diagnostic entry. Register
search is `/diagnostics/new?method=ledger`; retain the deliberate separation in
[[ADR-004 - The Landing Page Is a Model Gallery]].

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
- Conditioned floor area, gross source area, voids and below-grade scope must
  remain distinct. A source quantity's name alone does not establish the area
  appropriate for an energy-intensity denominator.

## User outcomes that matter

1. **Useful first screening.** Choosing a building should give the best supported
   initial result, with missing inputs visible. An unavailable result is preferable
   to a fabricated number when the minimum evidence is absent.
2. **Visible uncertainty.** The user can always see how much of the answer is
   assumed, and what would improve it.
3. **Refinement moves the number.** Correcting a value must change the result
   visibly, and must be reversible.
4. **Comparable investment options.** Physical work, costs and modeled benefits
   must share a baseline and scope. Funding-program controls were removed by
   user request; current economics use the unsubsidized baseline.
5. **A reviewable handover.** Another practitioner should be able to reconstruct
   the recommendation, identify unresolved evidence and plan the next action.
   Versioned professional review is a product priority, not a current paid feature.

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
| Decision package | Proposed reviewed baseline, alternatives, evidence register and verification plan |

## Uncertain

- The **commercial** model now has a concrete test proposal in
  [[Business and Service Model]]. Willingness to pay and the eventual charging
  unit remain unvalidated.
- The generative "describe a building" entry is **not reachable at runtime**.
  `/studio` has no `describe` branch — it redirects `draw` to `?method=create`,
  `diagnose` to `?method=upload`, and everything else to the landing page — and
  the prompt panel's only host, `generative-studio.tsx`, has no importer outside
  its own test. Whether it is meant to return, or to be deleted along with its
  API routes, is not settled in writing.

## Related

- [[Project Overview]] · [[Current State]]
- [[ADR-002 - Provenance as a Construction-Time Invariant]] · [[Traceable Energy Diagnostics]]
