# Feature Research

**Domain:** BIM Authoring UX — Guided Workflow Overhaul for Korean Energy Management System
**Researched:** 2026-03-30
**Confidence:** MEDIUM (benchmark patterns from authoritative sources; web-app-specific BIM energy UX from secondary sources)

---

## Research Basis

Benchmarks studied:
- **Revit 2026** — contextual ribbon, Properties Palette, Modify tab, Options Bar (Autodesk official docs)
- **ArchiCAD** — Navigator Palette, Toolbox, Info Box, context-sensitive palettes (Graphisoft official docs)
- **SketchUp** — 4-step BIM workflow model, lightweight palette system (Trimble docs)
- **Blender** — N-panel sidebar, Properties editor, pie menus, mode enum tabs, Workspace tabs (Blender developer wiki)
- **Spline** — left outliner, right property panel, top toolbar, quasimodal transform handles (Spline docs + UX reviews)
- **Vectary** — guided onboarding program, real-time collaboration, clean UI-first philosophy (Vectary docs)
- **ShapeDiver** — range sliders, dropdowns, web-embeddable parametric configurator, progressive parameter reveal (ShapeDiver help)
- **Grasshopper / Dynamo** — node-canvas workflow, panel inputs, wire connections, group clusters (Autodesk University)
- **Nielsen Norman Group** — mode slips, quasimodes, spring-loaded interactions, progressive disclosure

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any serious BIM authoring tool is expected to have. Missing these = the tool feels broken or amateurish.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Persistent property panel** | Every benchmark (Revit Properties Palette, Blender N-panel, Spline right panel) has a docked right-side panel showing the selected element's properties. Users expect click-to-inspect to work immediately. | LOW | Already partially built as `material-panel`. Needs to become selection-aware and always visible, not hidden behind a button. |
| **Selection-driven context shift** | In Revit, selecting a wall changes the ribbon to show wall-specific tools. In Blender, selecting an object shows its material/modifier tabs. Users expect the UI to "know" what they selected. | MEDIUM | Requires a global selection-state store that drives toolbar and panel content. |
| **Mode indicator with clear escape** | All BIM tools show which mode is active (Draw Wall, Place Window, etc.) via a status bar, highlighted toolbar button, or cursor change. Users need to know what mode they're in and how to exit it. NN/G defines mode slips as a critical usability failure. | LOW | A persistent "current mode" badge + Escape key handler. The existing tool modes (draw, select, place) need visible labels. |
| **Undo / Redo** | Table stakes in every authoring tool. Users will test this in the first 60 seconds. | MEDIUM | Must span across all authoring actions: wall drawing, component placement, property edits, floor changes. |
| **Object hierarchy / outliner** | Spline left panel, ArchiCAD Navigator, Blender Outliner — all show a tree of the scene objects. Users need to click a floor or room from a list, not hunt in the 3D view. | MEDIUM | A floor/room/component tree panel. Already have multi-floor support but no outliner UI. |
| **Viewport-dominant layout** | Every modern tool (Revit, Blender, Spline) places the 3D viewport as the primary visual element with panels docked around it. The current page-per-building card layout is the wrong metaphor. | MEDIUM | Dashboard layout redesign: full-height viewport, collapsible side panels. Described in PROJECT.md Problem A. |
| **Keyboard shortcuts for common tools** | Revit 2026 added keyboard shortcut support for contextual commands. Blender is keyboard-first. Users expect S=scale, G=grab (or domain equivalents) at minimum. | LOW | A shortcut map for mode switching (V=select, W=draw wall, E=place, Esc=cancel, Ctrl+Z=undo). |
| **Zoom-to-fit / zoom-to-selection** | Standard in all 3D tools. Users press a key to focus the camera on what they selected. | LOW | React Three Fiber camera controls — frame selection bounding box. |
| **Status bar / prompt line** | ArchiCAD and Revit show contextual instructions in a status bar: "Click to place door — press Escape to cancel." This is the single most effective guided UX pattern for non-expert users. | LOW | A one-line status bar at the bottom of the viewport showing the current operation and next action. |
| **Snap indicators** | All drawing tools show visible snap dots, midpoint markers, and alignment lines. Already partially built (snap system exists) but snap feedback must be visually clear. | LOW | Snap type label on cursor or viewport overlay. |

