# Authoring Environment Spec — Korean Building Digital Twin

Target path: `.omc/specs/authoring-environment.md`
Stack: Next.js 16 App Router · React 19 · R3F v9 · Zustand (+ persist/immer) · Tailwind
Primary customer: GX team energy engineers
Companion specs: `deep-interview-bim-fidelity-strategy.md` (in the same folder)

---

## 1. Summary & Goals

The authoring environment is a generic-CAD-feeling, browser-native 3D workspace layered on top of the existing Korean building digital twin. Engineers must be able to (a) pick a floor, (b) sketch, nudge, and duplicate MEP, facade, and envelope instances with numeric precision, and (c) compose named layer/property snapshots — without ever leaving the browser or entering a Revit-style modal form. The design deliberately borrows Blender's mode system, modifier stack, operator log, and N-panel registration; AutoCAD's object snaps, grip editing, block editor isolation, layer states, and dynamic input; and web-native ideas (triple-taxonomy outliner tabs, always-on gizmos, URL-encoded sharing) from Spline and Onshape.

Non-goal: a faithful BIM authoring tool. Goal: a precision parametric editor a GX engineer can learn in an afternoon and that feeds ECO2 / retrofit simulation downstream.

Success is measured by three properties:

1. **Verb-first precision.** An engineer can select an MEP branch, press `G`, type `1.2`, and commit — without hunting a menu.
2. **Context-bounded scope.** Entering Floor Edit Mode on floor 3 visibly and literally restricts editing to floor 3's content; other floors dim, clipping planes engage, and tooling reconfigures.
3. **Revertible mutations.** Every mutation is a typed action in an auditable log; undo, redo, and named version snapshots are cheap.

The environment reuses `workspace-shell.tsx`, `contextual-toolbar.tsx`, `status-bar.tsx`, `scene-outliner.tsx`, `properties-panel.tsx`, and `workflow-stepper.tsx` as its DOM skeleton — the spec retargets their contents rather than replacing them. All mutations route through a new `authoring-store` (zustand + `zundo` middleware) plus a new `scene-model-store` for Family/Type/Instance data.

---

## 2. Mode System

Four top-level modes, each a hard context boundary. Mode switches must be visible (badge on toolbar, cursor change, outliner shift) and revertible (Esc or Tab).

| Mode         | Entry                  | Unlocks                                       | Restricts                                             | Cursor      |
| ------------ | ---------------------- | --------------------------------------------- | ----------------------------------------------------- | ----------- |
| Navigate     | Esc from any mode      | Orbit, pan, zoom, click-to-select, fly tools  | No mutations. Gizmos render ghosted and non-draggable | default     |
| Floor Edit   | Tab on a floor; `F` key | Per-floor placement, MEP routing, floor-specific toolbar | Only floor N's instances are raycastable; others 0.2 opacity + clipping planes | crosshair |
| Object Edit  | Tab on an instance; `E` key | Grip handles, vertex/opening edits, per-instance modifier stack | Only the active instance is raycastable; selection constrained | pointer-dot |
| Properties   | `P` key or right-panel click | N-panel tabs expand, numeric precision entry, value scrubbers | No viewport transforms; viewport becomes read-only hit-test | text-i |

**Semantics**

- **Tab key** toggles between the two most-recent modes (Navigate ↔ the last edit mode). This mirrors Blender's Object ↔ Edit toggle and beats the AutoCAD pattern of re-typing command names.
- **Per-selection mode memory.** Each selected entity records its last mode in `authoring-store.modeMemory[entityId]`. Re-selecting an entity and pressing Tab returns it to that mode.
- **Esc** always returns to Navigate and clears active command verbs (but preserves selection).
- **Mode transitions** dispatch a `MODE_ENTER` / `MODE_EXIT` action pair so the operator log shows hard boundaries.

**UI reconfiguration per mode**

- Header strip — `ContextualToolbar` rereads `authoring-store.mode` and swaps the `TOOLBAR_CONFIGS` group (extend the existing `TOOLBAR_CONFIGS` map rather than replacing it).
- Left panel — outliner tab set stays the same, but the "Storey" tab gets a "Active floor" highlight and a lock icon on non-active floors in Floor Edit.
- Right panel — N-panel tab visibility toggles. Object Edit unlocks the **Modifier Stack** tab; Navigate hides it.
- Event handlers — canvas `onPointerDown` / `onPointerMove` are wrapped by a `ModeGate` HOC (`src/components/viewer/mode-gate.tsx`, new) that drops events not allowed in the current mode.

---

## 3. Layout Architecture

