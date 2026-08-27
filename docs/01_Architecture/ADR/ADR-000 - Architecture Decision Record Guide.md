---
type: adr
status: implemented
last_verified: 2026-08-27
---

# ADR-000 — Architecture Decision Record Guide

This is not a decision. It is the guide to the two ADR registers this repository
keeps, why there are two, and which one a given decision belongs in.

## Two registers, different jobs

| | `docs/01_Architecture/ADR/` (this folder) | [`docs/work-plan/adr/`](../../work-plan/adr/) |
|---|---|---|
| Records | **what the system is**, and why it is shaped that way | **a rule being broken**, deliberately, during a tracked work item |
| Trigger | a decision that changes the product's shape, a subsystem boundary, or a credibility invariant | AI_PROCESS rule **R3.2** — an item's `Must-not` or a global fitness function must be violated to complete the work |
| Filename | `ADR-NNN - Title.md` | `NNNN-short-title.md` |
| Reader | anyone joining the project | an agent executing a work item |
| Index | this folder, listed below | the table in that folder's `README.md` |

`docs/work-plan/adr/` **predates this vault, is referenced by name from
`CLAUDE.md` and `AI_PROCESS.md`, and must not be moved.** Link to it; do not
relocate it or copy its contents here. It currently holds one entry —
`ADR-0001 — factoryZones subdivision deferred past P2-12`, still `proposed`,
which by its own rule means it is awaiting a human decision.

### Deciding which register

```text
Does completing this work require breaking a stated Must-not,
a global fitness function (AFF-1…AFF-7), or a domain assumption
recorded in docs/work-plan/knowledge/domain-glossary.md?
        │
        ├── yes → docs/work-plan/adr/  (stop work, file it, wait for acceptance)
        │
        └── no  → is it a durable decision about product shape,
                  a subsystem boundary, or an honesty invariant?
                        ├── yes → here
                        └── no  → it is an ordinary change. No ADR.
```

Ordinary bug fixes, new work inside existing constraints, and refactors within
declared May-touch paths need **no** ADR in either register.

## Format used in this folder

```markdown
---
type: adr
status: implemented | partial | planned | deprecated | historical
last_verified: YYYY-MM-DD
---

# ADR-NNN — Short title

## Status

Accepted — YYYY-MM-DD. (Or: Proposed. Or: Superseded by ADR-NNN.)
Name what it supersedes, with a link.

## Context

The forces. What was true before, what problem it caused, and the evidence —
file paths, tests, or runtime behaviour. Not a narrative of the session.

## Decision

What was decided, in as few sentences as it takes. Quote the exact rule or
invariant if one changed.

## Consequences

What becomes allowed, required, or forbidden. Which code, tests, or documents
are affected. What follow-up work this creates — including work that is now
knowingly outstanding.

## Alternatives

Each option considered and why it lost, including "do nothing".
```

Rules that matter more than the template:

- **Only a human accepts an ADR.** An agent may write one and set it `Proposed`;
  merge is the acceptance signal. This mirrors gate G5 in `AI_PROCESS.md`.
- **Never edit an accepted ADR to reflect a new decision.** Write the next ADR
  and mark the old one superseded. The record of a reversal is more valuable than
  a tidy file — [[ADR-001 - Register-First Product Direction]] exists precisely
  because a direction was reversed.
- **Cite evidence, not planning documents.** The source-of-truth hierarchy in
  the vault README puts runtime evidence and tests above documentation. If the
  rationale for an existing decision cannot be recovered, write "Historical
  rationale not established." rather than inventing one.
- **Number sequentially and never reuse.** `ADR-000` is this guide.

## Index

| ADR | Subject | Status |
|---|---|---|
| ADR-000 | this guide | — |
| [[ADR-001 - Register-First Product Direction]] | the 건축물대장 is the primary entry; the generative engine is refinement input | Accepted 2026-08-27 |
| [[ADR-002 - Provenance as a Construction-Time Invariant]] | `createEnergyFact` throws rather than emitting an unsourced fact | Accepted |

## Decisions that are not yet ADRs

Load-bearing choices visible in the code with no ADR behind them. Each is a
candidate the next person to touch that area should consider writing up:

- **Two energy paths coexist.** The twin's numbers come from
  [use-energy-metrics.ts](../../../src/hooks/use-energy-metrics.ts) (the UI calls
  it 간이 모델), while the source-traceable engine lives behind
  `/diagnostics/new`. Whether these converge or stay separate is an open product
  decision, not a recorded one. See [[Data Flow]].
- **`ledger-baseline-model.ts` is a sibling of `tier-one-model.ts`, never an
  extension.** The reason is in the file header — sharing a `modelVersion` prefix
  would trip the Tier-1 acceptance gate in `validation.ts` — but it is not an ADR.
- **The envelope is whole-building, not per-storey.**
  [envelope-quantities.ts](../../../src/lib/energy/envelope-quantities.ts)
  derives gross wall area from one ring × total height. This bounds what
  per-storey plan data can ever change.
- **Below-grade storeys are recorded but not extruded**, because there is no
  ISO 13370 ground-coupling path in `src/lib/energy`.
- **cad-first mode and the `params` stage were retired** with the drafting
  surface, while `stages.ts` still implements both. Documented as unreachable in
  [[System Architecture]]; never decided in writing.

## Related

[[System Architecture]] · [[Data Flow]] ·
[AI_PROCESS.md](../../work-plan/AI_PROCESS.md) ·
[work-plan ADR index](../../work-plan/adr/README.md)
