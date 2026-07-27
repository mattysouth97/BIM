# CAD Footprint Ingest Pipeline + Document Model

Converts uploaded CAD drawings (DXF, DWG, PDF) into building footprint
polygons that feed the procedural building generator via
`recipe-store.setOverride(pk, "footprintPolygon", rings)`, and — since the
CAD viewer phase — into a full `CadDocument` entity model rendered by
`src/components/cad-viewer/`.

## Modules

| Module | Role |
|---|---|
| `dxf-parser.ts` | Pure text parser. Extracts closed `LWPOLYLINE`/`POLYLINE` candidates, converts units via `$INSUNITS` (unitless → meters + warning), ranks candidates by area with `BIM_OUTLINE` layer priority, maps DXF XY → world XZ centered at origin. |
| `dwg-parser.ts` | Client-side DWG → DXF via libdxfrw WASM (`fileImport()` + `fileExport()`, R14–2020). Header magic validated by `readDwgHeader()`. WASM module cached; cache reset on failure. Falls back to the server route `/api/cad/convert` (returns 501 + hint when no converter binary is configured). Output pipes through `parseDxfText()`; also returns the converted `dxfText` so the viewer can build a `CadDocument`. |
| `pdf-to-polygon.ts` | Click-traced polygon over a rendered PDF page. Calibration via either a known edge length or a two-point ruler (`metersPerPixel`). |
| `ingest-result.ts` | `FootprintIngestResult` contract unifying the three paths with `source` (`dxf`/`dwg`/`pdf`) and `confidence` (`exact`/`converted`/`traced`) so downstream consumers can badge provenance. |

## Document model — `doc/`

Foundation for the CAD product line (viewer → drafting → deliverables).
All coordinates are **meters, native DXF XY, radians CCW** — unlike the
footprint path, nothing is re-centered until `to-footprint.ts`.

| Module | Role |
|---|---|
| `doc/types.ts` | `CadDocument` + entity union (line, polyline+bulge, arc, circle, ellipse, text, point). Plain serializable data; no React/Three imports allowed anywhere in `doc/`. |
| `doc/map-dxf-to-doc.ts` | npm `dxf-parser` output → `CadDocument`. Flattens INSERT/DIMENSION blocks (depth ≤ 4), strips MTEXT codes, approximates SPLINEs, counts skipped types in `stats.skipped` (never silent). |
| `doc/tessellate.ts` | Arc/circle/bulge/ellipse → polyline points. Bulge sign: positive sweeps CCW around the arc center (verified against ezdxf/three-dxf). |
| `doc/build-geometry.ts` | `CadDocument` → per-layer `Float32Array` xyz segment buffers + text labels for the R3F scene. |
| `doc/snap.ts` | Endpoint/midpoint snap via uniform 1 m grid hash over segment buffers. |
| `doc/viewport.ts` | `ViewState` (center + m/px) with world↔screen transforms — shared by the ortho camera and the SVG markup overlay. |
| `doc/to-footprint.ts` | Closed `CadPolyline` → bbox-centered footprint polygon (same convention as `dxf-parser.ts`). |
| `doc/hit-test.ts` | Nearest closed polyline within tolerance (viewer's "use as footprint" pick). |
| `doc/aci-colors.ts` | AutoCAD Color Index → hex (1–9 and 250–255 exact, 10–249 generated). |
| `doc/entity-geometry.ts` | `entityToChains` — the single tessellation authority shared by build-geometry, hit-testing, and selection highlight. |
| `doc/grid.ts` | Grid snap (`snapToGrid`) + ortho lock (`applyOrtho`) for drafting. |
| `doc/draw-tools.ts` | Pure draw-tool reducer (line/polyline/rect/circle) + live preview chains. Emits entity payloads sans id/layer. |

## Drafting (phase 2)

`src/store/cad-draft-store.ts` owns the working `CadDocument` while drawing:
snapshot undo/redo (cap 50), active layer, per-building persistence
(`cad-draft:{buildingPk|anon}` in idb-keyval). Mutations sync the viewer via
`cad-viewer-store.updateDoc` (preserves layer-visibility toggles). The upload
stage's "새 도면 그리기" opens a blank draft with no file or API key — draw a
closed outline, select it, "바닥 외곽선으로 사용" feeds the twin + energy sim.

## Flow

```
UploadStage (src/components/upload/upload-stage.tsx)
  ├─ .dxf → parseDxfText ──────────────┐
  ├─ .dwg → parseDwgFile → parseDxfText ├─ FootprintCandidate[] → LayerPicker (if >1)
  └─ .pdf → PdfTracer → pdfToPolygon ──┘        ↓
                              recipe-store override "footprintPolygon"
                                            ↓
                    ProceduralBuilding extrudes real footprint (twin stage)

  .dxf/.dwg also → mapDxfTextToDoc → CadDocument → "뷰어에서 열기"
                                            ↓
              CadViewer (src/components/cad-viewer/) — layers, measure,
              markups (idb-keyval per doc), select polyline →
              "바닥 외곽선으로 사용" → same footprint override path
```

The upload stage guard (`src/lib/workflow/stages.ts`) blocks advancing to
the twin stage until a footprint polygon exists.

## Gotchas

- All coordinates leaving this module are **meters, XZ-plane, centered at
  the footprint bbox origin** — the same convention `building-geometry.ts`
  uses.
- Unitless DXF files ($INSUNITS = 0) are assumed meters and flagged with a
  warning; surface it in the UI.
- A sample fixture lives at `docs/samples/sample-footprint.dxf` for manual
  QA of the upload flow.
