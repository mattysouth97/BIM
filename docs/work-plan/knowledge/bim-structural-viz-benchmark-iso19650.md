# BIM structural-visualization benchmark & ISO 19650-2 alignment (2026-07-23)

Research basis for P2-22. Compiled from vendor docs and standards texts;
source URLs inline.

## 1. How real BIM tools present structural components

- **Revit (Structure discipline)**: a view's Discipline property drives
  display; Structural **hides non-load-bearing walls entirely** (filter key:
  the wall's *Structural* instance parameter). Halftone/ghosting is the MEP
  discipline behavior, not Structural. No documented category color standard —
  default material gray, colors via Object Styles/view filters.
  (knowledge.autodesk.com, modelical.com)
- **Navisworks**: isolation = Hide Unselected + Require; hidden context
  renders ghosted gray-transparent. Appearance Profiler colors by
  search/selection set (rule-driven, no fixed defaults).
- **Tekla Structures**: default "Color by class" — integer part Class maps to
  fixed colors (training convention: 2=red concrete, 3=green steel, 4=blue
  beams). Color encodes structural system, assigned by the modeler.
  (support.tekla.com)
- **Solibri**: checking visualization "Transparent" mode = problem components
  highlighted, everything else transparent — the canonical ghost-context
  pattern. (help.solibri.com)
- **Web viewers**: xeokit formalizes ghosting as EmphasisMaterial
  (xrayed/highlighted/selected per entity); BIMvision shows one-click
  properties (dimensions, material, GUID) + storey→type→element tree.
- **Universal minimum on selection**: IFC class + PredefinedType, Name,
  containing storey, material, and Pset_*Common (LoadBearing, IsExternal,
  FireRating).

## 2. IFC taxonomy applied to our procedural model

IfcSlab (FLOOR/ROOF/BASESLAB/LANDING), IfcColumn, IfcBeam, IfcWall vs
IfcCurtainWall (curtain walls have NO LoadBearing in Pset_CurtainWallCommon —
by definition non-bearing), IfcFooting, IfcMember (MULLION). LoadBearing is
exactly the flag Revit's structural discipline filters on → the honest basis
for our isolation toggle. Implemented in `src/lib/bim/ifc-classification.ts`.

## 3. ISO 19650-2 — what honestly applies to a web twin

- The **international text** mandates: information containers in a CDE moving
  WIP → Shared → Published → Archived, each with unique ID (agreed project
  convention), status, revision, classification metadata; and a federation
  strategy.
- The **UK National Annex** (not the ISO core) adds the field scheme
  Project–Originator–Volume/System–Level–Type–Role–Number and suitability
  codes S0 (WIP), S1–S4/S6–S7 (Shared), A/B (Published). S5 withdrawn.
- **LOIN** is EN 17412-1 → ISO 7817-1:2024, a separate standard.
- **Honest for us**: container status + suitability vocabulary for our
  federated sources (ledger=Published/A, CAD=Shared/S2, estimated=WIP/S0) —
  implemented in `src/lib/bim/iso19650-status.ts`, surfaced as chips in the
  BIM summary card, explicitly labeled "aligned with", never "compliant"
  (ISO 19650 certifies a management process, not software).

## 4. Ranked recommendations (value ÷ effort) and status

1. **IFC class + metadata on selection** — ✅ P2-22 (`ifc-classification.ts`,
   floor-overlay IFC line).
2. **Structural isolation with ghosted context** — ✅ P2-22 (LoadBearing
   filter, transparent-gray ghost, toolbar 구조 보기 toggle). Also wired the
   orphaned KBC 2016 StructuralAnalysisLayer (stress-colored columns, load
   arrows, foundations) into the structure layer.
3. **ISO 19650-style source/status panel** — ✅ P2-22 (summary-card chips).
4. **Tekla-style material color coding** — deferred: no citable
   cross-industry default palette; implement as an alternate representation
   mode if requested.
