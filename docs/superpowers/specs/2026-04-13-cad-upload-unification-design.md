# CAD Upload Unification — Design Spec

**Date:** 2026-04-13 (revised 2026-04-15 to match shipped WASM architecture)
**Author:** brainstorming session (GX team)
**Status:** Revised — shipped items marked DONE; remaining items drive the implementation plan
**Related:** `.omc/plans/cad-upload-workflow-plan.md` (original stub plan)

---

## Problem

The Upload stage accepts `.dxf`, `.dwg`, and `.pdf`, but the three paths historically behaved inconsistently:

- **DXF** parsed client-side into ranked closed polylines; user picks a layer when ambiguous.
- **DWG** returned HTTP 501 with a "please export as DXF" hint. (Now shipped — see below.)
- **PDF** renders to a canvas; the user manually clicks vertices and types an *approximate* building width in meters.

Because the three paths have different reliability profiles and no shared output contract, downstream code cannot reason about what it's holding. The authoring environment lacks the "structure and order" that is the central design value this spec makes real.

## Goals

1. Produce **the same kind of structured output** from all three formats (DWG/DXF/PDF). *(partially shipped — see Status)*
2. Make **DWG conversion actually work** so users no longer see HTTP 501. **(shipped)**
3. Replace the PDF "approximate width" guess with a **two-point ruler** calibration. *(not yet shipped)*
4. Publish a **DXF layer convention** (`BIM_OUTLINE`) so well-authored files ingest without a picker. *(not yet shipped)*
5. Surface **provenance + confidence** on the result so the fidelity system can differentiate exact/converted/traced downstream. *(not yet shipped)*

## Non-Goals

- **Pillar/column extraction.** Out of scope — deferred to a follow-up spec.
- **Auto-vectorization of PDFs.** Deferred — two-point manual trace only.
- **Strict-only layer convention** (no fallback picker). Ship the convention soft; tightening is a follow-up once adoption is observed.

## Status at Spec Revision (2026-04-15)

| Item | State |
|---|---|
| DWG conversion | **Shipped.** Client-side WASM via libdxfrw + server fallback route. |
| DWG header magic validation | **Shipped.** Both client and server reject non-`ACxxxx` files. |
| PDF ArrayBuffer detachment fix | **Shipped** (commit 2476c68). |
| `BIM_OUTLINE` DXF layer convention | **Not started.** |
| PDF two-point ruler calibration | **Not started.** |
| Shared `FootprintIngestResult` contract | **Not started.** |
| Fidelity wiring (`confidence` consumption) | **Out of scope.** Follow-up spec. |

The rest of this document describes the target architecture including both shipped and remaining pieces, so anyone reading the spec from scratch sees one coherent picture.

## Architecture

### Shared output contract *(remaining work)*

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
- `dwg` → `"converted"` (WASM-libdxfrw or server-fallback → DXF → same parser)
- `pdf` → `"traced"` (user-clicked polygon + two-point ruler)

The upload-stage currently uses a local ad-hoc `UploadStatus` shape without provenance. This spec's implementation plan introduces the shared contract and wires all three paths through it.

### Three ingest paths, two parsers

DXF and DWG collapse into one pipeline: WASM conversion produces DXF text, which runs through `parseDxfText`. Only PDF takes a different code path (client-side tracing). Two parsers total, not three.

```
┌────────────┐     ┌────────────────────────┐
│  .dxf      │────▶│ parseDxfText (client)  │──┐
└────────────┘     └────────────────────────┘  │
                                                │
┌────────────┐     ┌────────────────────────┐  │   ┌──────────────────────┐
│  .dwg      │────▶│ parseDwgFile (WASM)    │──┤──▶│ FootprintIngestResult│
│            │     │  └─ fallback → server  │  │   └──────────────────────┘
└────────────┘     └────────────────────────┘  │
                                                │
┌────────────┐     ┌────────────────────────┐  │
│  .pdf      │────▶│ PdfTracer + ruler      │──┘
└────────────┘     └────────────────────────┘
```

### DWG path details *(shipped)*

Primary path is **client-side WASM** via `libdxfrw`:

1. `parseDwgFile(file)` reads the file into an ArrayBuffer.
2. `readDwgHeader(buffer)` validates the `ACxxxx` magic (rejects non-DWG files with a clear warning).
3. `getWasmModule()` lazy-loads `/wasm/libdxfrw.js` on first use; the ~1.4 MB module is cached for subsequent conversions. Cache is reset on load failure so the next upload retries.
4. `DRW_FileHandler.fileImport()` + `fileExport(DRW_Version.AC1021, …)` produces DXF text in-browser.
5. Result is piped through `parseDxfText` — same ranking, same units, same layer logic.

