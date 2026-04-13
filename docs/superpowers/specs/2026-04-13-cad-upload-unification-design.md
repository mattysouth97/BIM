# CAD Upload Unification — Design Spec

**Date:** 2026-04-13
**Author:** brainstorming session (GX team)
**Status:** Draft — awaiting user review
**Related:** `.omc/plans/cad-upload-workflow-plan.md` (original stub plan)

---

## Problem

The Upload stage accepts `.dxf`, `.dwg`, and `.pdf`, but the three paths behave inconsistently:

- **DXF** is parsed client-side into a ranked list of closed polylines; user picks a layer when ambiguous.
- **DWG** hits `/api/cad/convert`, which currently returns **HTTP 501** with the message *"Export the DWG as DXF… and upload the .dxf file."* No real conversion is implemented.
- **PDF** is rendered to a canvas; the user manually clicks each vertex and types an *approximate* building width in meters for scale calibration.

Because the three paths have different reliability profiles and no shared output contract, downstream code cannot reason about what it's holding. The authoring environment has no "structure and order" — the central design value this spec makes real.

## Goals

1. Produce **the same kind of structured output** from all three formats (DWG/DXF/PDF).
2. Make **DWG conversion actually work** server-side so users no longer see HTTP 501.
3. Replace the PDF "approximate width" guess with a **two-point ruler** calibration.
4. Publish a **DXF layer convention** (`BIM_OUTLINE`) so well-authored files ingest without a picker.
5. Surface **provenance + confidence** on the result so the fidelity system can differentiate exact/converted/traced downstream.

## Non-Goals

- **Pillar/column extraction.** Out of scope — deferred to a follow-up spec.
- **Auto-vectorization of PDFs.** Deferred — two-point manual trace only.
- **Strict-only layer convention** (no fallback picker). We ship the convention soft for now; tightening is a follow-up once adoption is observed.
- **Vercel serverless support for DWG conversion.** Spec assumes a long-running Node server; Vercel path is flagged as a risk.

## Architecture

### Shared output contract

All three ingest paths produce a single shape:

```ts
interface FootprintIngestResult {
  polygon: Polygon2D;             // [x, z] pairs in meters, bbox-centered
  areaSqm: number;
  source: "dxf" | "dwg" | "pdf";  // provenance
  confidence: "exact" | "converted" | "traced";
  layer: string | null;           // DXF layer name, "dwg-converted", or "pdf-trace"
  warnings: string[];
}
```

`confidence` mapping:
- `dxf` → `"exact"` (native parse, real units)
- `dwg` → `"converted"` (ODA → DXF → same parser)
- `pdf` → `"traced"` (user-clicked polygon + two-point ruler)

### Three ingest paths, two parsers

DXF and DWG collapse into one pipeline: `dwg → (ODA convert) → dxf text → parseDxfText`. Only PDF runs a different code path (client-side tracing). Two parsers total, not three.

```
┌────────────┐     ┌────────────────────────┐
│  .dxf      │────▶│ parseDxfText (client)  │──┐
└────────────┘     └────────────────────────┘  │
                                                │
┌────────────┐     ┌────────────────────────┐  │   ┌──────────────────────┐
│  .dwg      │────▶│ /api/cad/convert (ODA) │──┤──▶│ FootprintIngestResult│
└────────────┘     └────────────────────────┘  │   └──────────────────────┘
                                                │
┌────────────┐     ┌────────────────────────┐  │
│  .pdf      │────▶│ PdfTracer + ruler      │──┘
└────────────┘     └────────────────────────┘
```

### File layout

```
src/lib/cad/
  dxf-parser.ts           # existing — add BIM_OUTLINE priority logic
  pdf-to-polygon.ts       # existing — extended for two-point calibration
  ingest-result.ts        # NEW — shared output contract + type guards
src/app/api/cad/convert/
  route.ts                # REWRITE — real ODA conversion via child process
  oda-runner.ts           # NEW — pure wrapper around ODA binary (spawnable, testable)
src/components/upload/
  upload-stage.tsx        # modified — produce FootprintIngestResult uniformly
  pdf-tracer.tsx          # modified — two-point ruler UI replacing width input
  layer-picker.tsx        # modified — hidden when BIM_OUTLINE is present
```