### Differentiators (Competitive Advantage)

Features that distinguish this tool from generic BIM editors, specifically for the GX energy-audit use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Guided authoring pipeline with stage gates** | After building selection, a persistent workflow stepper (Select → Configure → Verify → Export) tells users exactly where they are and what comes next. No equivalent in Revit/ArchiCAD (they assume expert users). ShapeDiver's progressive parameter reveal is the closest analogue. | MEDIUM | A horizontal progress bar or sidebar stages list. Each stage unlocks the next when minimum data is present. Completion state: building footprint confirmed, materials assigned, energy inputs set. |
| **Inline energy feedback during property editing** | As the user changes wall insulation or window U-value, a live kWh/m² readout updates in the property panel. This closes the "configure → simulate → check" loop that currently requires ECO2 round-trips. | HIGH | Requires calculation engine from PROJECT.md Problem C. Depends on: property panel, material store. |
| **Korean building code auto-inference with override** | The existing `korean-building-codes.ts` inference engine pre-fills structural type, era-based materials, and wall assemblies. No other web BIM tool has Korean code awareness. The differentiator is surfacing these inferences as "suggested values" the user can accept or override — not invisible defaults. | MEDIUM | Show inferred values in the property panel with a "suggested" badge and an edit affordance. |
| **Dual-view sync (2D plan + 3D view)** | ArchiCAD pioneered this; Revit enforces it. Editing a wall in 2D plan immediately updates the 3D model. This tool already has both views — the differentiator is making them truly live-linked so users trust both panes. | HIGH | Depends on: shared wall/room state that both views read from. Currently the 2D and 3D rendering pipelines are separate. |
| **Contextual help tooltips tied to authoring stage** | When in "Configure Materials" stage, hovering a thermal resistance field shows a tooltip explaining what R-value means for Korean climate zone. No BIM tool does this; they assume training. ShapeDiver's simplicity is the right model but applied to energy domain concepts. | LOW | Tooltip content library keyed to field names. Adds zero architecture complexity. |
| **One-click floor clone with material inheritance** | Already built (copy-floor) but presenting it as an explicit affordance in the floor management UI — "Copy floor → all properties cloned" — is a differentiator over Revit's tedious floor-by-floor setup. | LOW | UI affordance on the floor outliner. Logic is already implemented. |
| **Component placement from filtered catalog** | Instead of Revit's undiscoverable family browser, a filtered component palette (filter by type: door, window, MEP, stair) surfaced as a drag-and-drop panel during placement mode. | MEDIUM | Depends on: existing component placement system. Needs catalog UI wrapper with category filters. |
| **Export-readiness indicator** | A checklist panel showing what data is complete vs. missing before ECO2/IFC export (floor heights: complete, window U-values: 3 missing, HVAC type: not set). Prevents export failures. | LOW | Read from state stores, display completeness per required ECO2 field. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full node graph editor (Grasshopper-style)** | Looks powerful; parametric modeling is the correct mental model for building configuration. | Grasshopper has a steep learning curve that repels non-expert users. GX team users are energy auditors, not parametric designers. Building a node canvas is 3-6 months of work for a UX that most users will never use. | Use ShapeDiver's model: expose Grasshopper-style parameters as sliders, dropdowns, and numeric inputs in the property panel. Users get parametric control without the node canvas. |
| **Full Revit-style ribbon with all tabs** | Revit's ribbon organizes thousands of tools. Familiar to BIM-trained users. | For a web app with 20 core tools, a multi-tab ribbon adds cognitive overhead without benefit. Revit users complain the ribbon is cluttered even in the desktop context. | Use contextual toolbar (tools appear when relevant to current mode/selection) + keyboard shortcuts for power users. Maximum 6-8 icons visible at once. |
| **Photorealistic rendering mode** | Users associate "good 3D" with photorealism. | PROJECT.md explicitly states the goal is "structural unambiguity, not photorealism." Rendering pipelines are costly in WebGL and distract from energy authoring. Photorealism competes with clarity. | PBR materials with clear toon-adjacent outlines or edge highlighting. Focus on component legibility. The "clear technical visualization" aesthetic is already the correct target. |
| **Free-form mesh sculpting tools** | Blender users expect this. Some users will ask for it. | This is not a mesh editor. Free-form sculpting has no relationship to BIM LOD requirements or Korean building code geometry. Any free-form geometry is unrepresentable in IFC. | Keep geometry procedural and parametric. If a user needs custom geometry, the IFC/glTF upload path handles it. |
| **Real-time multi-user collaboration** | Vectary and Spline both offer this; it's trendy. | The GX team use case is single-user per building audit session. Real-time CRDT infrastructure is months of work for zero current-user benefit. Collaboration conflicts in building authoring are dangerous (concurrent wall edits). | Share-by-URL export to view-only mode. Comment/annotation layer (async). Defer real-time co-authoring to a future milestone. |
| **AI-generate building from prompt** | Trending in 2025-2026; users will expect it. | The building data already comes from the Korean government ledger with precise dimensions. AI generation would produce geometry inconsistent with the ground-truth data, undermining the energy analysis validity. | Use AI to assist with inference (auto-complete wall assembly from era + structure type), not to generate geometry. This is the right application of AI in this context. |