Root shell is unchanged: `workspace-shell.tsx` keeps the three-zone layout (header, viewport, bottom shelf), and the `leftDockOpen` / `rightDockOpen` state in `workspace-store.ts` continues to drive floating panel visibility.

```
┌──────────────────────────────────────────────────────────────────┐
│ WorkflowStepper (existing)                                       │  h-10
├──────────────────────────────────────────────────────────────────┤
│ AuthoringHeaderStrip  ← new, stacked under stepper               │  h-10
│ [ModeSelector][ActiveFloorPicker]    [⌘K CommandPalette] [Share] │
├───────────┬────────────────────────────────────────┬─────────────┤
│ Left      │ Viewport (R3F Canvas)                  │ Right       │
│ Floating  │                                        │ Floating    │
│ Panel     │  GizmoLayer                            │ Panel       │
│           │  SnapMarkerOverlay                     │             │
│ Outliner  │  DynamicInputOverlay                   │ PropsPanel  │
│  [Hier]   │  GripHandleLayer                       │  N-tabs     │
│  [Class]  │  FloorClipPlanes                       │             │
│  [Storey] │                                        │             │
│           │                                        │             │
├───────────┴────────────────────────────────────────┴─────────────┤
│ StatusBar (existing) + LiveCoords + SnapStateBadge               │  h-10
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Header strip — `AuthoringHeaderStrip` (new)

File: `src/components/workspace/authoring-header-strip.tsx`

- Renders directly under `WorkflowStepper` but only when `stage === "twin"` (same gate as `FloatingPanel`).
- **ModeSelector**: segmented control bound to `authoring-store.mode`. Click = `authoring-store.setMode`. Shows keyboard hint underneath each segment.
- **ActiveFloorPicker**: dropdown reading `effectiveRecipe.floors` (see `scene-outliner.tsx` lines 216–229 for the effective-recipe selector pattern — reuse verbatim). Selection writes to `authoring-store.activeFloorIndex`.
- **CommandPalette trigger** (`⌘K` / `Ctrl+K`): opens a cmdk-backed modal listing every dispatchable operator. Cmdk is already available via shadcn's `Command` component — no new dependency.
- **Share button**: copies a role-encoded URL that encodes `{buildingPk, mode, activeFloorIndex, cameraState, selectionId}` into a query string. No server state needed for phase 1.

The existing `ContextualToolbar` sits *below* this strip (new: mount it in the `authoring-header-strip`), reading `authoring-store.mode` to pick toolbar groups. Keep `ContextualToolbar`'s existing `TOOLBAR_CONFIGS[stage]` lookup — extend the key space to `TOOLBAR_CONFIGS[${stage}:${mode}]` with a fallback to `[stage]`.

### 3.2 Left panel — Triple-taxonomy outliner

The left `FloatingPanel` (currently rendering `SceneOutliner` for retrofit recommendations) is split into two routes:

- When `mode === "Navigate"` and no authoring action is pending, render the existing retrofit `SceneOutliner` unchanged.
- Otherwise render a new `AuthoringOutliner` with three tabs: **Hierarchy / Class / Storey**.

File: `src/components/workspace/authoring-outliner.tsx` (new)

- Uses the existing shadcn `Tabs` primitive.
- All three tabs share one selection state in `selection-store.ts` (extend the existing `select` action — do not add parallel stores).
- Each tree node has three independent booleans — **viewport visibility**, **render (export) visibility**, **selectability** — rendered as three icons per row (Blender Outliner pattern). These map to three new fields in `outline-store` (or a new `tree-node-flags` slice in `authoring-store`).
- Hierarchy tab: scene graph — Building → Floors → Layers → Instances.
- Class tab: grouped by IFC-style class — Walls, Slabs, Columns, Openings, MEP:HVAC, MEP:Electric, MEP:Plumbing.
- Storey tab: grouped by floor index. Active floor is highlighted; non-active floors show a lock icon while in Floor Edit mode.
- Tab switching preserves selection (the selected instance is scrolled into view on tab change).

### 3.3 Center viewport

`src/components/viewer/building-scene.tsx` gains four new child layers, each a plain R3F component that listens to `authoring-store`:

- `GizmoLayer` — wraps the selected object in `<PivotControls>` from `@react-three/drei`. Always-on when an instance is selected, but ghosted in Navigate mode.
- `SnapMarkerOverlay` — HTML overlay (`drei <Html>`) rendering AutoSnap markers at snap candidate points.
- `DynamicInputOverlay` — fixed-position `<Html>` anchored to the cursor showing the active command's numeric input field.
- `GripHandleLayer` — on-demand sphere meshes at control points when an instance is in Object Edit mode.
- `FloorClipPlanes` — invisible helper that configures `gl.clippingPlanes` whenever Floor Edit activates.

All five layers must respect the `ModeGate` — `GizmoLayer` unmounts its drag controls in Navigate mode; `GripHandleLayer` only mounts in Object Edit; etc.

### 3.4 Right panel — Properties panel with N-panel tab registration

The existing `PropertiesPanel` shows analytics (fidelity, calibration, benchmark, certification, efficiency). Keep it. Add a new **tab strip above the existing Accordion** with four registered tabs:

- **Analytics** (default) — current `PropertiesPanel` content, unchanged.
- **Instance** — when an instance is selected, show its editable properties (position, rotation, scale, material override, floor assignment).
- **Modifier Stack** — ordered list of modifiers applied to the selected instance.
- **Action Log** — recent operator actions scoped to the selected instance (filtered view of the global log).

**Registration pattern** (Blender N-panel analogue):

```ts
// src/lib/authoring/panel-registry.ts (new)
export interface NPanelTab {
  id: string;
  labelKo: string;
  labelEn: string;
  icon: LucideIcon;
  visibleIn: Mode[];             // hard-gate per mode
  requiresSelection?: boolean;
  Component: React.ComponentType;
}

