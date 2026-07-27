# 2D Drafting (Phase 2 v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw line/polyline/rect/circle entities (with grid/ortho/entity snapping, select+delete, undo/redo, layers) in the CAD viewer — including from a blank per-building draft — feeding the existing use-as-footprint → twin → simulation loop.

**Architecture:** Pure reducer + helpers in `src/lib/cad/doc/`; a draft store owning the mutable `CadDocument` with snapshot undo; the viewer renders whatever `cad-viewer-store.doc` holds via a new `updateDoc`. Spec: `docs/superpowers/specs/2026-07-27-cad-drafting-design.md`.

**Tech Stack:** TypeScript, Zustand, idb-keyval, R3F/drei, react-hotkeys-hook, vitest.

## Global Constraints

- Same as phase 1: meters / native DXF XY / radians CCW; `src/lib/cad/doc/**` stays free of React/Three/DOM imports; bilingual copy via local `t(ko,en,isKo)`; commit per task; all existing tests keep passing.
- Entity ids continue the mapper's `e{n}` sequence within a draft.
- Grid default 0.5 m; undo stack cap 50.

---

### Task 1: Shared entity tessellation + extents extraction

**Files:**
- Create: `src/lib/cad/doc/entity-geometry.ts`
- Create: `src/lib/cad/doc/extents.ts`
- Modify: `src/lib/cad/doc/build-geometry.ts` (delegate chain walks)
- Modify: `src/lib/cad/doc/map-dxf-to-doc.ts` (import computeExtents from extents.ts, delete local copy)
- Test: `src/lib/cad/doc/__tests__/entity-geometry.test.ts`

**Interfaces:**
- Produces: `entityToChains(e: CadEntity): Vec2[][]` — tessellated polyline chains for line/polyline(bulges, closed ring closes chain)/arc/circle(closed ring: first point appended at end)/ellipse; `[]` for text; point → two 2-point cross chains. `computeExtents(entities: CadEntity[]): { min: Vec2; max: Vec2 }` (moved verbatim from mapper, now using entityToChains + text position).
- Consumers: build-geometry (refactor `emit` to push chains), hit-test Task 4, selection highlight Task 6, draft store extents Task 5.

Steps: (1) failing tests — chain counts/closure for each kind (circle chain first==last point, closed triangle polyline chain length 4, bulge polyline chain > 4 points, text → `[]`, point → 2 chains); (2) implement both modules; (3) refactor build-geometry/mapper to delegate — behavior identical; (4) run new tests + full `src/lib/cad` suite (no regressions); (5) commit `refactor(cad): shared entity tessellation + extents module`.

---

### Task 2: Grid + ortho helpers

**Files:**
- Create: `src/lib/cad/doc/grid.ts`
- Test: `src/lib/cad/doc/__tests__/grid.test.ts`

**Interfaces:**
- `snapToGrid(p: Vec2, step: number): Vec2` — nearest multiple of step per axis; step ≤ 0 returns p unchanged.
- `applyOrtho(anchor: Vec2, p: Vec2): Vec2` — locks to the dominant axis relative to anchor (|dx| ≥ |dy| → horizontal).

```ts
export function snapToGrid(p: Vec2, step: number): Vec2 {
  if (step <= 0) return { ...p };
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}
export function applyOrtho(anchor: Vec2, p: Vec2): Vec2 {
  return Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y)
    ? { x: p.x, y: anchor.y }
    : { x: anchor.x, y: p.y };
}
```

Tests: rounding both directions, step 0 passthrough, ortho horizontal/vertical/tie(→horizontal). TDD steps as usual; commit `feat(cad): grid snap and ortho helpers`.

---

### Task 3: Draw-tool reducer

**Files:**
- Create: `src/lib/cad/doc/draw-tools.ts`
- Test: `src/lib/cad/doc/__tests__/draw-tools.test.ts`

**Interfaces:**