---

## Feature Dependencies

```
[Viewport-dominant layout]
    └──required by──> [All authoring tools] (tools need viewport space)
    └──required by──> [Dual-view sync] (both panes need independent viewport regions)

[Global selection state store]
    └──required by──> [Selection-driven context shift]
    └──required by──> [Persistent property panel] (panel reads selection)
    └──required by──> [Mode indicator]

[Guided authoring pipeline (stage gates)]
    └──required by──> [Export-readiness indicator] (stages map to export fields)
    └──enhances──>    [Status bar / prompt line] (stage context informs prompts)

[Property panel (selection-aware)]
    └──required by──> [Inline energy feedback]
    └──required by──> [Korean code auto-inference with override]
    └──required by──> [Contextual help tooltips]

[Calculation engine (live kWh)]
    └──required by──> [Inline energy feedback]
    └──depends on──>  [Material store with thermal properties] (ALREADY BUILT)

[Floor/room outliner]
    └──enhances──>    [Object hierarchy navigation]
    └──required by──> [One-click floor clone affordance]

[Component catalog UI]
    └──required by──> [Component placement from filtered catalog]
    └──depends on──>  [Existing component placement system] (ALREADY BUILT)

[Dual-view sync]
    └──depends on──>  [Shared wall/room state store]
    └──conflicts──>   [Independent 2D/3D rendering pipelines] (current architecture)

[Mode indicator]
    └──required by──> [Keyboard shortcuts] (shortcuts must target correct mode)
    └──conflicts──>   [Modal dialogs during authoring] (dialogs steal focus from mode context)
```

### Dependency Notes

- **Viewport-dominant layout is the first prerequisite:** All other features require the workspace to be rebuilt around the 3D view. This is Phase 1 work.
- **Global selection state is the second prerequisite:** Property panel, context shift, and mode indicator all read from one selection store. Build this before building any of the panels.
- **Guided pipeline stage gates require layout + selection to exist:** The stepper UI sits above the viewport and drives panel state; both depend on the layout work.
- **Inline energy feedback is the highest-complexity differentiator:** It requires property panel + calculation engine + material store integration. It should be Phase 3+ work.
- **Dual-view sync conflicts with current architecture:** The 2D plan and 3D viewer currently maintain separate state. Unifying them requires a shared geometry store — a medium-sized refactor but necessary for the "trusted dual-view" differentiator.

---

## MVP Definition

### Launch With (v3.0 core)

Minimum viable overhaul — enough to prove the guided workflow concept to GX team.

- [ ] **Viewport-dominant dashboard layout** — Without this, every other feature is buried. The current card layout actively harms usability.
- [ ] **Guided authoring stepper** (4 stages: Select Building → Configure Model → Set Energy Properties → Review/Export) — This is the core thesis of v3.0. Even a static stepper with manual "Next" buttons delivers the UX improvement.
- [ ] **Selection-aware property panel** — Click a wall, see its properties. Click a window, see glazing data. This is the single highest-value change from v2.0 to v3.0 for day-to-day use.
- [ ] **Mode indicator + status bar** — Zero engineering cost relative to UX payoff. A one-line bar prevents almost all "I don't know what to do next" confusion.
- [ ] **Floor/component outliner** — A simple tree list of floors and placed components. Replaces the current floor selector with a discoverable hierarchy.
- [ ] **Korean code auto-inference displayed as overridable suggestions** — The inference engine exists; surfacing it as visible suggestions (not silent defaults) costs little and builds user trust.