export const PANEL_REGISTRY: NPanelTab[] = [ ... ];
```

Each feature module self-registers by appending to `PANEL_REGISTRY`. The properties panel iterates the registry and renders whatever passes the mode/selection gate.

**Modifier stack UI** (Blender modifier stack analogue). Renders a `@dnd-kit/sortable` list of cards. Each card:

- Header: name, enabled toggle, collapse, delete.
- Body: modifier-specific controls.
- Live-composed: dragging re-orders, re-runs the stack.
- Seed types: `AddOpening`, `OffsetSurface`, `ArrayAlongPath`, `MaterialOverride`, `InsulationLayer`.
- Dispatches a single `MODIFIER_STACK_REORDER` action on drop — keeping the action log clean.

### 3.5 Bottom status bar

Keep `StatusBar` as-is for stage hint + energy metrics. Append three right-aligned badges (additive, don't remove existing):

- **LiveCoords** — `x, y, z` in meters of the snap-candidate or cursor raycast point.
- **ActiveCommand** — "G" or "Scale" or similar, or empty.
- **SnapState** — list of active snap types (`END | MID | PERP`) with short badges; click toggles.
- **Units** — `m / mm`, driven by `app-store.language` default ("m" for now) with a setting to switch.

---

## 4. Interaction Model

A Blender/Spline hybrid: always-on gizmos (Spline) *and* modal verb shortcuts (Blender). Verbs win where both are usable — pressing `G` while a gizmo is visible starts a typed translate even if the user could have dragged the gizmo arrow.

### 4.1 Keyboard shortcuts (verb-first)

| Key              | Verb                      | Mode(s)                 |
| ---------------- | ------------------------- | ----------------------- |
| `Tab`            | Toggle last edit mode     | Any                     |
| `Esc`            | Cancel command / Navigate | Any                     |
| `G`              | Grab / translate          | Floor/Object Edit       |
| `R`              | Rotate                    | Floor/Object Edit       |
| `S`              | Scale                     | Object Edit             |
| `X` / `Y` / `Z`  | Axis constraint           | During G/R/S            |
| `D`              | Duplicate                 | Floor/Object Edit       |
| `A`              | Select all in context     | Any edit mode           |
| `H` / `Alt+H`    | Hide / unhide selection   | Any                     |
| `F`              | Enter Floor Edit on floor under cursor | Navigate    |
| `E`              | Enter Object Edit on selection | Navigate           |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo      | Any                     |
| `Ctrl+S`         | Create named snapshot     | Any                     |
| `⌘K` / `Ctrl+K`  | Command palette           | Any                     |
| Numeric digits during G/R/S | Precision entry | During command          |

### 4.2 Click + drag

- Single click: select.
- Shift+click: add to selection.
- Ctrl+click: toggle.
- Drag empty space: box select.
- Drag gizmo handle: transforms without entering a verb; dispatches a `TRANSFORM_DELTA` action on drop.
- Drag grip (Object Edit): stretches the geometry at that control point; snaps engage per `snap-engine`.

### 4.3 Right-click context menu

Primary secondary-action surface. Mode- and selection-aware. Implemented via shadcn `ContextMenu`. Minimum items per mode:

- Navigate on instance: Isolate floor, Show in outliner, Copy as URL, Inspect analytics.
- Floor Edit on floor: Enter Object Edit on this floor, Duplicate floor, Set layer state, Clip above, Clip below.
- Object Edit on instance: Add modifier, Convert to type, Extract to family, Align to neighbour.
- On empty space: Paste, Undo last, Recenter camera.

### 4.4 Gizmo behavior

- Always visible on any selection.
- Ghosted (50% alpha, `raycast = null`) in Navigate mode — visual affordance only.
- Active (raycastable, draggable) in Floor/Object Edit.
- Axis labels next to arrows; shift during drag snaps to grid.
- Numeric override: clicking a gizmo handle opens a tiny floating input (reuse `DynamicInputOverlay`) pre-filled with `0` and axis-locked.

---

## 5. Object Snap Subsystem

Replace the deleted `src/lib/plan/snap-engine.ts` and `src/components/viewer/snap-indicator.tsx` with thinner, viewport-scoped versions.

### 5.1 New files

- `src/lib/authoring/snap-engine.ts` — pure functions.
- `src/components/viewer/snap-marker-overlay.tsx` — HTML marker overlay.
- `src/store/authoring-store.ts` (new) — holds `activeSnapTypes`, `snapCandidate`, `snapTolerancePx`.

### 5.2 Snap types (shipped set)

| ID          | Geometry source                      | AutoSnap marker |
| ----------- | ------------------------------------ | --------------- |
| `END`       | Wall/slab/opening vertices           | filled square   |
| `MID`       | Edge midpoints                       | open triangle   |
| `PERP`      | Nearest perpendicular foot on edge   | right-angle     |
| `INTERSECT` | Computed line-line intersections     | ×               |
| `GRID`      | Snap to grid (step derived from units, default 0.1 m) | diamond |
| `CENTER`    | Face center of slab/panel            | open circle     |

Each snap has a boolean in `authoring-store.activeSnapTypes`. User toggles from the StatusBar SnapState badges (see 3.5).

### 5.3 Per-frame proximity check

The snap pass runs only when:

1. `authoring-store.mode !== "Navigate"`, **and**
2. A drag is in progress *or* cursor is hovering the viewport while a verb is active.

Scope is the **active floor only**: iterate instances with `floorIndex === activeFloorIndex`. Don't iterate other floors (big perf win; aligns with the "context-bounded scope" success criterion).

Algorithm outline:

```ts
// per frame, inside useFrame:
const cursor3D = raycastToActiveFloorPlane();
const candidates = collectSnapCandidates(activeFloorInstances, activeSnapTypes);
const { best, distancePx } = nearest(cursor3D, candidates, camera);
if (distancePx < snapTolerancePx) authoringStore.setSnapCandidate(best);
else authoringStore.setSnapCandidate(null);
```

`collectSnapCandidates` is memoized per `(floorIndex, activeSnapTypes)` tuple — rebuild only when an instance in the active floor changes (subscribe to `scene-model-store` slice selector).

### 5.4 AutoSnap marker overlay

- R3F `<Html>` positioned at snap candidate world coords, `distanceFactor` set so marker stays ≈ 12 px on screen.
- Small icon by snap type (square / triangle / × / diamond / circle).
- Tooltip label below marker: `"Endpoint — Wall #W-103"` / Korean equivalent.
- Marker cleared immediately when `snapCandidate === null` to avoid sticky visuals.

---

## 6. Grip Editing Subsystem

File: `src/components/viewer/grip-handle-layer.tsx` (new) — mounts only when `mode === "Object Edit"`.

**Control points per instance type:**

| Instance | Grip points                                    |
| -------- | ---------------------------------------------- |
| Wall     | 2 endpoints + 1 midpoint                       |
| Slab     | 4 corners + 4 edge midpoints                   |
| Opening  | 4 corners (resize) + 1 center (reposition)    |
| Column   | 1 base + 1 top + 4 radial (for radius)         |
| MEP branch | every segment endpoint + any bend vertex     |

**Implementation choice: custom DragControls over PivotControls.** Rationale: PivotControls attach a single coordinate frame, but grip editing needs independent sphere handles each dispatching a different payload. Wrap a small sphere mesh per control point with drei's `<DragControls>` (already in drei) or a custom pointer-down/move/up hook.

**Dispatch pattern**:

- On pointer-down: emit `GRIP_BEGIN` with `{instanceId, gripId, originalVertexPos}`.
- On pointer-move: compute delta (with snap applied), emit throttled `GRIP_UPDATE` (don't write to undo stack; throttle to 60 Hz).
- On pointer-up: commit a single `GRIP_COMMIT` action with the final delta (this is the undo boundary).

This is the Blender operator pattern: intermediate state is preview-only, commit is the sole undoable unit.

---

## 7. Operator / Action Log

### 7.1 Action shape

```ts
// src/lib/authoring/actions.ts (new)
export type AuthoringAction =
  | { type: "MODE_ENTER"; payload: { mode: Mode; prior: Mode } }
  | { type: "MODE_EXIT";  payload: { mode: Mode } }
  | { type: "FLOOR_SET_HEIGHT"; payload: { floorIndex: number; heightM: number } }
  | { type: "INSTANCE_CREATE"; payload: { instance: Instance } }
  | { type: "INSTANCE_TRANSFORM_DELTA"; payload: { instanceId: string; deltaPos?: Vec3; deltaRot?: Vec3; deltaScale?: Vec3 } }
  | { type: "INSTANCE_DELETE"; payload: { instanceId: string } }
  | { type: "GRIP_COMMIT"; payload: { instanceId: string; vertexId: string; deltaPos: Vec3 } }
  | { type: "MODIFIER_ADD"; payload: { instanceId: string; modifier: Modifier } }
  | { type: "MODIFIER_REMOVE"; payload: { instanceId: string; modifierId: string } }
  | { type: "MODIFIER_REORDER"; payload: { instanceId: string; order: string[] } }
  | { type: "LAYER_STATE_SAVE"; payload: { name: string; snapshot: LayerSnapshot } }
  | { type: "LAYER_STATE_APPLY"; payload: { name: string } }
  | { type: "SNAPSHOT_NAMED"; payload: { name: string; timestamp: number } };