```ts
export type DrawToolKind = "draw-line" | "draw-polyline" | "draw-rect" | "draw-circle";
export interface DrawState { tool: DrawToolKind; points: Vec2[] }
export type DrawEvent =
  | { type: "click"; point: Vec2 }
  | { type: "finish" }   // Enter / double-click
  | { type: "close" }    // C key (polyline only)
  | { type: "cancel" };  // Esc
/** Entity payload minus id/layer — the draft store assigns those. */
export type NewEntity =
  | { kind: "line"; a: Vec2; b: Vec2 }
  | { kind: "polyline"; vertices: Vec2[]; bulges: number[]; closed: boolean }
  | { kind: "circle"; center: Vec2; radius: number };
export function startDraw(tool: DrawToolKind): DrawState;
export function reduceDraw(state: DrawState, ev: DrawEvent): { state: DrawState; created?: NewEntity };
export function previewChains(state: DrawState, hover: Vec2): Vec2[][];
```

Behavior:
- line: 2nd click emits `line`, state resets (points []).
- rect: 2nd click emits closed 4-vertex polyline (corners (a),(b.x,a.y),(b),(a.x,b.y) — axis-aligned from the two clicks); degenerate (same x or y) → no emit, keep first point.
- circle: 2nd click emits circle with radius = distance; zero radius → no emit.
- polyline: clicks accumulate; click within 1e-9 of first point OR `close` with ≥3 points → closed polyline; `finish` with ≥2 → open polyline; fewer → cancel semantics (reset, no emit).
- `cancel` always resets points, never emits.
- `previewChains`: line/polyline → chain of points+hover (+ closing hint segment back to first for polyline ≥2); rect → 4-edge ring from first point+hover; circle → tessellated circle via `circlePoints(center, dist(hover))`; empty points → [].

Tests: each tool's happy path, rect degenerate, polyline close-by-click and close-event, finish-with-1-point resets without emit, cancel, previews non-empty where expected. Commit `feat(cad): draw tool reducer with previews`.

---

### Task 4: findEntityAt hit-test

**Files:**
- Modify: `src/lib/cad/doc/hit-test.ts`
- Test: `src/lib/cad/doc/__tests__/find-entity-at.test.ts`

**Interfaces:**
- `findEntityAt(doc: CadDocument, cursor: Vec2, tolerance: number): CadEntity | null` — nearest entity whose tessellated chains (via `entityToChains`) pass within tolerance; text entities hit when cursor within `[position.x, position.x + 4*height] × [position.y, position.y + height]` box (rough label box, rotation ignored v1). Reuses the module's `distToSegment`.

Tests: hits a line/circle/arc near their curves; nearest wins between two candidates; text box hit; miss beyond tolerance. Keep existing `findClosedPolylineAt` untouched (tests must still pass). Commit `feat(cad): generic entity hit-test`.

---

### Task 5: Draft store + updateDoc

**Files:**
- Create: `src/store/cad-draft-store.ts`
- Modify: `src/store/cad-viewer-store.ts` (add `updateDoc`)
- Test: `src/store/__tests__/cad-draft-store.test.ts`
- Test: extend `src/store/__tests__/cad-viewer-store.test.ts`

**Interfaces:**

```ts
export interface DraftStorage {
  load(key: string): Promise<CadDocument | undefined>;
  save(key: string, doc: CadDocument): Promise<void>;
}
interface CadDraftState {
  doc: CadDocument | null;
  past: CadDocument[]; future: CadDocument[];      // snapshot refs, cap 50
  activeLayer: string;
  selectedEntityId: string | null;
  persistKey: string | null;
  startDraft(base: CadDocument, persistKey: string): void;  // begins editing an existing doc
  newDrawing(id: string, persistKey: string): void;          // blank doc: layer "DRAFT" (colorIndex 3, visible), extents 0..20m
  loadDraft(persistKey: string): Promise<CadDocument | null>; // returns persisted doc or null
  addEntity(e: NewEntity): void;    // assigns id (continues e{n}), activeLayer; recomputes extents; pushes undo
  deleteEntity(id: string): void;
  addLayer(name: string, colorIndex?: number): void;         // no-op if exists; becomes active
  setActiveLayer(name: string): void;
  selectEntity(id: string | null): void;
  undo(): void; redo(): void;
  endDraft(): void;                  // clears store (doc persists in storage)
  _setStorage(s: DraftStorage): void;
}
```

Rules: every mutation (addEntity/deleteEntity/addLayer) pushes prior doc to `past` (cap 50, drop oldest), clears `future`, persists async, and calls `useCadViewerStore.getState().updateDoc(doc)`. undo/redo swap doc with stack tops, also persist + updateDoc. Entity id: track `nextId` from max `e{n}` in base doc. `updateDoc(doc)` in viewer store: replace doc, `layerVisibility = { ...defaults-for-new-layers(visible:true per doc.layers), ...existingToggles }`.

