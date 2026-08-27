---
type: adr
status: implemented
last_verified: 2026-08-27
---

# ADR-001 — Register-First Product Direction

## Status

Accepted — 2026-08-27. Supersedes the generative-only direction recorded in
[`handoff.md`](../../../handoff.md) on 2026-08-17.

## Context

On 2026-08-17 the product was deliberately moved to a **generative-only** entry:
buildings could enter only via a described prompt, a drawn schematic, or an
imported DWG/DXF/SVG. `handoff.md` recorded the decision as *"The ledger
(건축물대장 / data.go.kr) is no longer a data source."* The register API proxies,
hooks and search components were kept working but unlinked from the front door.

That direction had a structural problem: it required the user to supply the
building before the product could say anything. Every path began with data entry.
Meanwhile the 건축물대장 already holds — for essentially every building in Korea —
floor areas, storey counts above and below grade, height, main use, structure,
roof type, approval and permit dates, and a per-floor outline. That is enough to
produce a real multi-storey energy model with **no user input at all**.

## Decision

The 건축물대장 is the primary entry point again. The product is four fixed steps:

```text
건물 검색  →  도면 업로드  →  디지털 트윈  →  보고서
```

The landing page *is* the register search. The generative engine (prompt,
schematic editor, CAD import) becomes **refinement input** and a secondary door
rather than the front door.

## Alternatives

1. **Keep generative-only.** Rejected: it demands data entry before the first
   answer, and discards a national dataset that is already sufficient for a
   baseline.
2. **Two co-equal front doors** (register *and* generative). Rejected: the
   repository had already drifted into two competing entry screens twice, and
   both times it made the product harder to explain. One workflow, one door.
3. **Remove the generative path entirely.** Rejected: drawing a floor plan is
   genuinely how a user refines a baseline toward the real building, so the
   schematic editor earns its place — as step 2, not as an entry.

## Consequences

**Easier**

- First answer costs one click: choose a building.
- The whole national building stock is addressable without per-building setup.
- Refinement has a meaningful baseline to move *away from*, which is what makes
  a delta interpretable.

**Harder**

- The product now depends on a flaky external service. The register's four
  endpoints fail independently and intermittently, which forced deliberate
  resilience work (see [[Integration Map]]).
- Anonymous visitors need a lookup key. Resolved with a shared server key,
  same-origin only and rate-limited per IP, with the visitor's own key taking
  precedence — see [[Deployment and Environment]].
- The register states nothing about thermal performance, so the product must
  carry a rigorous account of what is measured versus assumed. That constraint
  produced [[ADR-002 - Provenance as a Construction-Time Invariant]].

## Implementation

- Landing / search — [`ledger-lookup.tsx`](../../../src/components/energy-diagnostics/ledger-lookup.tsx),
  [`cad-sheet.tsx`](../../../src/components/landing/cad-sheet.tsx)
- Register proxy and shared key — [`_factory.ts`](../../../src/app/api/bldrgst/_factory.ts),
  [`api-shared-key.ts`](../../../src/lib/api-shared-key.ts)
- Register → source → model — [`ledger-source.ts`](../../../src/lib/energy-diagnostics/ledger-source.ts),
  [`ledger-baseline-model.ts`](../../../src/lib/energy-diagnostics/ledger-baseline-model.ts)
- The four-step machine — [`stages.ts`](../../../src/lib/workflow/stages.ts),
  [`workflow-stepper.tsx`](../../../src/components/workspace/workflow-stepper.tsx)

## Related

[[Product Intent]] · [[Current State]] · [[Data Flow]] ·
[[ADR-002 - Provenance as a Construction-Time Invariant]]
