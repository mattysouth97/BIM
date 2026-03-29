# Stack Research

**Domain:** BIM authoring workspace UX — guided pipelines, flexible layouts, contextual toolbars, node/flow configuration
**Researched:** 2026-03-30
**Confidence:** MEDIUM-HIGH (versions verified via npm/WebSearch; React 19 compatibility spot-checked)

---

## Context: What This Research Covers

The existing validated stack (Next.js 16, React 19, Three.js 0.183, R3F 9, shadcn/ui, Tailwind v4, Zustand v5, TanStack Query v5) is NOT re-researched here. This document covers only the NEW libraries required for v3.0 UX Workflow Overhaul.

The six capability gaps to fill:

1. **Panel/dock layouts** — resizable workspace, IDE-like split views
2. **Stepper/wizard flows** — guided authoring pipeline (select → assemble → customize → place)
3. **Keyboard shortcut management** — BIM tool-level discoverability
4. **Drag-and-drop** — panel rearrangement, component palette
5. **Node/flow-based configuration** — property graph panels, Grasshopper-style parameter wiring
6. **Tour/onboarding** — contextual feature introduction

---

## Recommended Stack: New Additions Only

### 1. Panel/Dock Layout

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `react-resizable-panels` | ^4.7.6 | Primary layout: 3D viewport + side panels | Zero deps, bvaughn-maintained, React 19 verified, shadcn/ui uses it for its own Resizable component — already consistent with the UI system. Simple API with `PanelGroup`, `Panel`, `PanelResizeHandle`. |
| `dockview` | ^5.1.0 | Optional advanced mode: full IDE dock/float | Only add if users need floating panels and drag-to-dock tabs (VS Code style). Zero deps, actively maintained (v5.1.0, March 2026). Peer dep: react >= 16.8, confirmed React 19 compatible. |

**Recommendation:** Start with `react-resizable-panels` for Phase 1 (fixed workspace layout). Reserve `dockview` for a later phase if user research confirms the need for detachable panels. Do not add both simultaneously.

### 2. Node/Flow-Based Configuration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@xyflow/react` | ^12.10.2 | Node graph editor for parameter wiring | Confirmed React 19 + Tailwind v4 support as of v12.9.0 (Oct 2025). Ships its own CSS — import `@xyflow/react/dist/style.css` in `globals.css` after the Tailwind import. Custom nodes are just React components so they take shadcn styling naturally. The `reactflow` package is the old name — use `@xyflow/react` (v12). |

**Integration note for Tailwind v4:** With Tailwind v4's CSS-only config, you MUST add this import order in `globals.css`:
```css
@import "tailwindcss";
@import "@xyflow/react/dist/style.css";
```

### 3. Stepper/Wizard Flows

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `stepperize` | latest (^2.x) | Type-safe step definitions, `useStepper` hook | Headless, zero deps, shadcn-native (officially listed as shadcn template). Provides `defineStepper()` + `useStepper()` — pure logic, visual rendering done with your own shadcn components. Avoids shipping another design system on top of the existing one. |

**What to NOT use:** `react-step-wizard`, `react-stepper-horizontal` — both unmaintained, React 16 era, bring their own CSS. `stepperize` treats step state as pure logic which aligns with how shadcn handles unstyled primitives.

### 4. Keyboard Shortcut Management

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `react-hotkeys-hook` | ^5.2.4 | Declarative keyboard shortcuts via React hook | v5.2.4 (Jan 2026), React hook API (`useHotkeys`), scope/filter aware, active maintenance. Works inside R3F canvas context via `enableOnFormTags` and `enableOnContentEditable` options. More ergonomic than `tinykeys` for React because no manual `useEffect` cleanup needed. |

**Integration note:** BIM tools need scoped shortcuts (e.g. Escape only active when canvas focused). `react-hotkeys-hook` supports this via the `scopes` option in `useHotkeys`. Register a global `HotkeysProvider` at the workspace root and use scope strings like `"canvas"`, `"panel"`.

**What to NOT use:** `tinykeys` is excellent but requires manual `useEffect` wiring — adds boilerplate in every component. `hotkeys-js` is not React-native. `react-hotkeys` (greena13) is unmaintained since 2021.