Tests: newDrawing seeds blank doc + DRAFT layer; addEntity assigns e{n}+layer and grows extents; undo/redo round-trip incl. redo-cleared-on-new-mutation; addLayer/setActiveLayer; persistence save/load via memory storage; updateDoc preserves an existing toggle while adding a new layer visible. Commit `feat(cad): draft store with undo/redo and per-building persistence`.

---

### Task 6: Viewer UI wiring (draw tools, selection, grid, keyboard, layers)

**Files:**
- Modify: `src/store/cad-markup-store.ts` — `CadTool` union += `DrawToolKind`.
- Modify: `src/components/cad-viewer/viewer-toolbar.tsx` — draw section (Slash, Spline/Waypoints, Square, Circle icons), undo/redo buttons, grid toggle (props: `draftActive`, `onUndo`, `onRedo`, `gridOn`, `onToggleGrid`).
- Modify: `src/components/cad-viewer/markup-overlay.tsx` — when tool is a draw tool: clicks run reducer (snap order: entity snap → grid snap when on → Shift ortho vs last point); `created` → `onDraftEntity(NewEntity)` prop; render previewChains + selection highlight chains (props: `drawState`, `setDrawState`, `gridOn`, `selectedChains`, `onSelectEntity`). Select tool: `findEntityAt` first → `onSelectEntity(id)`; closed polyline also offers footprint pick as today.
- Modify: `src/components/cad-viewer/cad-scene.tsx` — `<Grid>` from drei (rotation [Math.PI/2,0,0], cellSize 0.5, sectionSize 5, infiniteGrid, fadeDistance scaled to extents) rendered when `gridOn`.
- Modify: `src/components/cad-viewer/layer-panel.tsx` — active-layer dot per row (`onSetActive`), "+ 레이어" button (prompt for name) when `draftActive`.
- Modify: `src/components/cad-viewer/cad-viewer.tsx` — compose: draft store subscription, `useHotkeys` (esc/enter/c/delete/ctrl+z/ctrl+shift+z/ctrl+y), drawState local state, pass-through props; snapshot/measure/markup features unchanged.

No new unit tests (pure logic covered by Tasks 1–5); verification = build + lint + browser smoke in Task 8. Commit `feat(cad): drafting UI — draw tools, selection, grid, undo/redo, layers`.

---

### Task 7: Upload-stage entry + draft reopen

**Files:**
- Modify: `src/components/upload/upload-stage.tsx`

Behavior: always-visible secondary button under the dropzone — "새 도면 그리기 / Draw new plan" (or "도면 계속 그리기 / Continue drawing" when a persisted draft exists for the building — checked via `loadDraft` on mount). Click → `startDraft(persisted ?? blank, key)` + `openViewer(doc)` where `key = cad-draft:{buildingPk ?? "anon"}`. Existing uploaded-doc viewer path additionally calls `startDraft(doc, key)` so uploaded drawings are annotatable/editable too. `onUseFootprint` unchanged. Commit `feat(cad): blank-drawing entry with per-building draft persistence`.

---

### Task 8: Verification, deploy, merge

- Full `pnpm vitest run` green; `pnpm build` clean; `pnpm exec eslint` clean on changed dirs.
- Browser smoke: 새 도면 그리기 → grid visible → draw rectangle (grid-snapped) → polyline → undo/redo → select rect → 바닥 외곽선으로 사용 → upload ready → close/reopen viewer → draft restored.
- Update `src/lib/cad/README.md` (drafting modules) + CLAUDE.md bullet.
- Commit docs; deploy prod via clean-worktree recipe; verify alias; merge branch → master via PR.

## Self-Review Notes

- Spec coverage: tools (T3/T6), snapping (T2/T6), editing+undo (T5/T6), layers (T5/T6), blank entry+persistence (T5/T7), grid display (T6), sim loop (existing path, T8 smoke). Deferred items match spec non-goals.
- Type consistency: `NewEntity` defined once in draw-tools.ts, imported by draft store and overlay; `DrawToolKind` feeds the `CadTool` union; `entityToChains` is the single tessellation authority after T1.