export interface ActionMeta {
  timestamp: number;
  userId: string | null;       // null for local-only sessions
  sessionId: string;
  floorIndex: number | null;
}

export interface LoggedAction { action: AuthoringAction; meta: ActionMeta }
```

### 7.2 Store wiring

- `src/store/authoring-store.ts` (new) wraps state with `zundo` middleware (new dependency — lightweight, MIT, well-maintained).
- Mutations go through a `dispatch(action)` method that:
  1. Applies the reducer.
  2. Pushes `{action, meta}` to `authoring-store.log` (capped at 500 entries, the tail persisted to localStorage for replay).
  3. Lets `zundo` snapshot previous state for undo.
- Keep the existing `use-undo-shortcut.ts` hook — re-wire it to `authoring-store` in place of (or in addition to) whatever it drives today.

### 7.3 Action Log panel

A new N-panel tab under Properties (`panel-registry` id `"action-log"`), rendering the most recent 100 entries with:

- timestamp, mode, action type, target entity name, short payload summary.
- Click entry: highlight target in viewport + outliner.
- "Replay from here" button (future, disabled in phase 1).
- Filter box (by action type, floor, instance).

---

## 8. Floor Isolation (Block Editor × Revit clip-plane hybrid)

Entering `mode === "Floor Edit"` on floor `N`:

1. Dim non-active floors — compose a `floorDimmer` boolean onto `<meshStandardMaterial>.opacity = 0.2` for all instances whose `floorIndex !== N`, and set their `raycast = null` to neutralize hit-testing.
2. Engage clipping planes on the R3F renderer. Two planes (`THREE.Plane`), one above and one below floor `N`'s Z band, added to `gl.clippingPlanes`. `localClippingEnabled = true` on renderer init.
3. Swap the toolbar: register a `floor-edit` toolbar group via `TOOLBAR_CONFIGS[${stage}:floor-edit]` exposing floor-specific tools (Add Wall, Add Opening, Route MEP, Copy floor to above, Copy floor to below).
4. Outliner: Storey tab folds non-active floors into a collapsed summary row, highlights floor `N`, shows lock icons elsewhere.
5. Status bar: `LiveCoords` clamps Z to the active floor's band.

Exit: reversing all five is a single state change — tear everything down off `authoring-store.mode`.

**Clipping plane band (math):** Given `floors[N].heightM` cumulative offsets, the band is `[z_N - 0.05, z_{N+1} + 0.05]` (5 cm overdraw to keep slab visible). Write planes into a `<primitive>` inside `<Canvas>`'s `gl` prop, or use the `useThree(({gl}) => gl.clippingPlanes = ...)` hook in a dedicated `<FloorClipPlanes/>` component.

---

## 9. Triple-taxonomy Outliner (detailed)

Three tabs on one store.

- **Hierarchy** — `Building → Floors[] → Layers (envelope/structure/mep/energy-zones/retrofit-targets) → Instances[]`.
- **Class** — IFC-style: Walls, Slabs, Columns, Openings (Doors, Windows), MEP (HVAC, Plumbing, Electric), Zones, Retrofit Targets. Built by group-by on the flat `instances[]` array by `instance.ifcClass`.
- **Storey** — flat per floor, ignoring class. Used for "select everything on floor 3" workflows.

All three read from `scene-model-store.instances` (new). Selection is shared across tabs via `selection-store.select`.

Per-row controls (three icons right-aligned, Blender Outliner style):

- Viewport visibility (eye / crossed eye).
- Render visibility (camera / crossed camera) — affects exports only.
- Selectable (arrow / arrow-lock) — hides from raycast without hiding visually.

These three flags persist in `authoring-store.treeFlags[entityId] = {viewportVisible, renderVisible, selectable}`. They compose with `layer-store.visibility` as an AND gate (an instance is shown iff its layer is visible AND its tree flag is visible).

---

## 10. Data Model — Family / Type / Instance

Borrowed from the Revit research track (per repo research spec `v7-family-type-instance`). Three registries + a flat instance list, stored in a **new** Zustand store.

File: `src/store/scene-model-store.ts` (new)

```ts
interface FamilyRecord {
  id: string;                    // e.g. "family:wall/korean-mid-century"
  ifcClass: "Wall" | "Slab" | "Column" | "Opening" | "MEPBranch" | ...;
  geometryFactory: string;       // ref to a pure fn in src/lib/procedural/*
  defaultParameters: Record<string, number | string | boolean>;
  schemaVersion: number;
}

