---
type: adr
status: implemented
last_verified: 2026-08-27
---

# ADR-002 — Provenance as a Construction-Time Invariant

## Status

Accepted. Implemented in `src/lib/energy-diagnostics/facts.ts`.

## Context

The product's answer is assembled from two very different kinds of value:

- what the 건축물대장 **states** — floor areas, storey counts, height, main use,
  structure, dates;
- what has been **assumed** on the building's behalf — every U-value, the
  window-to-wall ratio, airtightness, HVAC efficiency, lighting power density,
  occupancy, and the plan outline when no drawing exists.

A user acting on the result needs to know which is which. An energy figure that
silently mixes a measured floor area with a guessed U-value, and presents both
with the same confidence, is worse than no figure — it invites investment
decisions on invented data.

Convention alone does not hold this line. A single well-meaning helper that
attaches the register's source references to a defaulted value would erase the
distinction everywhere downstream, and would look entirely reasonable in review.

## Decision

Provenance is enforced where facts are **constructed**, not where they are
displayed. `createEnergyFact` throws unless a non-missing fact satisfies at least
one of:

- it carries at least one `sourceRef`, or
- it names an `assumptionId`, or
- its `extractionMethod` is `"user_input"`.

An era-table U-value therefore *cannot be constructed* without naming the
`AssumptionRecord` that explains it. Honesty becomes a property of the type
system's runtime guard rather than a review checklist.

Supporting rules that follow from the same principle:

- Era defaults carry `sourceRefs: []` and `confidence: null`. Nothing in the
  register is evidence for a thermal property.
- A **documented zero** (`platArea=0`, `heit=0`, `bcRat=0`) means *unavailable* in
  this API and must emit **no fact at all**. A missing value is honest; a zero is
  a lie.
- Era must be classified by `classifyEraExplicit`, which reports whether a date
  was actually read. The general-purpose `classifyEra` silently returns
  `1990-1999` for a blank date, and era selects every U-value, the window ratio,
  airtightness and floor height.
- A boundary synthesised from 건축면적 is `deterministic_rule_inference`, never
  `dimensioned_vector_geometry`. Ingestion previously stamped *every* supplied
  ring as dimensioned survey geometry.
- ACH50 from the code tables is divided by 20 to reach a natural air-change rate.
  A 20× ventilation overstatement still produces a plausible-looking building.

## Alternatives

1. **Display-layer labelling.** Mark assumptions in the UI only. Rejected: the
   label is one refactor away from being dropped, and any new surface starts
   unlabelled by default.
2. **A confidence score per value.** Rejected: a single blended number hides the
   distinction it is supposed to expose, and the repository already had two such
   scores that buried provenance.
3. **Refuse to produce a number without measured data.** Rejected: it would make
   the product useless for the case it exists to serve — a building nobody has
   surveyed yet.

## Consequences

**Easier**

- Every value can be traced to a document reference or a named, reversible
  assumption.
- Refinement has a precise meaning: raise a value's evidence status and retire
  the assumption it replaces.
- Regressions are caught at construction, not in review.

**Harder**

- Builders cannot take shortcuts. A derived value whose inputs carry no evidence
  must degrade to a named assumption rather than being computed silently — this
  actually surfaced as a crash on a real 강남구 apartment whose register records
  no 높이, and was fixed by degrading rather than by relaxing the invariant.
- Every new fact-producing path must decide, explicitly, what it is claiming.

## Implementation

- [`facts.ts`](../../../src/lib/energy-diagnostics/facts.ts) — `createEnergyFact`, `replaceFact`, `collectEnergyFacts`
- [`types.ts`](../../../src/lib/energy-diagnostics/types.ts) — `EvidenceStatus`, `EvidenceAuthority`, `ExtractionMethod`, `AssumptionRecord`
- [`ledger-baseline-model.ts`](../../../src/lib/energy-diagnostics/ledger-baseline-model.ts) — `assumptionFact` / `inferredFact` / `derivedFact`
- [`floor-rows.ts`](../../../src/lib/ledger/floor-rows.ts) — `classifyEraExplicit`
- [`refinement.ts`](../../../src/lib/energy-diagnostics/refinement.ts) — provenance on upgrade

**Tests**

- [`ledger-baseline-model.test.ts`](../../../src/lib/energy-diagnostics/__tests__/ledger-baseline-model.test.ts)
- [`refinement.test.ts`](../../../src/lib/energy-diagnostics/__tests__/refinement.test.ts)
- [`ingestion-boundary-provenance.test.ts`](../../../src/lib/energy-diagnostics/__tests__/ingestion-boundary-provenance.test.ts)

## Related

[[Product Intent]] · [[ADR-001 - Register-First Product Direction]] ·
[[Current State]]
