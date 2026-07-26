# CAD Viewer + Markup — Phase 1 Design

Date: 2026-07-27
Status: Approved (brainstorming session)
Owner: GX team BIM digital twin app

## Vision & Decomposition

Goal: replace the AutoCAD functionality the GX team actually uses, inside the
digital twin app, so drawings are live-connected to the green retrofit /
eco-building simulator. This is a deliberate scope re-expansion relative to
the 2026-04-05 "no manual authoring" pivot: 2D drawing workflows return;
AutoCAD-style 3D solid modeling does not (the procedural twin covers 3D).

Four sub-projects, in build order:

| # | Sub-project | Status |
|---|---|---|
| 1 | DWG/DXF viewer + markup | **this spec** |
| 2 | 2D drafting (walls, snap/ortho, layers, dims) on the same document model | later |
| 3 | Deliverables (DXF export via libdxfrw `fileExport()`, PDF plots, titleblocks) | later |
| 4 | 3D — drawn plans drive the existing procedural twin; no solid modeler | later |

Foundation decision (Approach A): build our own document model + renderer on
the existing stack (npm `dxf-parser` + libdxfrw WASM + R3F/Three.js), rather
than adopting a viewer library (not editable) or a commercial SDK (cost,
cloud upload, can't become our editor). Key leverage: `src/lib/cad/dxf-parser.ts`
already receives the FULL entity tree from npm `dxf-parser` and currently
discards everything except closed polylines.

## 1. Scope

In-browser viewer for DWG/DXF with layer control, measurement, and markup,
plus the `CadDocument` model that phase 2 will edit.

Non-goals (phase 1): editing source entities, DXF export, titleblocks, 3D,
xrefs, SHX font fidelity.

## 2. Document model — `src/lib/cad/doc/`

Plain-data, serializable, no React/Three imports.

- `CadDocument`: `{ layers, blocks, entities, units, extents }` — model
  space, meters (reuses existing `$INSUNITS` conversion + unitless warning).
- Layers: name, ACI color index, visibility.
- Entity discriminated union v1: `Line`, `Polyline` (bulge arcs), `Arc`,
  `Circle`, `Ellipse`, `Text`, `Insert` (block ref), `Dimension` (rendered
  via embedded anonymous block when present), `Hatch` (boundary outline
  only), `Point`.
- Splines approximated as polylines.

This model is the cornerstone for phases 2–4; treat its API as a contract.

## 3. Parsing & mapping — `src/lib/cad/doc/map-dxf-to-doc.ts`

- Maps npm `dxf-parser` output → `CadDocument`.
- DWG path unchanged: libdxfrw WASM → DXF text → same mapper.
- Existing footprint extraction (`FootprintIngestResult`) untouched — same
  parse, different consumer.

## 4. Renderer & viewport — `src/components/cad-viewer/`

- Separate R3F canvas (not the twin scene), orthographic camera, drei
  `MapControls` pan/zoom, fit-to-extents.
- Layer panel: visibility toggles, ByLayer ACI color table.
- Performance: merged `LineSegments` buffer per layer; budget = 50k entities
  at interactive framerate.
- Text via drei `<Text>` (troika) with fallback font.

## 5. Markup & measure

- Separate Zustand markup store; markups never mutate the source document.
- Tools v1: text note, leader/arrow, revision cloud, measure (distance +
  area) with endpoint/midpoint snapping.
- Persistence: per-building via `idb-keyval` (local-first).
- Export: PNG snapshot for reports. DXF markup export deferred to phase 3.

## 6. App integration

- Upload stage (도면 업로드) gains "뷰어에서 열기 / Open in viewer" once a
  file parses; viewer opens as a full workspace view.
- In-viewer action on closed polylines: "바닥 외곽선으로 사용 / Use as
  footprint" → same `recipe-store.setOverride(pk, "footprintPolygon", …)`
  path, replacing the text-list LayerPicker with visual selection.
- Workflow stages and guards unchanged.

## 7. Testing

- Unit: entity mapping against fixture DXFs (extend `docs/samples/`), ACI
  color table, bulge-arc math, snap math.
- Playwright smoke: open sample → toggle layer → measure → markup →
  use-as-footprint.

## Accepted risks (v1)

- Font fidelity: fallback font only (no SHX).
- Hatches: boundary outline only.
- Xrefs: warn and skip.
- Exotic entities: spline→polyline approximation; unknown entities counted
  and reported, not silently dropped.