interface TypeRecord {
  id: string;                    // e.g. "type:wall/concrete-300mm"
  familyId: string;
  parameters: Record<string, number | string | boolean>;
  materialRef: string;           // maps to pbr-materials.ts key
}

interface Instance {
  id: string;                    // nanoid
  typeId: string;
  floorIndex: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  overrides: Partial<TypeRecord["parameters"]>; // per-instance
  modifiers: ModifierRef[];
  treeFlags?: { viewportVisible: boolean; renderVisible: boolean; selectable: boolean };
}

interface SceneModelState {
  families: Record<string, FamilyRecord>;
  types: Record<string, TypeRecord>;
  instances: Record<string, Instance>;

  // Selectors
  instancesByFloor: (floorIndex: number) => Instance[];
  instancesByClass: (cls: string) => Instance[];

  // Mutations (all go through authoring-store.dispatch for logging)
  addInstance: (i: Instance) => void;
  updateInstance: (id: string, patch: Partial<Instance>) => void;
  deleteInstance: (id: string) => void;
}
```

- `scene-model-store` is the **only** source of truth for the authored parts of the scene. Existing recipe/material stores remain for the generated base model.
- Selectors live on the store, not in components, to keep memoization tight (pattern matches `material-store.ts`).
- Use immer middleware (already in the dependency tree via zustand) for nested patches.
- No persist initially — instances are session-scoped until Phase 3 introduces snapshot save.

---

## 11. Layer States

Named snapshots of `layer-store.visibility` + `layer-store.mepSubVisibility` + `treeFlags`.

File: `src/store/layer-state-store.ts` (new, small) or inline slice on `layer-store`.

```ts
interface LayerSnapshot {
  name: string;
  createdAt: number;
  visibility: Record<LayerId, boolean>;
  mepSubVisibility: Record<MepSubLayerId, boolean>;
  treeFlags: Record<string, { viewportVisible: boolean; renderVisible: boolean; selectable: boolean }>;
}