Fallback path: if WASM loading fails (e.g. SSR context, script-load error), `parseDwgFile` POSTs to `/api/cad/convert`. The server route validates extension, size, and magic bytes, then shells out to an external converter configured via `DWG_CONVERTER_PATH` env var (ODA File Converter or a simple `<bin> <in> <out>` style tool via `DWG_CONVERTER_MODE=simple`). If no converter is configured, the route returns 501 with the manual-export hint preserved from the original design.

Supported DWG versions: AutoCAD R14 through AutoCAD 2018+ (see `DWG_VERSIONS` map).

### File layout

```
src/lib/cad/
  dxf-parser.ts           # existing — add BIM_OUTLINE priority logic (TASK)
  dwg-parser.ts           # SHIPPED — WASM + server fallback
  pdf-to-polygon.ts       # existing — extend for two-point calibration (TASK)
  ingest-result.ts        # NEW (TASK) — shared output contract + builders
src/app/api/cad/convert/
  route.ts                # SHIPPED — converter-binary fallback with 501 default
src/components/upload/
  upload-stage.tsx        # modify — produce FootprintIngestResult uniformly (TASK)
  pdf-tracer.tsx          # modify — two-point ruler UI replacing width input (TASK)
  layer-picker.tsx        # modify — show BIM_OUTLINE tip banner (TASK)
public/wasm/
  libdxfrw.js             # SHIPPED — loaded by window.createModule
  libdxfrw.wasm           # SHIPPED — ~1.4 MB WASM binary
```

## Data Flow per Path

### DXF (happy case)

1. User drops `.dxf` → `upload-stage.tsx` reads text.
2. `parseDxfText(text)` returns candidates sorted by area.
3. **New logic (TASK):** if any candidate's `layer` matches `/^BIM[_-]?OUTLINE$/i`, skip the picker and use that candidate directly.
4. If `BIM_OUTLINE` is missing AND there are multiple candidates → show `LayerPicker` with a banner tip: *"Name your outline layer `BIM_OUTLINE` to skip this step."*
5. Wrap result as `{ source: "dxf", confidence: "exact", layer, … }`.

### DWG *(shipped; result-wrapping is the remaining TASK)*

1. User drops `.dwg` → `upload-stage.tsx` calls `parseDwgFile(file)`.
2. WASM conversion produces DXF text in-browser; piped through `parseDxfText`.
3. On WASM failure, a server round-trip to `/api/cad/convert` runs the same DXF pipeline.
4. Same `BIM_OUTLINE` logic from the DXF path applies to the converted DXF.
5. Wrap result as `{ source: "dwg", confidence: "converted", layer, … }`.

### PDF (new two-point calibration — TASK)

1. User drops `.pdf` → `pdf-tracer.tsx` renders page 1 to canvas.
2. **New calibration phase (before tracing):** *"Click two points on a dimension line and enter the real-world distance."*
   - User clicks point A, then point B. Types distance in meters.
   - Live pixel-distance readout so the user sees what they're measuring.
   - Derives `metersPerPixel = realDistance / pixelDistance(A, B)`.
3. **Tracing phase (existing):** user clicks polygon vertices.
4. `pdfToPolygon` extended to accept `metersPerPixel` directly; the old `realWorldWidthMeters` input is removed.
5. Wrap result as `{ source: "pdf", confidence: "traced", layer: "pdf-trace", … }`.

All three paths converge in `upload-stage.tsx` at the "ready" state, which stores the polygon to the recipe store (unchanged shape) and advances the workflow.

## Error Handling

| Failure | Response |
|---|---|
| DWG: missing `ACxxxx` magic | Reject client-side with: *"File does not appear to be a valid DWG."* |
| DWG: WASM load fails | Silently fall back to server route (logged as warning). |
| DWG: server converter not configured | 501 with hint: *"Export the DWG as DXF in your CAD tool and upload the .dxf file."* |
| DWG: server converter non-zero exit | 502 with stderr tail and DXF-export hint. |
| DXF: no closed polyline found AND `BIM_OUTLINE` absent | Existing error, plus: *"Put the outline on layer `BIM_OUTLINE` for a one-click ingest."* |
| PDF: two ruler points coincide | Disable "continue to trace"; inline hint. |
| PDF: traced polygon area implausible (<1 m² or >1 km²) | Reject with hint to re-check ruler calibration. |

**No silent fallbacks.** Every path either produces a valid `FootprintIngestResult` or a user-facing error. All new messages are bilingual (ko/en) per the existing pattern.

