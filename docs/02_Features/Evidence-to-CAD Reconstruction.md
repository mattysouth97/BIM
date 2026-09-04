---
type: feature
status: implemented
last_verified: 2026-09-04
---

# Evidence-to-CAD Reconstruction (증거 기반 도면 복원)

## Purpose

[[CAD Drawing Ingest]] answers "the user has a drawing". This answers the far
more common case: **the user has no drawing and never will**. Most Korean
buildings old enough to need an energy retrofit have no surviving CAD, and the
upload step was a dead end for them — the only escape was `CAD 없이 계속`, which
falls back to a rectangle synthesised from 건축면적.

The reconstruction module turns the evidence it can gather into an editable,
source-traceable DXF: the 건축물대장, the VWorld GIS building outline, the
OpenStreetMap outline, the era-indexed code tables, an opt-in web search, plus
whatever the user states in a sentence. Where two maps disagree about the
building's shape, the disagreement is reported rather than resolved by
whichever source happened to be asked first.

## User / System Outcome

On the 도면 업로드 step there is a prompt module. The user writes what they know
— or nothing at all — and presses 도면 복원. They get:

- a plan preview colour-coded by provenance;
- an area validation table comparing every registered floor area against the
  model's recomputed area;
- the geometric control network, the assumption ledger, the conflict register,
  the automated QA verdict, and a ranked field-verification plan;
- eight downloadable deliverables, including the DXF;
- a `이 복원 도면 사용` action that feeds the twin.

## Non-negotiable: a reconstruction is not a drawing

See [[ADR-003 - Reconstruction Is Not Evidence]]. Three enforced consequences:

1. Every object carries a grade — `A-VERIFIED`, `B-OBSERVED`, `C-CALCULATED`,
   `D-INFERRED`, `X-UNRESOLVED` — and the grade survives into the DXF (inferred
   geometry lands on `X-VERIFY`, contradictions on `X-CONFLICT`, and an
   unmeasured dimension is annotated `≈… (추정)`).
2. The drawing reaches the twin through the **same DXF ingestion path an
   uploaded file uses**, so the footprint is read back out of the file rather
   than handed over from memory.
3. It is recorded as `reconstructedFootprint: true`, never `hasCadFootprint`.
   The twin's stated precision does not rise.

## Pipeline

```text
EvidenceInput (register + GIS + user claims)
   ↓ evidence.ts      source inventory · control network C1–C14 · conflicts
   ↓ reconstruct.ts   footprint · levels · walls · openings · core · grid
   ↓                  elevations and sections DERIVED from the same model
   ↓ dxf.ts           AC1015 ASCII, mm, 1:1, layered
   ↓ qa.ts            geometry · area · cross-drawing · DXF · round trip
   ↓ report.ts        evidence register · assumption ledger · conflicts · QA
```

`ReconstructionModel` is the single source of geometry. Plans, elevations,
sections, the preview and every report are generated from it in one pass, so
they cannot disagree with each other.

## How the footprint is decided

Every outline the scan finds becomes a *candidate*, and the winner is reconciled
against the others (`outline-candidates.ts`). This replaced a fixed if/else
chain in which the first source that answered won and the others were never
compared to it — defensible only while exactly one source can ever answer.

| Evidence | Grade | Notes |
|---|---|---|
| VWorld GIS 건물 외곽 | `B-OBSERVED` | Government layer, authority 3. Site-centred TM frame |
| OpenStreetMap 건물 외곽 | `B-OBSERVED` | Authority 4 — a real trace, but crowd-sourced. Needs no API key |
| User-stated width × depth | weaker of the two claims | `observed` only when the user says both were *measured* |
| 건축면적 alone | `D-INFERRED` | Solved rectangle, depth ≤ 18 m and aspect ≤ 2.5:1 where the area allows |
| VWorld 연속지적도 필지 | `B-OBSERVED`, site only | **Never eligible as a footprint** — a lot is not a building |
| none of the above | `X-UNRESOLVED` | A blocker is recorded and the drawing is not offered |

**Every outline source this app has tried has, at least once, handed back
something that is not the building.** VWorld has returned the cadastral lot
(7,060 m² reported as a 400 m² building), and separately an outbuilding on a
school campus (95 m² reported as a building whose register states 2,749.71 m²,
with `source: "building"` true both times). The web search read `1만2709m² 부지`
— the land — as the footprint. Three sources, three ways of mistaking the site
or a neighbour for the structure. That is the argument for reconciling sources
rather than trusting whichever one answered, and it is worth stating as an
observed pattern rather than as a principle.

