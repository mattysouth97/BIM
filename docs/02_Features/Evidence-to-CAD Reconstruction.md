---
type: feature
status: implemented
last_verified: 2026-09-02
---

# Evidence-to-CAD Reconstruction (증거 기반 도면 복원)

## Purpose

[[CAD Drawing Ingest]] answers "the user has a drawing". This answers the far
more common case: **the user has no drawing and never will**. Most Korean
buildings old enough to need an energy retrofit have no surviving CAD, and the
upload step was a dead end for them — the only escape was `CAD 없이 계속`, which
falls back to a rectangle synthesised from 건축면적.

The reconstruction module turns the evidence the app *already holds* into an
editable, source-traceable DXF: the 건축물대장, the VWorld GIS building outline,
the era-indexed code tables, plus whatever the user states in a sentence.

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

In descending authority, and the choice is recorded in `footprint.method`:

| Evidence | Grade | Notes |
|---|---|---|
| VWorld GIS 건물 외곽 | `B-OBSERVED` | Projected to a site-centred TM frame, survey noise simplified out |
| User-stated width × depth | weaker of the two claims | A rectangle; shape itself is still an inference |
| 건축면적 alone | `D-INFERRED` | Solved rectangle, depth ≤ 18 m and aspect ≤ 2.5:1 where the area allows |
| none of the above | `X-UNRESOLVED` | A blocker is recorded and the drawing is not offered |

**An observed outline is never rescaled to hit the registered area.** When the
GIS outline and 건축면적 disagree the outline keeps its own geometry and a
conflict is recorded with the disagreeing ring drawn on `X-CONFLICT`.

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
vs GIS storey count, register height vs GIS height, and stated dimensions vs
건축면적. Neither side of a conflict is deleted.

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