### 5. Drag-and-Drop

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@dnd-kit/core` | ^6.3.1 | Panel reordering, component palette drag | The established React DnD standard. Accessibility-first, no pointer-capture hacks, works with touch and mouse. Modular — `@dnd-kit/sortable` adds list sorting on top. No peer dependency on React version beyond hooks (React 16.8+). |
| `@dnd-kit/sortable` | ^8.0.0 | Sortable layer lists, step reordering | Builds on `@dnd-kit/core`, provides `SortableContext` and `useSortable`. |

**What to NOT use:** `react-beautiful-dnd` is archived (Atlassian discontinued it). `react-dnd` is maintained but uses legacy context API patterns and has complex backend setup. `@dnd-kit` is the current community standard with the cleaner API.

**New v2 package note:** There is `@dnd-kit/react` (v0.3.2) — a newer experimental API. Do NOT use it; it's unstable (0.3.x) and the API differs significantly from v1. Stick with `@dnd-kit/core` + `@dnd-kit/sortable`.

### 6. Tour/Onboarding

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `driver.js` | ^1.4.0 | Contextual feature spotlights, guided tours | Framework-agnostic, zero dependencies, ~5KB gzipped (smallest option). React 19 compatible because it manipulates the DOM directly — no React wrapper needed. Imperative API fits well with "trigger tour on first launch" from a Zustand `hasSeenTour` flag. v1.4.0 is the latest stable (Jan 2026). |

**What to NOT use:**
- `react-joyride` — not updated for React 19 (as of March 2026, confirmed incompatible)
- `react-shepherd` — React wrapper isn't React 19 compatible; shepherd.js core works but requires direct DOM usage
- `react-tourlight` — MIT, modern, but extremely new (v0.x), unproven in production

### 7. Floating/Contextual Toolbars

No new library needed. Use `@floating-ui/react` — it is already transitively installed via Radix UI (which is already in the stack as `radix-ui ^1.4.3`). Radix primitives use floating-ui internally. Expose it explicitly in devDependencies only if you need direct positioning control for custom floating toolbars.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@floating-ui/react` | ^0.27.19 | Contextual toolbar positioning | Already available transitively. Direct use needed only for custom non-Radix floating elements (e.g., 3D canvas-anchored toolbars, selection-triggered panels). |

### 8. Animation (Step Transitions, Panel Reveals)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `motion` | ^12.38.0 | Step transition animations, panel enter/exit | `framer-motion` was renamed to `motion` in 2025. Import from `motion/react`. Full React 19 concurrent rendering support confirmed. React Compiler can auto-memoize. Already proven in the shadcn ecosystem. |

**Install note:** Uninstall `framer-motion` if present, install `motion`. Import path changes to `motion/react`.

**Only add if:** You need more than CSS transitions for guided pipeline step changes and panel entrance animations. If the UX can be achieved with Tailwind `transition-*` utilities and CSS `@keyframes`, skip this dependency.

---

## Installation

```bash
# Core layout + DnD + node graph
pnpm add react-resizable-panels @xyflow/react @dnd-kit/core @dnd-kit/sortable

# Stepper + keyboard shortcuts + tour
pnpm add stepperize react-hotkeys-hook driver.js

# Optional: full IDE docking (defer until Phase 3+)
# pnpm add dockview

# Optional: animation (only if CSS transitions insufficient)
# pnpm add motion
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `react-resizable-panels` | `dockview` | Dockview is heavier; start simple and upgrade only if users need floating/detachable panels |
| `react-resizable-panels` | `FlexLayout` | FlexLayout has broader dock features but complex API; overkill for fixed 3-panel workspace |
| `@xyflow/react` | Custom canvas-based graph | Building a node graph from scratch in Three.js/R3F is months of work; `@xyflow/react` is production-proven |
| `react-hotkeys-hook` | `tinykeys` | `tinykeys` is excellent but not React-native; `react-hotkeys-hook` integrates cleaner with component lifecycle |
| `@dnd-kit/core` | `react-beautiful-dnd` | Atlassian archived `react-beautiful-dnd` in 2022; no longer maintained |
| `driver.js` | `react-joyride` | `react-joyride` is not React 19 compatible as of March 2026 |
| `stepperize` | Custom step state in Zustand | Zustand + manual step tracking works but gives up type-safe step definitions and navigation guards |
| `motion` | CSS transitions only | Prefer CSS transitions first; only add `motion` if animated pipeline transitions are a UX requirement |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-beautiful-dnd` | Archived by Atlassian, no longer maintained | `@dnd-kit/core` |
| `react-joyride` | Incompatible with React 19 as of March 2026 | `driver.js` |
| `react-hotkeys` (greena13) | Unmaintained since 2021 | `react-hotkeys-hook` |
| `reactflow` (old npm package) | Deprecated in favor of `@xyflow/react` | `@xyflow/react` |
| `@dnd-kit/react` (v0.3.x) | Experimental rewrite, unstable API | `@dnd-kit/core` v6 |
| `intro.js` | Commercial license required for commercial use | `driver.js` (MIT) |
| `shepherd.js` React wrapper | React wrapper not React 19 compatible | `driver.js` directly |
| MUI / Ant Design | Heavy design system conflict with existing shadcn/ui | Already have shadcn/ui — extend that |
| `framer-motion` | Renamed to `motion`; old package name deprecated | `motion` |

---

## Version Compatibility