## Testing

**Unit tests (pure modules):**
- `dxf-parser.ts` — new cases: `BIM_OUTLINE` layer wins over larger unnamed ring; `BIM_OUTLINE` with under-threshold area still rejected; case-insensitive match. Extends `src/lib/cad/__tests__/dxf-parser.test.ts`.
- `pdf-to-polygon.ts` — new two-point API: correct `metersPerPixel`, rejects coincident points, round-trips a known scale. Extends `src/lib/cad/__tests__/pdf-to-polygon.test.ts`.
- `ingest-result.ts` (NEW) — builder helpers that wrap parser outputs with the correct `source` + `confidence`.

**Component tests:**
- `upload-stage.test.tsx` — extend: DXF with `BIM_OUTLINE` skips picker; produces `FootprintIngestResult` with correct provenance.
- `pdf-tracer.test.tsx` (NEW file) — two-point ruler UX: calibrate → trace → confirm.

**Manual QA checklist** (not automated):
- Ingest the same building via DXF, DWG, and PDF. Polygons agree within ~5% area (PDF looser). This is the measurable version of "consistent and reliable results."

## Rollout & Migration

- `recipe-store.footprintPolygon` shape does not change — still `[outer, ...holes]` rings of `[x, z]`. `FootprintIngestResult` is a new upload-stage-local type; the workflow store continues to receive just the polygon. Downstream Digital Twin code is untouched.
- `source` + `confidence` fields flow into `src/lib/fidelity/` in a later spec — out of scope here, captured as follow-up.
- Docs: short section in `CLAUDE.md` / `AGENTS.md` on the `BIM_OUTLINE` convention; in-app help text beside the dropzone.

## Risks

1. **WASM bundle size impacts initial load.** `libdxfrw.wasm` is ~1.4 MB. **Mitigation:** already loaded lazily on first DWG upload via dynamic script-tag injection, not bundled into the main JS payload.
2. **Browser memory limits on large DWGs.** WASM heap caps differ by browser; conversion memory spikes can be 3–5× file size. **Mitigation:** the 50 MB file-size cap stays; on WASM failure, server fallback picks up.
3. **libdxfrw license posture.** `libdxfrw` is GPLv2; its WASM bundle is being served as a static asset from `public/wasm/`. **Mitigation:** the team accepted this risk (see 2026-04-15 conversation). Attribution should live in a `NOTICES` or `THIRD_PARTY_LICENSES` file if one doesn't already exist — action item, not a blocker for this spec.
4. **No server-side audit trail** when WASM path succeeds. Conversion happens in-browser with no persistent log. **Mitigation:** accepted; the DXF text piped through `parseDxfText` is available in the browser console if needed.
5. **Two-point ruler precision depends on user choice.** Imprecise clicks on scanned PDFs produce off-scale polygons. **Mitigation:** live pixel-distance readout during point-picking; sanity range (≥10 m², ≤10 km²) on the resulting area.
6. **Scope creep toward pillar extraction.** Column/pillar detection is explicitly out of scope. **Mitigation:** the implementation plan must not add any column-related code paths; defer to a follow-up spec.

## Acceptance Criteria

- [x] `.dwg` upload parses without 501 in the common case (WASM path). *(shipped)*
- [x] DWG header magic validated client-side and server-side. *(shipped)*
- [ ] `.dxf` with a layer matching `BIM_OUTLINE` (case-insensitive) ingests without prompting the user.
- [ ] `.pdf` upload uses two-point ruler calibration; the "approximate width" input is removed.
- [ ] All three paths produce `FootprintIngestResult` with correct `source` + `confidence`.
- [ ] Same building ingested through all three paths agrees within ~5% area (manual QA).
- [ ] All new error messages are bilingual (ko/en) per existing pattern.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` all green.

## Follow-ups (Explicitly Out of Scope)

- Pillar/column extraction from DXF (layer convention candidate: `BIM_COLUMN`).
- Auto-vector extraction from CAD-exported PDFs.
- Tightening `BIM_OUTLINE` from convention-preferred to strict-only.
- Wiring `confidence` into `src/lib/fidelity/` for the Digital Twin fidelity badge.
- Third-party license attribution file for the libdxfrw WASM bundle.

## Revision History

- **2026-04-13** — Original spec approved. Prescribed server-side ODA File Converter for DWG.
- **2026-04-15** — Revised. DWG shipped via client-side libdxfrw WASM with server-fallback route; risks section rewritten; acceptance criteria split into shipped/remaining; file layout updated.
