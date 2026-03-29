# Pitfalls Research

**Domain:** Guided authoring workflow UX retrofitted onto existing 3D BIM editor (Next.js + R3F + Zustand)
**Researched:** 2026-03-30
**Confidence:** HIGH (code-grounded) / MEDIUM (web-validated patterns)

---

## Critical Pitfalls

### Pitfall 1: Uncoordinated Multi-Store Mode Explosion

**What goes wrong:**
The project already has 7 Zustand stores (`authoring-store`, `plan-store`, `component-store`, `layer-store`, `recipe-store`, `material-store`, `app-store`) each with their own boolean "mode" flags. As the guided workflow adds more stages (select → assemble → customize → place → transform), new booleans get sprinkled across stores: `isAuthoring`, `drawingMode`, `viewMode`, `annotationMode`, `transformMode`. Within months you have 10+ independent mode flags that can produce illegal combinations — e.g. `drawingMode === "wall"` while `annotationMode === "section"` while `isAuthoring === false`. Components start adding local guards (`if (isAuthoring && drawingMode === 'wall' && annotationMode === 'none')`) that nobody can reason about. The viewer-overlay.tsx already shows early signs of this: it reads from both `useAuthoringStore` and `usePlanStore` independently with no single source of truth for "current stage."

**Why it happens:**
Zustand makes adding new slices frictionless. Each feature developer adds the flag they need to the nearest-looking store. No coordination layer enforces mutual exclusivity. The problem is invisible until you hit a bug where two modes are simultaneously active.

**How to avoid:**
Introduce a single `workflowStore` (or a `WorkflowOrchestrator` actor) as the sole source of the current workflow stage. All other stores read from this to determine what's legal. Use an explicit finite state: `type WorkflowStage = "idle" | "assembling" | "customizing" | "placing" | "transforming"`. Illegal combinations become type errors. If the full transition logic becomes complex, use XState v5's lightweight actor model — a single state machine that coordinates cross-store transitions without replacing Zustand everywhere.

**Warning signs:**
- A component imports from 3+ stores just to determine "what mode am I in?"
- A bug report where "doing X while Y is active breaks Z"
- `viewer-overlay.tsx` props list grows beyond 12 items
- Tests must set 4+ store flags to reproduce a scenario

**Phase to address:**
Phase 1 (Workflow State Foundation) — Define the stage enum and WorkflowOrchestrator before any UI is built. This is a prerequisite, not a refactor.

---

### Pitfall 2: viewer-overlay.tsx Monolith Growth

**What goes wrong:**
`viewer-overlay.tsx` is already 603 lines rendering toolbar buttons, section sliders, floor selectors, snap controls, drawing mode toggles, and opening preset pickers — all in one file with 20+ store subscriptions via individual `useAuthoringStore`/`usePlanStore` calls. Adding contextual toolbars for the new workflow stages (assembling, placing, etc.) to the same file will push it past 1200 lines. At that point: (a) every store change triggers reconciliation of the entire overlay tree, (b) adding a new tool requires understanding 600 lines of context, (c) the component becomes untestable as a unit.

**Why it happens:**
Overlay components are easy to extend — you just add an `{isAuthoring && <NewButton />}` block. There's no visible cost until the file is already unmaintainable.

**How to avoid:**
Decompose the overlay into a toolbar registry pattern before adding new toolbars. Each workflow stage owns its toolbar fragment: `<AssemblingToolbar />`, `<PlacingToolbar />`, `<TransformToolbar />`. The orchestrator component renders the correct fragment based on `workflowStage`. Each fragment has its own store subscriptions, its own test file, and its own props surface. The current viewer-overlay.tsx is the warning that this decomposition should happen in Phase 1 alongside the workflow state refactor.

**Warning signs:**
- viewer-overlay.tsx exceeds 400 lines
- New toolbar buttons are added as inline JSX directly in the return block
- Prop drilling through `onToggleX` / `xOpen` booleans from the parent page

**Phase to address:**
Phase 1 (Workflow State Foundation) — Decompose the overlay as part of the same structural refactor that introduces the workflow stage enum.

---

### Pitfall 3: R3F Canvas / HTML Panel Event Boundary Conflicts