interface LayerStateSlice {
  snapshots: LayerSnapshot[];
  save: (name: string) => void;
  apply: (name: string) => void;
  delete: (name: string) => void;
}
```

UI: extend `layers-tab.tsx` (existing, lines 22–83) with a header row:

- Dropdown: "Load snapshot…" listing `snapshots[].name`.
- "Save as…" button: opens a text-input popover; creates a snapshot from the current state.
- Per-snapshot row: apply / rename / delete.

Seed snapshots (built-in, non-deletable): `Structural only`, `MEP only`, `Envelope only`, `All layers`.

Apply = dispatch `LAYER_STATE_APPLY` (logged, undoable).

---

## 12. Acceptance Criteria

- **A1.** Pressing Tab on an instance in Navigate mode enters Object Edit on that instance; pressing Tab again returns to Navigate. The `ContextualToolbar` mode badge visibly changes each time.
- **A2.** In Floor Edit on floor 3, clicking an instance on floor 5 does not select it and the instance is rendered at opacity ≤ 0.25. This is verifiable with a single `toHaveOpacity` check and a simulated click event.
- **A3.** Selecting a wall and pressing `G`, then `X`, then `1.5`, then Enter translates the wall exactly 1.5 m along world-X. A single `INSTANCE_TRANSFORM_DELTA` entry appears in the Action Log with `deltaPos: [1.5, 0, 0]`.
- **A4.** With END and PERP snaps active, dragging the endpoint of wall A within the tolerance of wall B's endpoint shows the END marker overlay; releasing commits the wall A endpoint exactly at wall B's endpoint coordinates (byte-equal floats).
- **A5.** Applying the `"MEP only"` layer state hides envelope, structure, energy-zones, and retrofit-targets; applying `"All layers"` restores the prior visibility. Undo reverts the layer change.
- **A6.** Adding a `MaterialOverride` modifier to a window instance and then reordering it below an `InsulationLayer` modifier produces a single `MODIFIER_REORDER` entry in the log and updates the render within one frame.
- **A7.** Opening the triple-taxonomy outliner and switching Hierarchy → Class → Storey tabs with a selected instance keeps the same instance selected and scrolls it into view in each tab.
- **A8.** Sharing a URL from the header captures `mode`, `activeFloorIndex`, `selectionId`, and camera state; opening that URL in a fresh browser restores all four without server state.

---

## 13. Implementation Phases

### Phase 1 — Mode system, outliner refactor, action log scaffold

Files to add:
- `src/store/authoring-store.ts` (+ `zundo` middleware)
- `src/lib/authoring/actions.ts`
- `src/lib/authoring/panel-registry.ts`
- `src/components/workspace/authoring-header-strip.tsx`
- `src/components/workspace/authoring-outliner.tsx`
- `src/components/viewer/mode-gate.tsx`

Files to modify (additive):
- `src/components/workspace/workspace-shell.tsx` — mount `AuthoringHeaderStrip`; route left panel between retrofit outliner and authoring outliner based on mode.
- `src/components/workspace/contextual-toolbar.tsx` — read `authoring-store.mode`, extend `TOOLBAR_CONFIGS` key lookup to `${stage}:${mode}`.
- `src/components/workspace/properties-panel.tsx` — add tab strip above the Accordion, drive by `PANEL_REGISTRY`.
- `src/hooks/use-undo-shortcut.ts` — re-wire to `authoring-store.undo/redo`.

Tests: action dispatch, undo/redo semantics, mode transitions, outliner tab selection preservation.

### Phase 2 — Gizmos, grips, snap engine

Files to add:
- `src/lib/authoring/snap-engine.ts`
- `src/components/viewer/snap-marker-overlay.tsx`
- `src/components/viewer/gizmo-layer.tsx`
- `src/components/viewer/grip-handle-layer.tsx`
- `src/components/viewer/dynamic-input-overlay.tsx`

Files to modify:
- `src/components/viewer/building-scene.tsx` — mount five new layers conditionally on mode.
- `src/components/workspace/status-bar.tsx` — append `LiveCoords`, `ActiveCommand`, `SnapState`, `Units` badges (additive; do not remove existing stage-hint/energy content).

Tests: snap candidate proximity math, grip commit-on-release semantics, gizmo axis locking, dynamic input numeric parsing.

### Phase 3 — Family/Type/Instance, floor isolation, layer states

Files to add:
- `src/store/scene-model-store.ts`
- `src/store/layer-state-store.ts` (or slice)
- `src/components/viewer/floor-clip-planes.tsx`

Files to modify:
- `src/components/viewer/config-tabs/layers-tab.tsx` — append layer-state dropdown, save-as button, snapshot rows.
- `src/components/viewer/procedural-building-model.tsx` — consult `scene-model-store.instances` on top of the base recipe so authored instances compose with the procedural base.
- `src/components/viewer/building-scene.tsx` — configure `localClippingEnabled = true` on gl init, mount `FloorClipPlanes`.

Tests: Family/Type/Instance selectors, per-floor raycast scoping, layer snapshot apply reversibility, clip-plane band math.

---

## 14. Risks & Mitigations

1. **R3F v9 + drei v10 `PivotControls` ref typing** — existing CLAUDE.md warns `OrbitControls` refs need `any`. Same class of issue likely with `PivotControls`. *Mitigation:* wrap in a custom component with `any`-typed ref, file a typed shim in `src/types/drei-shim.d.ts` if needed.
2. **Clipping planes interfere with SAOPass** — `building-scene.tsx` uses SAOPass from `three/examples/jsm/postprocessing/SAOPass.js` (CLAUDE.md). SAO's depth pass must respect the same clip planes; otherwise you get AO halos on clipped geometry. *Mitigation:* verify `SAOPass` honors `renderer.clippingPlanes`; if not, disable SAO while in Floor Edit or patch the pass.
3. **SSR hydration mismatch for mode/floor state** — pattern already seen (workflow-stepper uses `useHydration`). *Mitigation:* `authoring-store` persist partialize must exclude transient keys (`mode`, `snapCandidate`, `log`). Hydrate-gate the `AuthoringHeaderStrip` like `WorkspaceShell` already does.
4. **InstancedMesh + grip editing** — walls/slabs rendered via `InstancedMesh` from `facade-generator.ts` / `structure-generator.ts` (CLAUDE.md note on `setMatrixAt`). Per-instance grip editing requires either popping instances out to individual meshes while editing, or editing the matrix directly and calling `needsUpdate = true`. *Mitigation:* Phase 2 grip path first operates on non-instanced meshes only; Phase 3 introduces a "de-instance on edit, re-instance on commit" pass.
5. **Action log memory pressure** — 500-entry cap with full payloads can balloon for MEP branch edits. *Mitigation:* payload size cap (skip diff beyond a threshold, persist only action type + id), log truncation on session switch, optional gzip on localStorage persist.
6. **Mode desync between URL share and local state** — URL encodes `mode`, but `zundo` history doesn't load from URL. *Mitigation:* URL-loaded state clears the undo stack and inserts a single synthetic `SESSION_RESTORE` entry at index 0.
7. **Three.js `three-stdlib` types vs drei v10** — prior pain listed in CLAUDE.md. *Mitigation:* don't add new `three-stdlib` imports; prefer pure drei helpers for gizmos/grips.
8. **Zustand persist ordering** — `authoring-store`, `scene-model-store`, and `layer-state-store` all persist. Hydration order is not guaranteed. *Mitigation:* each store hydrates independently; cross-store selectors go through `useHydration()` gate.

---

## 15. Non-Goals (Explicit)

The following are explicitly **out of scope** for this spec:

- **Multiplayer collaboration** — no CRDT, no presence cursors, no conflict resolution. Sharing is URL-encoded snapshots only.
- **IFC authoring** — the IFC-class taxonomy is a grouping convention in the outliner; no IFC import or export. ECO2 bridge is planned elsewhere.
- **MEP auto-routing** — no automated duct/pipe layout. Engineers place branches manually; snap-engine helps.
- **Texture authoring** — PBR textures remain static assets in `public/textures/`. No texture painter, no UV editing.
- **CAD import beyond existing DXF upload stage** — no Revit/IFC/SketchUp import pipelines.
- **Server-side version history** — named snapshots live in localStorage / URL only until a future phase introduces a persistence backend.
- **Real-time simulation feedback** — energy calibration panels remain in the existing analytics accordion; no live re-simulation while dragging.

---

## Appendix A — Dependencies

**New dependencies (lightweight, widely used, as constrained):**

- `zundo` — Zustand time-travel middleware. ~2 KB, MIT. Needed for undo/redo wiring.
- `@dnd-kit/sortable` — sortable list for the modifier stack. Already in the React ecosystem; ~10 KB. MIT.

**No other dependencies required.** `cmdk` (shadcn `Command`), `@react-three/drei` (`<PivotControls>`, `<DragControls>`, `<Html>`), `@radix-ui/react-context-menu` (shadcn `ContextMenu`), and `@radix-ui/react-tabs` (shadcn `Tabs`) are already present.

## Appendix B — File Index (new & modified)

New files (14):
- `src/store/authoring-store.ts`
- `src/store/scene-model-store.ts`
- `src/store/layer-state-store.ts`
- `src/lib/authoring/actions.ts`
- `src/lib/authoring/panel-registry.ts`
- `src/lib/authoring/snap-engine.ts`
- `src/components/workspace/authoring-header-strip.tsx`
- `src/components/workspace/authoring-outliner.tsx`
- `src/components/viewer/mode-gate.tsx`
- `src/components/viewer/gizmo-layer.tsx`
- `src/components/viewer/grip-handle-layer.tsx`
- `src/components/viewer/snap-marker-overlay.tsx`
- `src/components/viewer/dynamic-input-overlay.tsx`
- `src/components/viewer/floor-clip-planes.tsx`

Modified files (7):
- `src/components/workspace/workspace-shell.tsx`
- `src/components/workspace/contextual-toolbar.tsx`
- `src/components/workspace/properties-panel.tsx`
- `src/components/workspace/status-bar.tsx`
- `src/components/viewer/building-scene.tsx`
- `src/components/viewer/procedural-building-model.tsx`
- `src/components/viewer/config-tabs/layers-tab.tsx`
- `src/hooks/use-undo-shortcut.ts`

No files removed (the git `D` lines already remove the legacy authoring files — this spec does not re-add them, and replaces two of them — `snap-engine.ts`, `snap-indicator.tsx` — with the new equivalents listed above).