Four rules govern the choice:

1. **A site ring is never a building footprint.** Until 2026-09-04 a missing
   `!gisRingIsParcel` guard let a cadastral lot reach controls C5/C6 at
   `B-OBSERVED`; a 400 m² building on a 7,000 m² lot produced a 7,068 m²
   footprint attributed to a user statement nobody had made, and every floor
   then collapsed to `X-UNRESOLVED`. Regression: `evidence-parcel-guard.test.ts`.
2. **Observed outranks solved, always.** Area agreement with 건축면적 separates
   peers within a tier — in 5 % bands, so noise cannot flip provenance — and
   never promotes a solved rectangle over a traced ring.
3. **A losing observed ring is never deleted.** It keeps its geometry on a
   conflict entry and is drawn on `X-CONFLICT`.
4. **Observed does not outrank impossible.** A candidate whose area cannot be
   reconciled with a stated 건축면적 (outside 0.5×-2.0×) is set aside before the
   tiers are compared, so an honest `D-INFERRED` rectangle of the right size
   beats a confidently wrong `B-OBSERVED` trace. The band is wide on purpose —
   eaves, an L-plan and a courtyard all make a traced ring differ legitimately —
   because this is not a tolerance check. With no 건축면적 stated the question is
   unanswerable and the answer is "plausible".

Overlap between two observed outlines is reported as IoU, area delta and centre
offset. IoU is estimated by sampling a 160² grid rather than by exact polygon
clipping: the number only ever decides "same building or not" against a 0.75
threshold, and the sampling error is far below that margin.

**An observed outline is never rescaled to hit the registered area.** When an
outline and 건축면적 disagree the outline keeps its own geometry and the
disagreement is recorded.

### Squaring up

A traced ring carries a few hundred millimetres of digitising noise per corner,
which drawn as-is becomes dozens of walls that splay by a degree or two.
`outline-regularize.ts` recovers the building's own axis (a length-weighted
circular mean at 4×, so the four walls of a rectangle reinforce one estimate)
and pins each wall to it.

It fires only on outlines that are already ≥ 70 % orthogonal, so a triangular or
splayed plan is left exactly as traced. The result is discarded — and the input
returned untouched, with a reason — if it self-intersects, drifts the area past
3 %, or drags a corner past 1.2 m. The module can square a building up; it
cannot turn one building into another.

## Aerial imagery (opt-in)

`/api/imagery/ortho` proxies VWorld's WMTS so the ortho tile can be drawn under
the plan. It is a **verification aid and nothing else**: no value in the model
derives from it, it produces no outline candidate, and the toggle says
"치수 근거 아님". The boundary is what makes it safe — a traced roof would be a
fourth candidate needing a grade; an image a person looks at cannot quietly
become a source something else cites.

Tiles are placed by their own projected corners rather than by scaling a mosaic.
No imagery is drawn at all when the model has no georeference: imagery in the
wrong place is worse than none.

## What the user can see

`ReconstructionModel.outlineScan` records the whole decision — every candidate,
which one won, how the observed sources compared, and whether squaring-up fired
or refused — and the panel renders it as 외곽선 대조. A reconciliation the user
cannot inspect is one they cannot check.

Per-level plates *are* scaled to their registered area, uniformly about the
centroid — the area is a verified control, the shape is not. An above-grade
floor demanding more than 105 % of the grade footprint is a contradiction, not
a scale factor: it becomes `X-UNRESOLVED` plus a conflict.

## The prompt module

`parseClaimStatements` (deterministic, Korean and English) reads dimensions,
areas, storey counts, orientation, roof form and structure out of free text.
`POST /api/cad/reconstruct` runs the same statement through the reasoning
provider when `ANTHROPIC_API_KEY` is configured; the model reads **intent
only** — it emits no coordinates, and `normaliseProvidedClaims` re-derives every
grade from the user's own words, so a model cannot promote a guess to
`A-VERIFIED`. Without a key the rule-based reader is the path, not a stub.

`A-VERIFIED` requires the user to say the value was measured ("실측", "줄자",
"도면상", "measured"). A belief stays `D-INFERRED`. An out-of-range value is
dropped with a note rather than clamped.

## Conflict detection

Cross-checked every run: 건축면적 vs GIS outline area, 건폐율 stated vs computed,
용적률 stated vs computed, 연면적 vs the 층별개요 row sum, register storey count
vs GIS storey count, register height vs GIS height, stated dimensions vs
건축면적, GIS vs OSM outline shape, register vs OSM `building:levels` and
`height`, and register vs any web-search finding. Neither side of a conflict is
deleted.