### Add After Validation (v3.x)

- [ ] **Export-readiness checklist** — Add after stepper is validated. Trigger: users complain about incomplete IFC exports.
- [ ] **Contextual help tooltips** — Add after property panel is stable. Trigger: GX team asks "what is this field?"
- [ ] **One-click floor clone affordance** — UX polish once outliner is shipped. Logic already exists.
- [ ] **Component catalog with filters** — Add after placement workflow is proven. Trigger: users need more than 3-4 component types regularly.

### Future Consideration (v3.x+)

- [ ] **Inline energy feedback (live kWh readout)** — Requires full calculation engine. Defer until energy model is validated against ECO2 output. High value but high risk of misleading users with incorrect numbers.
- [ ] **Dual-view live sync** — High value for expert users, but requires shared geometry store refactor. Defer after MVP is validated.
- [ ] **Keyboard shortcuts map** — Defer until power users emerge from GX team. Add based on observed repeat actions.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Viewport-dominant layout | HIGH | MEDIUM | P1 |
| Guided authoring stepper (4 stages) | HIGH | LOW | P1 |
| Selection-aware property panel | HIGH | MEDIUM | P1 |
| Mode indicator + status bar | HIGH | LOW | P1 |
| Floor/component outliner | HIGH | MEDIUM | P1 |
| Korean code inference as visible suggestions | HIGH | LOW | P1 |
| Export-readiness checklist | MEDIUM | LOW | P2 |
| Contextual help tooltips | MEDIUM | LOW | P2 |
| One-click floor clone affordance | MEDIUM | LOW | P2 |
| Component catalog with filters | MEDIUM | MEDIUM | P2 |
| Keyboard shortcuts | MEDIUM | LOW | P2 |
| Inline energy feedback (live kWh) | HIGH | HIGH | P3 |
| Dual-view live sync | HIGH | HIGH | P3 |

**Priority key:**
- P1: Required for v3.0 launch — core workflow overhaul thesis
- P2: Add when P1 features are validated
- P3: Future milestone — high value but high risk or cost

---

## Competitor Feature Analysis

| UX Pattern | Revit | ArchiCAD | Blender | Spline | Our Approach |
|------------|-------|----------|---------|--------|--------------|
| **Contextual toolbar** | Ribbon changes tabs on selection | Info Box shows selected element tools | Header bar updates per active tool | Top toolbar is static; property panel is contextual | Property panel shifts content on selection; floating mini-toolbar for spatial operations (move, rotate, delete) |
| **Mode switching** | Status bar + cursor change + ribbon tab highlight | Active tool highlighted in Toolbox, cursor changes | Mode enum (Object/Edit/Sculpt) in header with distinct color themes | Tool buttons toggle in top bar; cursor changes | Mode badge in status bar + Escape always exits; spring-loaded quasimodes for precision (hold Shift = snap to grid) |
| **Property panels** | Properties Palette: always docked left, updates on selection | Info Box: docked, shows selected element type | N-panel (N key): collapsible, tabbed; Properties editor: full editor | Right panel: tabbed (geometry, material, physics, events) | Right panel: always visible, tabbed by category (Geometry / Materials / Energy / Export), updates on selection |
| **Workflow sequencing** | Discipline tabs (Architecture, Structure, MEP) — task-based, not stage-based | Floor plan / section / elevation as navigation metaphor | Workspace presets (Layout, Modeling, Shading, Animation) | No enforced sequence — freestyle | Explicit 4-stage stepper with stage-specific tool surfacing |
| **Onboarding** | No in-app guidance; relies on training | No in-app guidance | Interactive tutorial overlays in recent versions | Welcome tour + template gallery | Stage-gate prompts in status bar + tooltip library on first use of each field |
| **Workspace customization** | Full ribbon customization, panel docking | Palette show/hide, panel reorder | Full Workspace tab creation, panel splitting | Limited: panel sizes adjustable | Panel collapse/expand; stepper can be dismissed for expert mode; panel width persistent in localStorage |