## Data Flow per Path

### DXF (happy case)

1. User drops `.dxf` → `upload-stage.tsx` reads text.
2. `parseDxfText(text)` returns candidates sorted by area.
3. **New logic:** if any candidate's `layer === "BIM_OUTLINE"` (case-insensitive), skip the picker and use that candidate directly.
4. If `BIM_OUTLINE` is missing AND there are multiple candidates → show `LayerPicker` with a banner tip: *"Name your outline layer `BIM_OUTLINE` to skip this step."*
5. Wrap result as `{ source: "dxf", confidence: "exact", layer, … }`.

### DWG

1. User drops `.dwg` → client POSTs to `/api/cad/convert`.
2. `route.ts` writes the upload to a temp file (`os.tmpdir()/cad-<nanoid>.dwg`).
3. Calls `oda-runner.convertDwgToDxf(inputPath)`:
   - `spawn("ODAFileConverter", [inDir, outDir, "ACAD2018", "DXF", "0", "1", "*.dwg"])`
   - 30-second timeout; kills child on timeout.
   - Reads resulting `.dxf` file as text; cleans up temp files in `finally`.
4. Response body = DXF text (`Content-Type: text/plain`).
5. Client runs response through the DXF path from step 2 above — same parser, same layer logic.
6. Final wrap: `{ source: "dwg", confidence: "converted", layer: "dwg-converted", … }`.

### PDF (new two-point calibration)

1. User drops `.pdf` → `pdf-tracer.tsx` renders page 1 to canvas.
2. **New calibration phase (before tracing):** *"Click two points on a dimension line and enter the real-world distance."*
   - User clicks point A, then point B. Types distance in meters.
   - Live pixel-distance readout so the user can see what they're measuring.
   - Derives `metersPerPixel = realDistance / pixelDistance(A,B)`.
3. **Tracing phase (existing):** user clicks polygon vertices.
4. `pdfToPolygon` is extended to accept `metersPerPixel` directly — the old "approximate width" input is removed.
5. Final wrap: `{ source: "pdf", confidence: "traced", layer: "pdf-trace", … }`.

All three paths converge in `upload-stage.tsx` at the "ready" state, which stores the polygon to the recipe store (unchanged shape) and advances the workflow.

## Error Handling

| Failure | Response |
|---|---|
| DWG: ODA binary not installed on server | 500 with hint: *"DWG conversion unavailable on this server. Export as .dxf and retry."* (Dev-mode logs the missing binary path.) |
| DWG: ODA exits non-zero | 422 with stderr tail: *"DWG file could not be converted. Likely corrupted or from an unsupported CAD version (ODA supports up to AutoCAD 2018 format)."* |
| DWG: conversion timeout (>30s) | 504 with hint: *"Conversion took too long. Try a smaller drawing or a trimmed .dxf."* |
| DWG: file is actually a DXF in disguise (magic-byte check) | 400 with hint: *"This file is a DXF, not a DWG. Rename the extension and upload again."* |
| DXF: no closed polyline found AND `BIM_OUTLINE` absent | Existing error message, plus: *"Put the outline on layer `BIM_OUTLINE` for a one-click ingest."* |
| PDF: two ruler points coincide | Disable "continue to trace"; inline hint. |
| PDF: traced polygon area implausible (<1 m² or >1 km²) | Reject with hint to re-check ruler calibration. |

**No silent fallbacks.** If DWG conversion fails, the route does not degrade to "open raw bytes as text and hope." Every path either produces a valid `FootprintIngestResult` or a user-facing error. All new messages are bilingual (ko/en) per the existing pattern.

## Testing

