---
id: P2-22
title: BIM-benchmarked structural visualization + ISO 19650-2-aligned provenance
priority: P2
area: viewer
status: done
owner: claude-fable-5-session
effort: M
created: 2026-07-23
updated: 2026-07-23
use_cases: [UC-04, UC-05]
---

# P2-22 — Structural components the way real BIM tools show them

User direction: "Benchmark actual BIM programs to visualize the structural
components of a building. Try to adhere to ISO 19650-2 as much as possible."
Benchmark research (Revit/Navisworks/Tekla/Solibri/xeokit/BIMvision + IFC 4 +
ISO 19650-2 vs UK annex) is captured in
`docs/work-plan/knowledge/bim-structural-viz-benchmark-iso19650.md`.

## 1. Requirement (RE)
- Structural components visualized per real-BIM conventions; information
  management vocabulary aligned with ISO 19650-2 where honest.

## 2. Specification (SDD) — what landed
- **KBC 2016 structural overlay finally mounted**: `StructuralAnalysisLayer`
  (stress-colored columns, animated load-path arrows, foundation markers)
  existed since Phase 22 but was never instantiated — `StructuralTooltip`
  searched for a group no code created. Now generated in BuildingLayers under
  the "structure" layer group (existing toggle controls it; uTime arrow
  shaders picked up by updateAnimations automatically).
- **IFC 4 classification** (`src/lib/bim/ifc-classification.ts`, 10 tests):
  procedural mesh identities + ledger strctCd → IfcSlab.FLOOR/ROOF,
  IfcColumn, IfcWall (LoadBearing only for masonry families), IfcWindow vs
  IfcCurtainWall (curtain walls are by definition non-bearing),
  IfcMember.MULLION, with Pset-style LoadBearing/IsExternal + material
  family labels. Floor overlay shows the classification line.
- **Structural isolation view** (Revit structural-discipline analog): layer
  store `structuralIsolation` (session-only) + toolbar 구조 보기 toggle;
  non-load-bearing elements ghost to transparent gray (#9ca3af @ 0.12,
  depthWrite off — Solibri/xeokit x-ray idiom) via the shared
  clone-and-restore material effect; load-bearing structure stays solid and
  keeps retrofit tints.
- **ISO 19650-2-ALIGNED provenance** (`src/lib/bim/iso19650-status.ts`,
  2 tests): information containers for the federated sources — ledger =
  Published/A, CAD footprint = Shared/S2 (only when committed), estimated
  geometry/equipment = WIP/S0 — surfaced as chips in the BIM summary card.
  Explicitly labeled "aligned with", never "compliant" (19650 certifies a
  management process, not software); suitability codes noted as UK-annex
  vocabulary.

## 3. Constraints (CDD)
- **Must not**: claim ISO 19650 compliance; invent color standards without a
  citable source (Tekla-style palette deferred for that reason); break the
  P2-20 retrofit tints (ghost and tint share one restore map).

## 4. Evaluation (EDD)
- **Gates**: `pnpm test`; `pnpm lint`; `pnpm build`.
- **Acceptance criteria**:
  - [x] Structural overlay renders under the structure layer toggle
  - [x] Selection surfaces IFC class · bearing · material (unit-tested map)
  - [x] Isolation ghosts exactly the non-LoadBearing set
  - [x] Source containers show honest 19650-aligned status
- **Done when**: the twin reads like a BIM viewer on structure. 1277 tests,
  lint 0 errors, build green.