---

## Existing Features That Need UX Surfacing (Not New Builds)

These capabilities are already implemented in v2.0 but are effectively hidden. The UX overhaul should surface them, not rebuild them.

| Existing Feature | Where It Lives | UX Problem | Fix |
|-----------------|----------------|------------|-----|
| Room detection (DFS cycle detection) | `src/components/viewer/` | Users don't know it runs; rooms appear silently | Show "X rooms detected" in status bar when rooms are found |
| Structural analysis overlay | Viewer component | Hidden behind an undiscoverable toggle | Add to the "Review" stage of the guided stepper as a one-click activation |
| 10-layer building systems visualization | Layer store | Buried in settings; users don't find it | Add "Layers" tab to the right property panel |
| Snap system (grid/vertex/edge) | Plan view | Active but not announced | Status bar shows "Snap: vertex" when snap locks |
| Multi-floor support | Floor selector UI | Floor selector is a dropdown, easy to miss | Replace with floor outliner showing floor heights and component counts |
| Axis constraints | Drawing tools | Undiscoverable; no hint shown | Status bar hint when drawing: "Hold Shift to constrain to axis" |
| Alignment guides | Drawing tools | No visual indicator they're active | Show guides as a toggle in the mode toolbar |
| IFC/glTF upload | Model uploader | Entry point is unclear in the current layout | Add to the "Select Building" stage as an alternative path: "Upload existing model" |

---

## Sources

- Autodesk Revit 2026 User Interface docs: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-GetStarted/
- Autodesk Revit 2026 What's New (Layer App): https://layer.team/blog/what-s-new-in-revit-2026
- Graphisoft ArchiCAD Navigator Palette: https://help.graphisoft.com/AC/28/INT/_AC28_Help/030_Interaction/030_Interaction-3.htm
- Graphisoft ArchiCAD Interface overview: https://community.graphisoft.com/t5/Getting-started/The-Archicad-interface/ta-p/303976
- Blender Human Interface Guidelines: https://wiki.blender.org/wiki/Human_Interface_Guidelines/Layouts
- Blender Developer UI (2.80 release notes): https://developer.blender.org/docs/release_notes/2.80/ui/
- Spline UI documentation: https://docs.spline.design/doc/understanding-splines-ui/docHeqSlYK4L
- Spline UX review (Kaycie Chute, Bootcamp): https://medium.com/design-bootcamp/spline-reviewed-by-a-ux-designer-d32b8ac6a6e9
- ShapeDiver: what it is + workflow: https://help.shapediver.com/doc/what-is-shapediver
- ShapeDiver parametric configurator guide: https://www.shapediver.com/blog/a-step-by-step-guide-to-building-your-first-online-3d-product-configurator-with-shapediver
- Nielsen Norman Group — Modes in UX: https://www.nngroup.com/articles/modes/
- NN/G — 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- Progressive disclosure patterns (IxDF): https://ixdf.org/literature/topics/progressive-disclosure
- Unity Foundations — Contextual Tooling pattern: https://www.foundations.unity.com/patterns/contextual-tooling
- BlenderBIM UX discussion (OSArch): https://community.osarch.org/discussion/1173/blender-bim-ui-and-workflow
- BIM authoring command prediction research (ArXiv 2025): https://arxiv.org/html/2504.05319v1
- Revit Properties Palette (2023 docs): https://help.autodesk.com/cloudhelp/2023/ENU/Revit-GetStarted/files/GUID-A764EA7A-FE26-469B-857C-F3A70812FC34.htm
- BIM Pure — 11 Tips for Revit UI: https://www.bimpure.com/blog/11-tips-to-master-revit-user-interface
- SketchUp 4-step BIM workflow: https://sketchup.trimble.com/blog/en-US/article/simplify-your-next-project-with-a-4-step-bim-workflow

---
*Feature research for: Korean BIM Energy Management System — v3.0 UX Workflow Overhaul*
*Researched: 2026-03-30*
