# CAD Footprint Ingest Pipeline

Converts uploaded CAD drawings (DXF, DWG, PDF) into building footprint
polygons that feed the procedural building generator via
`recipe-store.setOverride(pk, "footprintPolygon", rings)`.

## Modules

| Module | Role |
|---|---|
| `dxf-parser.ts` | Pure text parser. Extracts closed `LWPOLYLINE`/`POLYLINE` candidates, converts units via `$INSUNITS` (unitless → meters + warning), ranks candidates by area with `BIM_OUTLINE` layer priority, maps DXF XY → world XZ centered at origin. |
| `dwg-parser.ts` | Client-side DWG → DXF via libdxfrw WASM (`fileImport()` + `fileExport()`, R14–2020). Header magic validated by `readDwgHeader()`. WASM module cached; cache reset on failure. Falls back to the server route `/api/cad/convert` (returns 501 + hint when no converter binary is configured). Output pipes through `parseDxfText()` so ranking/units are identical to the DXF path. |
| `pdf-to-polygon.ts` | Click-traced polygon over a rendered PDF page. Calibration via either a known edge length or a two-point ruler (`metersPerPixel`). |
| `ingest-result.ts` | `FootprintIngestResult` contract unifying the three paths with `source` (`dxf`/`dwg`/`pdf`) and `confidence` (`exact`/`converted`/`traced`) so downstream consumers can badge provenance. |

## Flow

```
UploadStage (src/components/upload/upload-stage.tsx)
  ├─ .dxf → parseDxfText ──────────────┐
  ├─ .dwg → parseDwgFile → parseDxfText ├─ FootprintCandidate[] → LayerPicker (if >1)
  └─ .pdf → PdfTracer → pdfToPolygon ──┘        ↓
                              recipe-store override "footprintPolygon"
                                            ↓
                    ProceduralBuilding extrudes real footprint (twin stage)
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