**What goes wrong:**
The R3F canvas receives all pointer events by default. When floating HTML panels (shadcn sheets, dialogs, popovers) overlap the canvas, pointer events pass through to the canvas unless explicitly blocked. Two failure modes appear: (1) clicking a button in a panel also fires a ray into the scene and selects/deselects a 3D object; (2) OrbitControls inside the canvas receives drag events that were intended for a panel drag handle, causing the camera to spin while the user tries to resize a panel. The Three.js issue tracker has documented OrbitControls using `stopPropagation` aggressively which blocks DOM bubbling in unpredictable ways (issue #21339).

**Why it happens:**
R3F's event system is a separate reconciler from the DOM. HTML elements overlaid via CSS `z-index` do not automatically block R3F raycasting. Developers assume DOM z-index = event z-index, which is false.

**How to avoid:**
- Set `pointer-events: none` on the canvas container and `pointer-events: auto` only on the canvas itself when no HTML panel is active over it.
- When a panel opens over the viewport, disable the R3F event system: use the `events` prop on `<Canvas events={{ enabled: false }}>` or toggle it programmatically via the `eventManager` from `useThree()`.
- For OrbitControls: always use `makeDefault` from `@react-three/drei` and set `enabled={!isPanelOpen}` to prevent camera movement while panels are active.
- Apply `e.stopPropagation()` at the HTML panel root's `onPointerDown` to prevent synthetic events reaching the canvas.

**Warning signs:**
- Clicking a dialog close button also triggers object selection in the scene
- Camera rotates when user drags a resizable panel handle
- `pointerover` fires on 3D objects while cursor is visually over a panel

**Phase to address:**
Phase 2 (Workspace Layout) — Must be solved before any panel/canvas overlap is added. Write an integration test that verifies a click on a panel does not fire a scene pick event.

---

### Pitfall 4: Keyboard Shortcut Conflicts Between Canvas and HTML Inputs

**What goes wrong:**
Blender-style shortcuts (`G` = move, `R` = rotate, `S` = scale, `ESC` = cancel) registered as `keydown` listeners on `window` or `document` fire even when focus is inside a text input, number input, or search field in an HTML panel. A user typing "Strength" in a material property field triggers the scale tool on every `S` keypress. Similarly, `ESC` to dismiss a dropdown also cancels the current drawing operation.

**Why it happens:**
Canvas keyboard listeners are added globally because the R3F canvas has no reliable focus model — it's a `<canvas>` element that doesn't receive native keyboard focus. Developers add `window.addEventListener('keydown', ...)` and forget to gate on focus context.

**How to avoid:**
- Always check `document.activeElement` before acting on canvas shortcuts: if `activeElement` is an `INPUT`, `TEXTAREA`, or `[contenteditable]`, suppress the shortcut.
- Use a centralized `useKeyboardShortcuts` hook that enforces this check and is the only place shortcuts are registered.
- For the canvas focus model: add `tabIndex={0}` to the canvas wrapper div and listen there rather than on `window`. The shortcut handler only fires if the canvas wrapper or one of its 3D children has focus.
- Document all shortcuts in a keyboard shortcut registry (a plain object) so conflicts are visible before they ship.

**Warning signs:**
- `S` key while typing in a properties panel changes the transform mode
- `ESC` closes a dialog AND cancels a wall draw simultaneously
- Multiple `useEffect(() => { window.addEventListener('keydown', ...) })` calls across different components

**Phase to address:**
Phase 1 (Workflow State Foundation) — The keyboard shortcut registry should be established before any shortcuts are wired.

---

### Pitfall 5: Undo/Redo Scope Fragmentation

**What goes wrong:**
`authoring-store.ts` has a per-element `editHistory: ElementEdit[]` undo stack tracking property changes. `plan-store.ts` has no undo at all — drawing a wall is not undoable. `component-store.ts` has no undo. When the guided workflow adds more actions (place component, assign material, set wall height, add annotation), each developer decides independently whether to wire undo. The result: some actions are undoable, others are not, and `Ctrl+Z` produces inconsistent behavior that erodes user trust more than having no undo at all.

**Why it happens:**
The current undo system is scoped to element property edits only. New action categories are added to different stores that don't participate in the history stack.

**How to avoid:**
Define a single command pattern interface before the workflow UX ships: `interface Command { execute(): void; undo(): void; label: string; }`. Every user-initiated action that mutates shared state goes through this interface. The `workflowStore` (or a dedicated `historyStore`) holds a single linear command stack. All stores expose mutation methods that accept `Command` objects rather than direct setters. This is a non-trivial refactor of existing stores — it needs a dedicated phase before workflow UI is layered on top.

**Warning signs:**
- `Ctrl+Z` undoes a material change but not a wall draw
- Users report "undo doesn't work for [feature X]"
- Different stores have separate `history` arrays

**Phase to address:**
Phase 1 (Workflow State Foundation) — Define the command interface. Phase 3 (Contextual Toolbars) — Verify every new action goes through it.

---

### Pitfall 6: "Guided but Flexible" Becoming Neither

**What goes wrong:**
The stated design goal is "guided-but-flexible" — users see a clear step flow but can skip steps or access tools freely. In practice, the guided rail and the free-access tools end up competing. The guided stepper enforces a linear sequence; power users bypass it and leave the workflow in an intermediate state the UI wasn't designed for (e.g., a component is placed before assembly is complete). The contextual UI then shows wrong tools because the stage doesn't match the actual model state. The result is a UX that is restrictive for experts (they feel railroaded) and confusing for novices (the guide gets bypassed and they're lost).

**Why it happens:**
Guided wizards are designed for linear processes. BIM authoring is inherently non-linear. Retrofitting a linear guide onto a non-linear tool without explicit "escape hatch" design produces tension.

**How to avoid:**
- Model the workflow as a DAG (directed acyclic graph) of stages, not a linear list. Stages have prerequisites (can't place if nothing is assembled) but not strict order.
- The guided stepper shows the recommended path, but each stage shows its status (complete/incomplete/skippable) rather than blocking navigation.
- "Expert mode" is not a separate mode — it's just the same UI with the guided stepper collapsed. The toolbars remain the same.
- Never disable a tool because the user is "in the wrong stage." Instead, show a tooltip explaining the prerequisite.

**Warning signs:**
- A "Skip" button is added to the stepper that bypasses validation
- Power users report feeling slowed down by the new workflow
- A "back" button is needed because the linear flow goes in the wrong direction

**Phase to address:**
Phase 2 (Workspace Layout) — The stage model must be DAG-based from the start. Do not implement a linear wizard and iterate — the DAG shape must be designed upfront.

---

### Pitfall 7: Panel Resize Triggering 3D Scene Re-renders

**What goes wrong:**
When a resizable panel (e.g. a properties panel or a component palette) is dragged, if the panel size is stored in React state (or a Zustand store that components subscribe to), every pixel of drag motion triggers a React re-render. In a scene with 7+ draw calls and post-processing (SAOPass), this causes the R3F render loop to compete with React's reconciler at 60fps during drag. The result: stuttering panels, dropped frames, or the panel "jumping" after drag ends.

**Why it happens:**
`react-resizable-panels` calls `onLayoutChange` on every pointer move. If this callback updates React state, all subscribers re-render. The panel and the 3D scene are inadvertently coupled through shared state.

**How to avoid:**
- Use `react-resizable-panels`' own internal state for panel sizes — do not lift panel sizes into a Zustand store unless persistence across sessions is required.
- If persistence is needed, use `onLayoutChanged` (not `onLayoutChange`) which fires only when drag completes, not on every pointer move.
- Keep the R3F canvas in a separate render tree subtree that is not subscribed to panel size state. Use CSS `flex` or `grid` to let the canvas fill available space rather than reading panel sizes as React props.
- The canvas should use `style={{ width: '100%', height: '100%' }}` inside its container — the container resizes, the canvas fills it, Three.js handles the resize via `ResizeObserver` internally.

**Warning signs:**
- Dragging a panel causes the 3D scene frame rate to drop
- `onLayoutChange` callback updates a Zustand store
- The canvas has hardcoded pixel width/height that must be recalculated on panel resize

**Phase to address:**
Phase 2 (Workspace Layout) — Establish the panel/canvas size isolation pattern before any panels are made resizable.

---

### Pitfall 8: Contextual Toolbar Instability (Shift on Context Change)

**What goes wrong:**
When the workflow stage changes, the contextual toolbar swaps its content. If the toolbar has a static outer container but dynamic inner buttons, users experience a jarring layout jump — buttons disappear and reappear in different positions. Worse: if the new context adds more buttons than the previous one, the toolbar overflows and wraps to a second row, pushing the canvas down by a pixel row and invalidating all absolute-positioned overlay elements (floor info badge, view presets, etc.). The existing viewer-overlay.tsx uses `absolute top-3 right-3` positioning, meaning any toolbar height change breaks the layout.

**Why it happens:**
Contextual toolbars are designed with the assumption that "the toolbar size is approximately stable." BIM tools have wildly different toolbar densities per mode — edit mode has 12 buttons, view mode has 4. If the container is not explicitly sized, it collapses and re-expands on context changes.

**How to avoid:**
- Fix the toolbar container height. The largest context determines the container height. Unused slots are invisible but the container height is stable.
- Alternatively, use a "strip plus overflow menu" pattern: a fixed-width strip shows the primary 4-5 tools for the current context; additional tools are in a `...` overflow menu.
- Do not mix `absolute` positioned overlays with `flow` positioned toolbars in the same layout layer. Either all overlays are absolutely positioned (fixed dimensions assumed) or the canvas container is a proper flexbox layout.
- The Substance 3D Painter pattern (static sections right, context-sensitive section left, but same height always) is the safest approach.

**Warning signs:**
- Adding a new authoring tool shifts all other overlay elements by a row
- The canvas viewport "jumps" when switching between workflow stages
- CSS contains `calc(100% - Xpx)` where X is a hardcoded toolbar height

**Phase to address:**
Phase 3 (Contextual Toolbars) — Before any contextual swap logic, establish and test toolbar height stability.

---

### Pitfall 9: Breaking Existing Power-User Workflows During Transition

**What goes wrong:**
v2.0 shipped with 181 unit tests and 7 E2E tests. The power users (GX team) have learned the current layout: edit mode toggle top-right, plan view toggle top-right, floor selector appears when in plan mode. The v3.0 UX overhaul moves these controls into a guided workflow stepper with different spatial anchors. Existing keyboard shortcuts change. The floor selector moves from the viewport overlay to a sidebar panel. Users who developed muscle memory for v2.0 encounter "regression" even though the features are still there — they're just in different places.

**Why it happens:**
UX redesigns prioritize the new user journey but underweight the cost to existing users who have internalized the current layout. In enterprise tools (which this is — GX team daily use), layout regressions are high cost.

**How to avoid:**
- Audit the current v2.0 control locations before designing v3.0 positions. Map each control to its new location explicitly.
- Run the existing 7 E2E tests against the v3.0 layout to detect regressions immediately.
- For any control that moves, add a "where did X go?" hint the first time the user opens v3.0. This is a one-time tooltip, not a persistent guide.
- Do not remove keyboard shortcuts — add new ones. Old shortcuts should continue to work even if new alternatives exist.
- The transition plan should include a "v3.0 migration" note in CLAUDE.md listing changed control locations for the team.

**Warning signs:**
- E2E tests start failing because selectors for existing controls can't be found
- A team member reports "edit mode button is gone" (it moved, not removed)
- Shortcuts are deleted from the keyboard registry when controls are relocated

**Phase to address:**
Phase 1 (Workflow State Foundation) — Conduct the control location audit before any UI is moved. Phase 5 (Verification) — Run E2E regression suite against final layout.

---

### Pitfall 10: Drag-and-Drop from Component Palette to 3D Scene Misfires

**What goes wrong:**
`component-store.ts` has a `dragging: ComponentPreset | null` field. The component palette (HTML DOM) fires `dragstart`, the 3D canvas (WebGL) has no native drag event — it only has pointer events. The handoff requires: (1) detecting that a drag from HTML ended over the canvas; (2) raycasting to find the drop position; (3) creating the placed component. The failure modes are: drag ends outside the canvas (no drop event), drag ends on an HTML panel that overlaps the canvas (two drop handlers fire), or the `pointerup` event that triggers the drop also triggers an object click (selects something instead of placing).

**Why it happens:**
HTML drag-and-drop and Three.js pointer events are different systems. Bridging them requires explicit coordination that is non-obvious.

**How to avoid:**
- Use pointer events exclusively, not HTML5 drag-and-drop API. On `pointerdown` of a palette item, set `dragging` in the store; on `pointerup` on the canvas, check `dragging` and perform the placement. This keeps everything in one event system.
- Set `pointer-events: none` on all HTML elements during a drag operation (except the canvas) so the `pointerup` reliably lands on the canvas.
- Use a `isDraggingComponent` flag in `workflowStore` to suppress the canvas's normal click-to-select behavior during a drag operation.
- After placement, clear `dragging` synchronously in the `pointerup` handler before any other handlers run.

**Warning signs:**
- Components placed in the wrong position because drop coordinates are offset
- "Double placement" bug — component appears twice on drop
- Drag-selecting a camera orbit at the same time as placing a component

**Phase to address:**
Phase 4 (Component Placement) — This is specific to the placement workflow and should have dedicated integration tests.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding boolean flags to existing stores for new modes | No new files, quick to ship | Illegal state combinations multiply; reasoning cost explodes | Never for workflow-level modes; acceptable for ephemeral UI state (e.g. `isTooltipOpen`) |
| Extending `viewer-overlay.tsx` with more conditional sections | Keeps all toolbar code in one place | File becomes unmaintainable; every change risks regressions across all modes | Never beyond current size; already needs decomposition |
| Using `window.addEventListener` for keyboard shortcuts | Works anywhere in the tree | Fires in text inputs; no central conflict detection; hard to clean up | Never — use a centralized hook |
| Storing panel sizes in Zustand | Enables persistence, feels "consistent" | Couples panel drag events to React renders; causes 3D frame drops | Only if persistence is needed; use `onLayoutChanged` not `onLayoutChange` |
| Implementing workflow as a linear stepper with `currentStep: number` | Simple to reason about initially | Can't model non-linear BIM authoring; breaks when users skip or revisit steps | Never for BIM workflows; linear steppers are for onboarding, not authoring |
| Lazy-loading panels as they're first opened | Reduces initial bundle | First-open latency in a tool users open dozens of times daily is jarring | Only for rarely-used panels (e.g. an export dialog); not for core authoring panels |

---

## Integration Gotchas

Common mistakes when connecting the new UX layer to existing subsystems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| R3F Canvas + HTML panels | Panels absorb clicks intended for canvas OR canvas absorbs clicks intended for panels | Explicitly manage `pointer-events` CSS and R3F `eventManager.enabled` based on panel open state |
| Zustand stores + new workflow orchestrator | WorkflowOrchestrator reads from stores to decide stage; stores don't know about the orchestrator | The orchestrator is the authority; stores expose methods the orchestrator calls; stores never determine stage |
| Undo/redo + new command types | New actions bypass the command pattern and directly mutate store state | All user-initiated mutations go through `historyStore.execute(command)` |
| shadcn `Sheet`/`Dialog` + canvas focus | Opening a Sheet doesn't blur the canvas wrapper, so canvas shortcuts keep firing | On Sheet open, explicitly blur the canvas wrapper div and re-focus on Sheet close |
| `react-resizable-panels` + Three.js renderer size | Renderer size is set on mount and never updated when panels resize | Use `ResizeObserver` on the canvas container; call `renderer.setSize()` or use R3F's `gl.setSize()` on container size change |
| VWorld footprint data + plan-store walls | VWorld polygon is used to initialize the 3D scene; user-drawn walls in plan-store are separate; they diverge silently | When the user switches from parametric to plan-draw mode, copy the VWorld footprint into plan-store walls as the starting geometry, not as a separate rendering layer |

---

## Performance Traps

Patterns that work in development but degrade under real conditions.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| React state updates driving animation loop | Frame rate drops to match React reconciler speed (~16ms React overhead per frame) | Mutate Three.js object refs directly in `useFrame`; never call `setState` or Zustand setters inside `useFrame` | Immediately — even 1 state update per frame causes jank |
| `StructuralTooltip` allocating `Raycaster` per frame | CPU spike; tooltip lag | Allocate `Raycaster` once outside `useFrame` via `useMemo`; already documented as known debt in v2.0 audit | At ~20+ structural elements in the scene |
| `onLayoutChange` (not `onLayoutChanged`) updating store | Panel drag causes 60 re-renders/second; scene frame drops | Use `onLayoutChanged` for persistence; accept imperative CSS updates during drag | During any panel resize |
| Component palette rendering all available components eagerly | Initial load slow; memory pressure | Virtualize the component list (TanStack Virtual or windowing); render only what's in viewport | At ~50+ components in the palette |
| Multiple Zustand stores each with `shallow` comparisons on large slices | Excessive re-renders when unrelated state changes | Use fine-grained selectors: `useStore(s => s.specificField)` not `useStore(s => s.wholeSlice, shallow)` | As stores grow beyond ~10 fields |
| SAOPass enabled during panel animations | GPU stall when SAOPass re-renders while CSS transition runs | Disable post-processing during panel open/close animations; re-enable after `transitionend` | Noticeable on integrated graphics; always present on mobile |

---

## UX Pitfalls

Common user experience mistakes specific to this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all tools at once (no progressive disclosure) | Cognitive overload; new GX team members don't know where to start | Show only the tools relevant to the current workflow stage; use the stage-based contextual toolbar pattern |
| Disabled buttons with no explanation | User doesn't understand why a tool is greyed out | Replace disabled buttons with enabled buttons that show a tooltip explaining the prerequisite when clicked |
| Mode indicator not visible at all times | User loses track of current mode; unexpected behavior when clicking | Persistent stage badge in viewport — always visible, always current, single source of truth |
| Undoable and non-undoable actions mixed silently | User presses Ctrl+Z expecting to undo a wall draw, but only the last material change is undone | Either make all authoring actions undoable or clearly mark non-undoable actions with a warning before they execute |
| Panels that close on outside click while the user is working in the canvas | User rotates the camera and the properties panel closes | Panels should not close on canvas pointer events; close on explicit close button or `Escape` only |
| Step labels that use internal terminology ("Assembling", "Recipe") | GX team members who are not developers don't understand the workflow stages | Use domain language: "Select Building" → "Configure Structure" → "Set Materials" → "Place on Map" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Workflow state machine:** Often missing illegal state prevention — verify that `drawingMode === 'wall'` while `annotationMode === 'section'` is structurally impossible, not just guarded by conditionals.
- [ ] **Contextual toolbar:** Often missing height-stability test — verify that switching between all workflow stages does not change the toolbar container height or shift any `absolute`-positioned overlay elements.
- [ ] **Keyboard shortcuts:** Often missing input-focus guard — verify that pressing `G`, `R`, `S`, `ESC` inside any text input or number field in any panel has no effect on the 3D scene.
- [ ] **Panel/canvas event isolation:** Often missing during drag operations — verify that dragging a component from the palette over an open properties panel does not trigger the panel's hover/click handlers.
- [ ] **Undo coverage:** Often missing for plan-store mutations — verify that `Ctrl+Z` undoes wall draws, opening placements, and floor height changes, not just element property edits.
- [ ] **Existing E2E tests:** Often broken by control relocation — verify all 7 existing Playwright tests pass against the new layout before merge.
- [ ] **Mobile/touch:** Often missing pointer-event logic for touch — verify that `pointerdown`/`pointerup` based drag-and-drop works on touch devices (relevant for future field use on tablets).
- [ ] **SAOPass post-processing during transitions:** Often causes visual artifact — verify that panel open/close animations do not produce SAOPass flicker by disabling post-processing during transitions.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Uncoordinated mode explosion | HIGH | Introduce `workflowStore` enum; audit all `isX` / `xMode` booleans; migrate one store at a time; requires 2-3 days and careful testing |
| viewer-overlay.tsx monolith | MEDIUM | Extract toolbar fragments one at a time without changing behavior; test each extraction; 1 day per fragment |
| Canvas/panel event conflicts | MEDIUM | Add `pointer-events` CSS and R3F `eventManager` toggle; write integration tests; 1 day to fix, 1 day to test |
| Keyboard shortcut conflicts | LOW | Add `document.activeElement` guard to the shortcut hook; 2-4 hours |
| Panel resize causing frame drops | LOW | Switch `onLayoutChange` to `onLayoutChanged`; verify no Zustand setters called during drag; 2-4 hours |
| Undo fragmentation | HIGH | Requires retrofitting command pattern across all stores; do not attempt mid-milestone; defer to a dedicated undo hardening phase |
| Existing E2E regressions | MEDIUM | Update selectors, do not change test intent; if a test must change behavior, that is a regression, not a "test update" |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Uncoordinated mode explosion | Phase 1: Workflow State Foundation | All mode flags are derivable from a single `workflowStage` enum; no component imports from 3+ stores for mode determination |
| viewer-overlay.tsx monolith | Phase 1: Workflow State Foundation | File is decomposed into stage-scoped toolbar fragments; no fragment exceeds 200 lines |
| Canvas/panel event conflicts | Phase 2: Workspace Layout | Click on any HTML panel does not select/deselect a 3D object; camera does not move while a panel drag handle is being used |
| Keyboard shortcut conflicts | Phase 1: Workflow State Foundation | All shortcuts registered in one centralized hook; pressing any shortcut inside an `<input>` has no effect |
| Undo/redo fragmentation | Phase 1: Workflow State Foundation (interface) + Phase 3: Contextual Toolbars (implementation) | `Ctrl+Z` in a test can undo the last 5 actions regardless of which store they touched |
| "Guided but flexible" tension | Phase 2: Workspace Layout | Stages are DAG-modeled; each stage shows status not blocker; expert users can reach any tool from any stage |
| Panel resize frame drops | Phase 2: Workspace Layout | Dragging panel handle during scene animation: frame rate does not drop below scene baseline |
| Contextual toolbar layout shift | Phase 3: Contextual Toolbars | Switching between all stages in E2E: zero pixel shift in absolute-positioned overlays |
| Breaking existing workflows | Phase 1 (audit) + Phase 5 (verification) | All 7 existing E2E tests pass; v2.0 control location audit document exists and maps each control to v3.0 location |
| Drag-and-drop misfires | Phase 4: Component Placement | Integration test: drag from palette, drop on canvas, exactly one component placed at correct position |

---

## Sources

- React Three Fiber Events Documentation: https://r3f.docs.pmnd.rs/api/events
- R3F/Three.js OrbitControls stopPropagation issue: https://github.com/mrdoob/three.js/issues/21339
- react-resizable-panels performance (onLayoutChange vs onLayoutChanged): https://github.com/bvaughn/react-resizable-panels/issues/29
- R3F performance guide: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- XState vs Zustand for workflow orchestration (2025): https://makersden.io/blog/react-state-management-in-2025
- CKEditor contextual toolbar design patterns: https://github.com/ckeditor/ckeditor5-design/issues/99
- NN/g contextual menus: https://www.nngroup.com/articles/contextual-menus/
- IxDF Progressive Disclosure: https://ixdf.org/literature/topics/progressive-disclosure
- Blender mode confusion (Object Mode vs Edit Mode): https://vagon.io/blog/object-mode-vs-edit-mode-in-blender
- Revit beginner mistakes (BIM UX anti-patterns): https://www.bimpure.com/blog/13-beginner-mistakes-to-avoid-in-revit
- R3F HTML overlay best practices: https://github.com/pmndrs/react-three-fiber/discussions/1536
- Substance 3D Painter toolbar reference: https://helpx.adobe.com/substance-3d-painter/interface/toolbars.html
- Three.js 100 performance tips: https://www.utsubo.com/blog/threejs-best-practices-100-tips
- Code review of `src/components/viewer/viewer-overlay.tsx` (603 lines, 20+ store subscriptions)
- Code review of `src/store/authoring-store.ts`, `plan-store.ts`, `component-store.ts` (no cross-store coordination layer)

---
*Pitfalls research for: Guided authoring workflow UX retrofit — Korean BIM Energy Management System (v3.0)*
*Researched: 2026-03-30*