**Unit tests (pure modules):**
- `dxf-parser.ts` — new cases: `BIM_OUTLINE` layer wins over larger unnamed ring; `BIM_OUTLINE` with under-threshold area still rejected; case-insensitive match. Extends `src/lib/cad/__tests__/dxf-parser.test.ts`.
- `pdf-to-polygon.ts` — new two-point API: correct `metersPerPixel`, rejects coincident points, round-trips a known scale. Extends `src/lib/cad/__tests__/pdf-to-polygon.test.ts`.
- `oda-runner.ts` (NEW) — tested with a mock spawn: success, non-zero exit, timeout, binary-missing. Module stays pure — the spawn function is passed in, not imported directly, so tests don't shell out.

**Integration tests (API route):**
- `src/app/api/cad/convert/__tests__/route.test.ts` — extend with a mocked `oda-runner`: assert DXF round-trip; 422 on ODA failure; 504 on timeout; 400 on magic-byte detection of DXF-named-as-DWG.

**Component tests:**
- `upload-stage.test.tsx` — extend: DXF with `BIM_OUTLINE` skips picker; DWG path hits `/api/cad/convert` then parser; error surfaces match the table above.
- `pdf-tracer.test.tsx` (NEW file) — two-point calibration UX: ruler click → click → distance input → tracing mode → confirm.

**Manual QA checklist** (not automated):
- Ingest the same building via DXF, DWG, and PDF. Polygons agree within ~5% area (PDF looser). This is the measurable version of "consistent and reliable results."

## Rollout & Migration

- `recipe-store.footprintPolygon` shape does not change — still `[outer, ...holes]` rings of `[x, z]`. `FootprintIngestResult` is a new upload-stage-local type; the workflow store continues to receive just the polygon. Downstream Digital Twin code is untouched.
- New `confidence`/`source` fields flow into `src/lib/fidelity/` in a later spec — out of scope here, captured as follow-up.
- Docs: short section in `CLAUDE.md` / `AGENTS.md` on the `BIM_OUTLINE` convention; in-app help text beside the dropzone points at the layer name.

## Risks

1. **ODA binary deployment.** Blocking if deploy target is Vercel serverless (150 MB binary exceeds 250 MB function size limit once other deps are added; cold-start spawn overhead is untenable). **Mitigation:** spec assumes a long-running Node server (Docker/VM/Fly.io/self-hosted). Conversion lives behind `oda-runner` so it can be lifted into a separate microservice without changing the client contract.
2. **ODA licensing / version skew.** The ODA File Converter EULA permits redistribution with attribution but is not OSS. No npm mirror. **Mitigation:** pin a specific ODA version in the Dockerfile; check binary version on route startup and log it.
3. **Two-point ruler precision depends on user choice.** Imprecise clicks on a scanned PDF produce off-scale polygons. **Mitigation:** live pixel-distance readout during point-picking; sanity range (≥10 m², ≤10 km²) on the resulting area.
4. **Scope creep toward pillar extraction.** Column/pillar detection is explicitly out of scope. **Mitigation:** the implementation plan must not add any column-related code paths; defer to a follow-up spec.

## Acceptance Criteria

- [ ] `.dxf` with `BIM_OUTLINE` layer ingests without prompting the user.
- [ ] `.dwg` upload hits ODA and returns a parsed footprint, not a 501.
- [ ] `.pdf` upload uses two-point ruler calibration; "approximate width" input is removed.
- [ ] All three paths produce `FootprintIngestResult` with correct `source` + `confidence`.
- [ ] Same building ingested through all three paths agrees within ~5% area (manual QA).
- [ ] All new error messages are bilingual (ko/en) per existing pattern.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` all green.

## Follow-ups (Explicitly Out of Scope)

- Pillar/column extraction from DXF (layer convention candidate: `BIM_COLUMN`).
- Auto-vector extraction from CAD-exported PDFs.
- Tightening `BIM_OUTLINE` from convention-preferred to strict-only.
- Wiring `confidence` into `src/lib/fidelity/` for the Digital Twin fidelity badge.
- Vercel serverless deployment path (separate microservice design).
