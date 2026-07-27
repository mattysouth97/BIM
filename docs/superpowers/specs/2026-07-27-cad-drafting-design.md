# 2D Drafting — Phase 2 Design (v1 vertical slice)

Date: 2026-07-27
Status: Approved (continuation of the CAD product line decomposition,
`2026-07-27-cad-viewer-markup-design.md`; user directed execution)

## Goal

Draw 2D plans directly in the CAD viewer — including from a blank canvas
with no uploaded file — on the same `CadDocument` model phase 1 built.
The payoff loop: **draw a closed outline → "바닥 외곽선으로 사용" → twin →
energy/retrofit simulation reacts.** That loop already exists from the
select tool; drafting v1 makes the drawing part possible in-app.

## Scope (v1)

- **Draw tools:** line, polyline (Enter finishes open, C or first-point
  click closes), rectangle (2 corner clicks), circle (center + radius).
- **Snapping while drawing:** existing endpoint/midpoint snap, plus grid
  snap (0.5 m default, toggleable) and ortho lock (Shift).
- **Editing:** click-select any entity, Delete removes it, Esc cancels
  tool/selection, Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) undo/redo
  (snapshot stack, cap 50).
- **Layers:** create a layer, choose the active layer drawn entities land
  on. Layer panel gains both.
- **Blank drawing entry:** upload stage gets "새 도면 그리기 / Draw new
  plan" — opens the viewer with an empty document (no file, no API key).
  Drafts persist locally per building (idb-keyval) and reopen.
- **Grid display** in the scene while a draft is active.

## Non-goals (deferred)

- Dimension entities (measure markups cover v1), walls-with-thickness,
  move/copy/trim/rotate, arc tool, DXF export (phase 3), multi-floor.

## Architecture

Pure logic stays in `src/lib/cad/doc/` (no React/Three):

| Unit | Responsibility |
|---|---|
| `entity-geometry.ts` | `entityToChains(e): Vec2[][]` — one tessellation walk shared by build-geometry, hit-testing, and selection highlight. |
| `extents.ts` | `computeExtents(entities)` extracted from the mapper so the draft store can maintain extents. |
| `grid.ts` | `snapToGrid(p, step)`, `applyOrtho(anchor, p)`. |
| `draw-tools.ts` | Pure reducer: `reduceDraw(state, event) → { state, created? }` + `previewChains(state, hover)`. Click/finish/cancel/close events; emits entity payloads (sans id/layer). |
| `hit-test.ts` | Gains `findEntityAt(doc, cursor, tol)` for any entity kind. |

State:

- `cad-draft-store.ts` (new): working `CadDocument`, undo/redo snapshot
  stacks (immutable updates make snapshots cheap references), active
  layer, selected entity, per-building persistence via injectable
  storage (idb in prod, memory in tests). Mutations push the updated doc
  to `cad-viewer-store.updateDoc()` so the viewer renders it.
- `cad-viewer-store.ts`: gains `updateDoc(doc)` — replaces the doc,
  preserving existing layer-visibility toggles and defaulting new layers
  to visible.
- `cad-markup-store.ts`: `CadTool` union gains the four draw tools; the
  one active-tool source stays where it is.

UI (`src/components/cad-viewer/`):

- Toolbar: draw section (line/polyline/rect/circle), undo/redo, grid
  toggle. Overlay handles draw clicks + live preview + selection
  highlight (orange chains). Keyboard via `react-hotkeys-hook` (already
  a dependency). Grid rendered in-scene while drafting.
- Layer panel: active-layer radio + "레이어 추가".
- Upload stage: "새 도면 그리기" button (idle state included — no file
  required); reopens a persisted draft when one exists.

## Testing

TDD per unit: reducer transitions (each tool happy path + cancel +
polyline close), grid/ortho math, entity hit-test per kind, draft store
undo/redo/persistence/layer flows, updateDoc visibility preservation.
Browser smoke: blank draft → draw rectangle → select → use-as-footprint
→ twin stage reachable; draft persists across viewer close/reopen.

## Risks / accepted

- Snapshot undo is O(doc) per mutation — fine at drafting scale (< 5k
  entities), revisit with command-pattern in phase 2b.
- Geometry/snap rebuild per edit (memoized on doc) — same bound.
