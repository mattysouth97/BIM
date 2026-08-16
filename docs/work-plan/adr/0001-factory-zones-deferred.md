# ADR-0001 — factoryZones subdivision deferred past P2-12

- **Status**: proposed
- **Date**: 2026-07-21
- **Related items**: P2-12
- **Deciders**: <human approver> (author: claude-fable-5-session)

## Context

`BuildingRecipe.factoryZones` (`src/lib/procedural/types.ts:96-112`) is produced by
`getFactoryRecipe()` (`src/lib/procedural/factory-recipe.ts:121-166`) but is consumed by no
generator. P2-12's acceptance criteria require: "factoryZones consumed by a generator OR
removed (with ADR note if removed)."

P2-12 also declares the hard constraint: "regress the instancing structure (facade stays 4
InstancedMesh per section)" and the global fitness function: "Draw calls per rectangular
building stay bounded (facade 4 + slabs/columns instanced); texture wiring adds zero new draw
calls."

Consuming `factoryZones` as intended — splitting the building footprint into horizontal zones
(process area, office section, loading dock, warehouse) — requires one of:
- Per-zone sub-recipes each producing their own 4-IM facade group (N zones × 4 IMs = 4–16
  new draw calls per factory building), which violates the draw-call AFF; or
- A fundamentally different geometry approach (composited footprint splitting, zone-level
  LOD switching) not designed or scoped in P2-12.

Removing `factoryZones` from the type and recipe code would delete a designed extensibility
point and require a follow-up to re-add the concept — net negative.

## Decision

`factoryZones` is left in the type definitions and factory recipe output for P2-12. It is
neither consumed nor removed. A follow-up item (P3-xx or a dedicated factory-building item)
will design the zone-subdivision geometry with an explicit draw-call budget decision.

P2-12 marks this specific acceptance criterion: "factoryZones consumed by a generator or
removed" as DEFERRED, with this ADR as the record, so the checkbox is not ticked.

## Consequences

**Positive:**
- P2-12 ships without violating the draw-call AFF.
- The `factoryZones` type and data structure survive intact for the future consumer.
- No production code is deleted that would need to be re-added.

**Negative:**
- Factory buildings (mainPurpsCd 17000/18000) continue to render as a single uniform mass,
  ignoring the zone layout.
- One P2-12 acceptance criterion is deferred rather than met.

Follow-up: create a new item "P3-xx: factory zone subdivision geometry" that designs the
zone rendering path with an explicit draw-call budget (likely 4 IMs per zone section, budget
capped at 3 zones × 4 = 12 IMs for standard factories).

## Alternatives

**Consume factoryZones with per-zone facade groups**: produces 4–16 extra IMs per factory;
violates the P2-12 AFF and the "zero new draw calls" constraint. Rejected.

**Remove factoryZones**: deletes designed extensibility. Would require its own ADR for the
type removal and a future re-add. Net worse than leaving it. Rejected.

**Do nothing (silent skip)**: no ADR, no acceptance-criteria note. Violates the process
requirement to document Must-not constraint interactions. Rejected.