## Web search (opt-in)

`POST /api/cad/web-evidence` searches the open web for what is published about
the building. It is the weakest source in the inventory — authority 5,
`dimensionsAvailable: false` — and it builds no geometry and overrides no
registered value.

**The register's values are never sent to the model.** Passing 건축물대장 figures
in and asking "is this right?" would produce a worthless answer: a model shown a
number finds that number. The search runs blind on name and address, and the
comparison happens afterwards in `webFactConflicts`, which is pure and tested.
An agreement is only evidence if the two sides were independent.

Every returned fact is re-validated against rules the model cannot influence: no
http(s) citation URL, no verbatim quote, an unknown kind or an implausible
number and it is dropped; the grade is forced to `D-INFERRED` whatever the model
claimed. Searched-and-found-nothing stays distinct from never-searched.

Korean area terms are mapped explicitly in the prompt because they read alike
and the model conflated them in testing: 건축면적 is the footprint, 연면적 the
gross floor area, and 대지면적 / 부지 the *land*, which has no kind and is
excluded — reporting it as a footprint would claim the building covers its lot.

## What is deliberately NOT generated

Stated in every QA report, because an omission the reader cannot see is the same
failure as an invention they cannot see:

- **Interior partitions** beyond the core. There is no evidence for room
  boundaries; leaving the tenant area open is more accurate than drawing a
  plausible plan.
- **MEP, electrical and fire drawings.** `M-`, `E-`, `P-`, `F-` layers are
  defined and empty.
- **Paper-space layouts.** Sheet borders and title blocks are drawn on the
  `SHEET` layer in model space instead; QA reports this as SKIP, not PASS.
- **PDF sheets.**

## DXF

AC1015 (R2000) ASCII, `$INSUNITS = 4` (mm), 1:1, model space organised as
plans → elevations → sections in documented rows. R2000 rather than R2018 on
purpose: the later formats add object structures this writer does not produce,
and claiming a version whose objects are absent is the kind of unverifiable
assertion the pipeline exists to avoid.

Real entities throughout — `LWPOLYLINE`, `LINE`, `TEXT`, `INSERT`, and genuine
`DIMENSION` entities each backed by an anonymous `*Dn` block, the form AutoCAD
itself writes. Reusable blocks: `A-DOOR-SINGLE`, `A-WIND-CASEMENT`,
`NORTH-ARROW`, `SEC-MARK`.

The grade-level outline is written to the reserved `BIM_OUTLINE` layer, which
[dxf-parser.ts](../../src/lib/cad/dxf-parser.ts) already promotes above
area-ranked peers. `UploadStage` now honours that promotion (`preferredCandidate`),
so a drawing using the reserved layer skips the layer picker — the parser
documented this intent; the UI simply had never implemented it.

## QA

25 checks in seven groups. The round-trip group reopens the written DXF with
**the application's own importer** and compares area, vertex count and bounding
box against the model; a file that cannot be read back is a failure regardless
of how the geometry looked in memory.

## Code

- [src/lib/cad-reconstruction/](../../src/lib/cad-reconstruction/) — types,
  geometry, claims, evidence, reconstruct, dxf, qa, report
- [src/lib/cad-reconstruction/server/interpret-claims.ts](../../src/lib/cad-reconstruction/server/interpret-claims.ts) — server-only statement reader
- [src/app/api/cad/reconstruct/route.ts](../../src/app/api/cad/reconstruct/route.ts)
- [src/components/upload/cad-request-panel.tsx](../../src/components/upload/cad-request-panel.tsx)
- [src/components/upload/reconstruction-preview.tsx](../../src/components/upload/reconstruction-preview.tsx)

## Verification

- `src/lib/cad-reconstruction/__tests__/` — 43 unit tests, including the DXF
  round trip through `parseDxfText` and `mapDxfTextToDoc`
- `src/components/upload/__tests__/cad-request-panel.test.tsx` — 5 component tests
- `e2e/cad-reconstruction.spec.ts` — 5 end-to-end tests on the sample building
- Runtime, sample building, 2026-09-02: 12 levels, 816 m² footprint,
  QA 24 PASS / 0 FAIL / 1 SKIP, every floor area matching at 0.0 %, one real
  conflict found (용적률 492.36 % stated vs 631.76 % computed).

## Related

[[CAD Drawing Ingest]] · [[Traceable Energy Diagnostics]] ·
[[Twin Fidelity and IFC Engine]] · [[ADR-002 - Provenance as a Construction-Time Invariant]]