| New Package | Compatible With | Notes |
|-------------|-----------------|-------|
| `@xyflow/react ^12.10.2` | React 19.2, Tailwind v4 | Confirmed in React Flow changelog Oct 2025. Requires CSS import in globals.css. |
| `react-resizable-panels ^4.7.6` | React 19 | Maintained by bvaughn (React core team), no peer dep issues |
| `@dnd-kit/core ^6.3.1` | React 19 | Peer dep: react >=16.8; no known React 19 conflicts |
| `react-hotkeys-hook ^5.2.4` | React 19 | v5 series (Jan 2026); peer dep review recommended on install |
| `driver.js ^1.4.0` | Framework-agnostic | No React peer dep; zero-dependency DOM library |
| `stepperize` | React 19, shadcn/ui | Headless; renders with your components |
| `dockview ^5.1.0` | React >=16.8 | Covers React 19; zero deps |
| `motion ^12.38.0` | React 19 + Compiler | Full concurrent mode support confirmed |

---

## Integration Patterns

**Pattern: @xyflow/react with Zustand**
Node state (positions, edges, custom properties) should live in Zustand, not React Flow's internal state. Use `useNodesState`/`useEdgesState` only as local ephemeral state during drag; commit to the Zustand store on `onNodesChange` with `immer` middleware for immutable updates on nested node data.

**Pattern: react-resizable-panels with R3F canvas**
The R3F `<Canvas>` must be inside a `<Panel>` that has an explicit pixel or percentage size. Use `onResize` callback from `Panel` to call `camera.aspect = width/height` and `renderer.setSize(width, height)` — otherwise the Three.js viewport does not respond to panel resize.

**Pattern: react-hotkeys-hook scope isolation**
Wrap the 3D viewport in `<HotkeysProvider initiallyActiveScopes={["canvas"]}>` and the side panel in its own scope. Use `useHotkeys("escape", handler, { scopes: "canvas" })` so Escape closes 3D selections without interfering with dialog dismiss events from Radix.

**Pattern: driver.js + Zustand onboarding flag**
Store `{ hasSeenWelcomeTour: boolean }` in the Zustand persist store. On workspace mount, read this flag via `useHydration()` (already in codebase) before triggering the Driver.js tour to avoid SSR hydration mismatch.

---

## Stack Patterns by Variant

**If workspace layout is fixed (3 panels, non-rearrangeable):**
- Use `react-resizable-panels` only
- No drag-and-drop needed for layout
- `@dnd-kit` only needed for component palette / layer list reordering

**If workspace layout is fully user-customizable (drag-to-dock):**
- Use `dockview` instead of `react-resizable-panels`
- `dockview` handles drag-dock internally; `@dnd-kit` still needed for intra-panel list sorting

**If node graph is property inspection only (read-only display):**
- Skip `@xyflow/react`; render property dependencies as a static tree with shadcn `Accordion`
- Only add `@xyflow/react` if users can wire parameters (Grasshopper-style)

**If guided pipeline is linear and non-skippable:**
- `stepperize` alone is sufficient
- No need for wizard routing libraries

---

## Sources

- `@xyflow/react` React 19 + Tailwind v4 support: [reactflow.dev/whats-new/2025-10-28](https://reactflow.dev/whats-new/2025-10-28) — HIGH confidence
- `react-resizable-panels` v4.7.6: [npmjs.com/package/react-resizable-panels](https://www.npmjs.com/package/react-resizable-panels) — HIGH confidence
- `dockview` v5.1.0 React >=16.8 peer dep: [npmjs.com/package/dockview](https://www.npmjs.com/dockview) — HIGH confidence
- `driver.js` v1.4.0 framework-agnostic: [driverjs.com/docs/installation](https://driverjs.com/docs/installation) — HIGH confidence
- `react-joyride` React 19 incompatibility: [github.com/gilbarbara/react-joyride/issues/1151](https://github.com/gilbarbara/react-joyride/issues/1151) — MEDIUM confidence (issue thread, not official statement)
- `react-hotkeys-hook` v5.2.4: [npmjs.com/package/react-hotkeys-hook](https://www.npmjs.com/package/react-hotkeys-hook) — HIGH confidence
- `@dnd-kit/core` v6.3.1 standard status: [dndkit.com](https://dndkit.com/) — HIGH confidence
- `motion` v12.38.0 (ex framer-motion) React 19: [motion.dev/docs/react](https://motion.dev/docs/react) — HIGH confidence
- `stepperize` shadcn integration: [stepperize.vercel.app](https://stepperize.vercel.app/) + [shadcn.io/template/damianricobelli-stepperize](https://www.shadcn.io/template/damianricobelli-stepperize) — MEDIUM confidence
- `@floating-ui/react` v0.27.19 transitive via Radix: [npmjs.com/package/@floating-ui/react](https://www.npmjs.com/package/@floating-ui/react) — HIGH confidence

---
*Stack research for: Korean BIM EMS v3.0 — UX Workflow Overhaul (new capabilities only)*
*Researched: 2026-03-30*
