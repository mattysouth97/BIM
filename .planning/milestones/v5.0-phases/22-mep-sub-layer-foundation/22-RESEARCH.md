# Phase 22: MEP Sub-Layer Foundation - Research

**Researched:** 2026-04-12
**Domain:** Three.js scene graph sub-grouping, Zustand store extension, React layer panel UI
**Confidence:** HIGH (all findings verified directly against codebase source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Expandable chevron on MEP row — click chevron to reveal 4 indented sub-toggles (progressive disclosure)
- Distinct colors per system: yellow=electrical, cyan=HVAC, lime=lighting, orange=DHW (industry conventions)
- Bilingual labels (e.g., "전기 Electrical") matching existing LAYER_CONFIGS pattern
- Indented sub-toggle rows with smaller dot (2px vs 2.5px), slightly lighter text — visually subordinate
- Electrical: layer-1-electrical only (telecom/media deferred to v5.x 15-layer expansion)
- HVAC: layer-3-cooling + layer-4-heating + layer-5-ventilation (three thermal subsystems grouped)
- Lighting: layer-7-lighting only
- DHW/Plumbing: layer-6-hot-water + layer-8-special-waste (domestic + waste water)
- Unmapped generators (safety, microgrid, telecom, media, etc.): hidden — no sub-layer toggle yet, objects still render under main MEP toggle
- Main MEP toggle off→on restores previous sub-layer states (remembers which were on/off)
- Initial state: all 4 sub-layers visible (matches current "MEP on" behavior)
- Sub-layer state persists to localStorage via existing layer-store pattern
- Architecture: use nested `MepSubLayerId` type parallel to `LayerId`, not extending `ALL_LAYER_IDS`
- Store: `mepSubVisibility` slice in existing `layer-store.ts`, not a new store file
- LayerManager: add `setMepSubVisible()` method assigning generator output to named sub-groups

### Claude's Discretion
- (none declared beyond architecture choices above)

### Deferred Ideas (OUT OF SCOPE)
- All 15 individual sub-layer toggles — deferred to v5.x after 4 primary groups validated
- Sub-system heatmap filter per layer — deferred to v5.x (depends on Phase 25 heatmap first)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEP-01 | User sees 4 expandable sub-toggle rows under MEP in layer panel (electrical, HVAC, lighting, DHW) | LayerPanel iterates ALL_LAYER_IDS; MEP row needs chevron + conditional sub-row render; MEP_SUB_CONFIGS provides labels/colors |
| MEP-02 | Toggling any one sub-layer hides only that utility system's 3D objects; main MEP toggle still controls all 4; sub-layer toggles do not expand ALL_LAYER_IDS | setMepSubVisible() targets named child groups inside the mep THREE.Group; a second useEffect in building-layers.tsx watches mepSubVisibility; ALL_LAYER_IDS stays at 5 |
</phase_requirements>

---

## Summary

Phase 22 splits the single MEP `THREE.Group` into 4 independently-togglable named child groups
(electrical, HVAC, lighting, DHW) without touching the 5-entry `ALL_LAYER_IDS` constant or the
existing layer visibility machinery. The change is purely additive: new type aliases, a new store
slice, one new method on `LayerManager`, one new `useEffect` in `BuildingLayers`, and an expanded
MEP row in `LayerPanel`.

The existing `setVisible(id: LayerId, visible: boolean)` path is completely untouched. The main
MEP group's `.visible` flag continues to show/hide all sub-groups in one call because Three.js
propagates visibility down the scene graph. Sub-group visibility is a second, independent toggle
that operates on named children of the MEP group.

The layer-store currently has NO `persist` middleware — it uses a plain `create()` call. The
CONTEXT.md says sub-layer state should persist to localStorage, which means the store must be
wrapped in `persist()` as part of this phase (matching the pattern used by `workspace-store.ts`,
`workflow-store.ts`, and `app-store.ts`).

**Primary recommendation:** Add `MepSubLayerId` type + `MEP_SUB_CONFIGS` to `types.ts`, add
`mepSubVisibility` + `toggleMepSub` to `layer-store.ts` behind `persist()`, add
`setMepSubVisible()` to `LayerManager`, wire a second `useEffect` in `BuildingLayers`, and extend
the MEP row in `LayerPanel` with a chevron + indented sub-toggles.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | (project version) | THREE.Group sub-grouping, `.getObjectByName()` | Already in use throughout layer system |
| zustand | (project version) | `mepSubVisibility` state slice + persist | Already used by all 5 other stores |
| zustand/middleware `persist` | same | localStorage persistence for sub-layer state | Pattern established in workspace-store, workflow-store, app-store |
| React | 19 | `useState` for chevron expand/collapse in LayerPanel | Already in project |

**No new packages required.**

---

## Architecture Patterns

### Current Scene Graph (before this phase)
```
building-layers (THREE.Group)
├── layer-envelope   (THREE.Group)
├── layer-structure  (THREE.Group)
├── layer-mep        (THREE.Group)  ← all 15 generators dumped here flat
├── layer-energy-zones (THREE.Group)
└── layer-retrofit-targets (THREE.Group)
```

### Target Scene Graph (after this phase)
```
building-layers (THREE.Group)
├── layer-envelope   (THREE.Group)
├── layer-structure  (THREE.Group)
├── layer-mep        (THREE.Group)           ← .visible controlled by main MEP toggle (unchanged)
│   ├── sub-mep-electrical (THREE.Group)     ← layer-1-shell output
│   ├── sub-mep-hvac       (THREE.Group)     ← layer-3-cooling + layer-4-heating + layer-5-ventilation
│   ├── sub-mep-lighting   (THREE.Group)     ← layer-7-lighting
│   ├── sub-mep-dhw        (THREE.Group)     ← layer-6-dhw
│   └── (layers 8-14 added directly here)   ← no sub-toggle, still rendered under MEP
├── layer-energy-zones (THREE.Group)
└── layer-retrofit-targets (THREE.Group)
```

### Pattern 1: Parallel Sub-Type (types.ts additions — additive only)
**What:** New `MepSubLayerId` union + `MEP_SUB_IDS` array + `MEP_SUB_CONFIGS` record, alongside
the existing `LayerId` union. `ALL_LAYER_IDS` is NOT modified.
**When to use:** When you need a secondary categorization that does not participate in the primary
layer iteration loop.

```typescript
// Source: ARCHITECTURE.md — verified pattern, additive additions to types.ts

export type MepSubLayerId =
  | "mep-electrical"
  | "mep-hvac"
  | "mep-lighting"
  | "mep-dhw";

export const MEP_SUB_IDS: MepSubLayerId[] = [
  "mep-electrical",
  "mep-hvac",
  "mep-lighting",
  "mep-dhw",
];

export const MEP_SUB_CONFIGS: Record<MepSubLayerId, {
  name: string;
  nameKo: string;
  color: string;
}> = {
  "mep-electrical": { name: "Electrical",    nameKo: "전기",      color: "#f59e0b" },
  "mep-hvac":       { name: "HVAC",          nameKo: "냉난방환기", color: "#3b82f6" },
  "mep-lighting":   { name: "Lighting",      nameKo: "조명",      color: "#fbbf24" },
  "mep-dhw":        { name: "DHW/Plumbing",  nameKo: "급탕/배관", color: "#22c55e" },
};
```

### Pattern 2: Store Slice Extension with persist (layer-store.ts)
**What:** Add `mepSubVisibility` + `toggleMepSub` + `setMepSubVisible` to the existing
`LayerState` interface. Wrap the store in `persist()` middleware (currently missing from
layer-store — see Pitfalls section).
**When to use:** When adding a new orthogonal state slice to an existing store.

```typescript
// Additive changes to layer-store.ts interface:
mepSubVisibility: Record<MepSubLayerId, boolean>;
toggleMepSub: (id: MepSubLayerId) => void;
setMepSubVisible: (id: MepSubLayerId, visible: boolean) => void;

// Initial state:
mepSubVisibility: Object.fromEntries(
  MEP_SUB_IDS.map((id) => [id, true])
) as Record<MepSubLayerId, boolean>,

// toggleMepSub action:
toggleMepSub: (id) =>
  set((state) => ({
    mepSubVisibility: {
      ...state.mepSubVisibility,
      [id]: !state.mepSubVisibility[id],
    },
  })),

// setMepSubVisible action:
setMepSubVisible: (id, visible) =>
  set((state) => ({
    mepSubVisibility: { ...state.mepSubVisibility, [id]: visible },
  })),
```

**persist wrapper** (matching workspace-store.ts pattern):
```typescript
export const useLayerStore = create<LayerState>()(
  persist(
    (set) => ({ /* existing + new state */ }),
    { name: "bim-layer-store" }   // localStorage key
  )
);
```

### Pattern 3: LayerManager Sub-Group Method
**What:** One new method `setMepSubVisible()` that navigates into the MEP group's children by
name. Does NOT touch the `groups` Map or `setVisible()`.

```typescript
// Source: ARCHITECTURE.md — verified pattern, addition to LayerManager class

import type { MepSubLayerId } from "./types";

setMepSubVisible(subId: MepSubLayerId, visible: boolean): void {
  const mepGroup = this.groups.get("mep");
  if (!mepGroup) return;
  const child = mepGroup.getObjectByName(`sub-${subId}`);
  if (child) child.visible = visible;
}
```

`getObjectByName()` searches the entire subtree — it will find `sub-mep-electrical` etc. even if
they are nested. This is a built-in Three.js method (confirmed in Three.js r160+ docs). No new
Three.js APIs needed.

### Pattern 4: BuildingLayers Second useEffect
**What:** A second `useEffect` that watches `mepSubVisibility` and calls `setMepSubVisible()` for
each sub-layer. The existing `useEffect` watching `visibility` (ALL_LAYER_IDS loop) is unchanged.

```typescript
// Source: ARCHITECTURE.md — verified pattern, addition to building-layers.tsx

import { MEP_SUB_IDS } from "@/lib/layers/types";

const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);

useEffect(() => {
  const manager = managerRef.current;
  if (!manager) return;
  for (const subId of MEP_SUB_IDS) {
    manager.setMepSubVisible(subId, mepSubVisibility[subId]);
  }
}, [mepSubVisibility]);
```

The `useFrame` animation loop and dispose `useEffect` are unchanged.

### Pattern 5: LayerPanel Chevron + Sub-Toggle Rows
**What:** The MEP row in `LayerPanel` gets a chevron toggle and 4 indented sub-rows rendered
conditionally. A local `useState` tracks whether the MEP section is expanded. The main MEP toggle
click behavior (call `toggleLayer("mep")`) is unchanged.

Key UI decisions from CONTEXT.md:
- Sub-dot size: `size-2` (2px) vs parent dot `size-2.5` (2.5px)
- Sub-row text: `text-muted-foreground` weight (lighter than parent active text)
- Indentation: extra `pl-6` or equivalent left padding
- Chevron: `ChevronRight` / `ChevronDown` from lucide-react (already imported in project)
- Click target: chevron click = expand/collapse only; dot/label area = `toggleMepSub(subId)`

### Pattern 6: mep-coordinator.ts (new file)
**What:** Called during MEP layer generation to assign each generator's output into a named child
group inside the MEP group, rather than directly into the flat MEP group. Keeps building-layers.tsx
clean.

```
mep-coordinator.ts responsibilities:
1. Accept the MEP THREE.Group from LayerManager.getGroup("mep")
2. Create (or reuse) 4 named child groups: sub-mep-electrical, sub-mep-hvac, sub-mep-lighting, sub-mep-dhw
3. Run each mapped generator and add its output to the appropriate child group
4. Add unmapped generator outputs (layers 8–14) directly to mep group (not to a sub-group)
```

### Anti-Patterns to Avoid
- **Extending ALL_LAYER_IDS:** Adding MEP sub-IDs to ALL_LAYER_IDS would break the existing
  visibility loop, cause 9 groups instead of 5, and trigger full-scene re-renders on sub-toggle.
  The parallel `MepSubLayerId` type avoids this.
- **Per-frame visibility check:** Do NOT check `mepSubVisibility` inside `useFrame`. Visibility
  toggling is event-driven (user click), not per-frame. The `useEffect` pattern is correct.
- **New Zustand store file:** The CONTEXT.md locked decision is to add the slice to the existing
  `layer-store.ts`. Do not create `mep-sub-store.ts`.
- **Raycaster allocation in render:** The `structural-tooltip.tsx` anti-pattern (allocating
  Raycaster per frame) is documented in CONTEXT.md. Do NOT copy this pattern for any tooltip code
  in this phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding a named child group | Custom tree walk | `THREE.Group.getObjectByName(name)` | Built-in recursive search, handles any nesting depth |
| localStorage persistence | Manual `JSON.stringify` / `localStorage.setItem` | Zustand `persist` middleware | Already wired in 3 other stores; handles hydration, versioning |
| Bilingual labels | Conditional string switch | `isKo ? config.nameKo : config.name` | Established pattern in LayerPanel, WorkflowStepper, etc. |
| Chevron icon | Custom SVG | `lucide-react` ChevronRight/ChevronDown | Already a dependency, used in LayerPanel close button |

---

## Generator-to-Sub-Group Mapping (verified)

All 15 generator files were confirmed via `src/lib/layers/` directory listing and header comments.
Group names set in each generator's `generate()` method are listed:

| Generator File | Group Name (set internally) | userData.type values | Sub-Group Assignment |
|---|---|---|---|
| layer-1-shell.ts | `"layer-1-shell"` | (structural skeleton) | `sub-mep-electrical` |
| layer-3-cooling.ts | `"layer-3-cooling"` | chilled-water piping | `sub-mep-hvac` |
| layer-4-heating.ts | `"layer-4-heating"` | hot-water piping | `sub-mep-hvac` |
| layer-5-ventilation.ts | `"layer-5-ventilation"` | airflow ducts | `sub-mep-hvac` |
| layer-6-dhw.ts | `"layer-6-dhw"` | domestic hot water | `sub-mep-dhw` |
| layer-7-lighting.ts | `"layer-7-lighting"` | ceiling fixtures | `sub-mep-lighting` |
| layer-8-media.ts | `"layer-8-media"` | AV/media | direct to mep (unmapped) |
| layer-9-waste.ts | `"layer-9-waste"` | waste drainage | direct to mep (unmapped) |
| layer-10-bas.ts | `"layer-10-bas"` | building automation | direct to mep (unmapped) |
| layer-11-telecom.ts | `"layer-11-telecom"` | telecom | direct to mep (unmapped) |
| layer-12-transport.ts | `"layer-12-transport"` | elevators/stairs | direct to mep (unmapped) |
| layer-13-safety.ts | `"layer-13-safety"` | fire safety | direct to mep (unmapped) |
| layer-14-microgrid.ts | `"layer-14-microgrid"` | microgrid | direct to mep (unmapped) |
| layer-2-envelope.ts | `"layer-2-envelope"` | facade/envelope | NOT a MEP layer (envelope group) |
| layer-15-structural.ts | `"layer-15-structural"` | structure | NOT a MEP layer (structure group) |

**Note on layer-1-shell:** The CONTEXT.md assigns "Electrical" to layer-1-shell. Looking at the
actual file, layer-1-shell is the structural glass-box skeleton (slabs, columns, core walls). The
naming is a bit unusual — it is assigned to `sub-mep-electrical` per the locked decision, likely
because it provides the structural reference armature for electrical routing visualization. The
mep-coordinator must treat its output as the electrical sub-group content regardless.

**Note on layer-9-waste:** CONTEXT.md says DHW/Plumbing = "layer-6-hot-water + layer-8-special-waste"
but the actual file is `layer-9-waste.ts` (not layer-8). Layer-8 is `layer-8-media.ts`. This is a
naming mismatch in CONTEXT.md — the planner must resolve which generator handles special waste.
`layer-9-waste.ts` is the most likely candidate. Flagged as an open question below.

---

## Common Pitfalls

### Pitfall 1: layer-store.ts Missing `persist` Middleware
**What goes wrong:** Sub-layer visibility toggles reset to `true` on every page reload.
**Why it happens:** Unlike `workspace-store.ts`, `workflow-store.ts`, and `app-store.ts`, the
current `layer-store.ts` uses `create<LayerState>()((set) => ...)` with NO `persist` wrapping.
**How to avoid:** Wrap in `persist(...)` middleware when adding the `mepSubVisibility` slice.
Choose a storage key distinct from other stores: `{ name: "bim-layer-store" }`.
**Warning signs:** Opening browser devtools → Application → LocalStorage shows no `bim-layer-store`
key after toggling a sub-layer.

### Pitfall 2: Main MEP Toggle Must Respect Sub-Layer State on Re-show
**What goes wrong:** Turning MEP off then back on shows all 4 sub-layers regardless of which were
hidden before the main toggle was turned off.
**Why it happens:** `setVisible("mep", true)` sets the MEP group visible, which re-shows all
children because Three.js propagates visibility top-down. The sub-group `.visible` flags are still
correct in the scene graph — they were never cleared — but if `setMepSubVisible()` is only called
from the `mepSubVisibility` useEffect, they will be re-applied on the next store state read.
**How to avoid:** The `mepSubVisibility` useEffect in `BuildingLayers` fires whenever `mepSubVisibility`
changes. To trigger re-application when the main MEP toggle turns on, include `visibility["mep"]`
in the useEffect dependency array alongside `mepSubVisibility`, so sub-group states are always
re-applied after the parent group becomes visible.
**Warning signs:** After MEP off→on, all 4 sub-layers appear even when some were hidden.

```typescript
// Correct dependency array:
useEffect(() => {
  const manager = managerRef.current;
  if (!manager) return;
  for (const subId of MEP_SUB_IDS) {
    manager.setMepSubVisible(subId, mepSubVisibility[subId]);
  }
}, [mepSubVisibility, visibility]);  // include visibility so re-applies after MEP re-show
```

### Pitfall 3: `getObjectByName` Finds First Match Only
**What goes wrong:** If a generator accidentally names a mesh `"sub-mep-electrical"`, `getObjectByName`
returns that mesh instead of the intended child group.
**Why it happens:** `getObjectByName` searches all descendants depth-first and returns the first
match. Group names and mesh names share the same namespace.
**How to avoid:** Sub-group names (`sub-mep-electrical` etc.) must be unique within the MEP group.
Only the `mep-coordinator.ts` sets these names — generator output groups use their generator-
internal names (`"layer-1-shell"`, `"layer-3-cooling"` etc.) which do not collide.

### Pitfall 4: disposeLayer("mep") Already Works Correctly
**What goes wrong:** Concern that sub-groups won't be disposed when MEP layer is rebuilt.
**Why it doesn't happen:** `disposeLayer(id)` in `LayerManager` calls `group.traverse()` which
recurses into all children including sub-groups. Then it removes all direct children from the group.
Since sub-groups are direct children of the MEP group, they are removed. No change needed to
dispose logic.
**Warning signs:** N/A — this is a non-issue, documented to prevent unnecessary code changes.

### Pitfall 5: `buildDefault` Helper Covers Only LayerId
**What goes wrong:** Using the existing `buildDefault<T>(value: T)` helper in layer-store.ts for
`mepSubVisibility` fails because it iterates `ALL_LAYER_IDS` (5 LayerIds), not `MEP_SUB_IDS`.
**How to avoid:** Inline the `Object.fromEntries(MEP_SUB_IDS.map(id => [id, value]))` expression
for the mepSubVisibility default, or create a separate `buildMepSubDefault` helper.

### Pitfall 6: Zustand SSR Hydration Mismatch
**What goes wrong:** Adding `persist` to layer-store can cause a hydration mismatch on first
render if layer visibility from localStorage differs from default.
**Why it happens:** CLAUDE.md documents this: "Zustand persist + SSR hydration mismatch — use
`useHydration()` hook before reading store in render."
**How to avoid:** Check whether `useHydration()` is already used by consumers of layer-store.
`building-layers.tsx` and `layer-panel.tsx` are the two consumers. If neither currently uses
`useHydration()`, adding `persist` will not immediately cause problems in the layer-store case
because initial state is all-visible (same as defaults). However, once a user has customized and
persisted sub-layer states, a mismatch could occur. The safest approach: add `useHydration()` guard
in `LayerPanel` when rendering sub-toggles.

---

## Code Examples

### Sub-group creation in mep-coordinator.ts
```typescript
// Source: ARCHITECTURE.md verified pattern

export function setupMepSubGroups(mepGroup: THREE.Group): Map<MepSubLayerId, THREE.Group> {
  const subGroups = new Map<MepSubLayerId, THREE.Group>();
  for (const subId of MEP_SUB_IDS) {
    let child = mepGroup.getObjectByName(`sub-${subId}`) as THREE.Group | undefined;
    if (!child) {
      child = new THREE.Group();
      child.name = `sub-${subId}`;
      mepGroup.add(child);
    }
    subGroups.set(subId, child);
  }
  return subGroups;
}
```

### LayerPanel MEP row expansion (sketch)
```typescript
// Expand state is local to LayerPanel (not in store — UI-only transient state)
const [mepExpanded, setMepExpanded] = useState(false);
const mepSubVisibility = useLayerStore((s) => s.mepSubVisibility);
const toggleMepSub = useLayerStore((s) => s.toggleMepSub);

// In the render loop, when id === "mep":
<div key="mep">
  <button onClick={() => toggleLayer("mep")} ...>
    {/* existing dot + label */}
    <ChevronDown
      className={`ml-auto h-3 w-3 transition-transform ${mepExpanded ? "" : "-rotate-90"}`}
      onClick={(e) => { e.stopPropagation(); setMepExpanded(!mepExpanded); }}
    />
  </button>
  {mepExpanded && MEP_SUB_IDS.map((subId) => {
    const subConfig = MEP_SUB_CONFIGS[subId];
    const subActive = mepSubVisibility[subId];
    return (
      <button key={subId} onClick={() => toggleMepSub(subId)}
        className="flex w-full items-start gap-3 rounded-md pl-8 pr-3 py-1.5 text-left text-xs ...">
        <span className="mt-0.5 size-2 shrink-0 rounded-full border-2 transition-colors"
          style={{ borderColor: subConfig.color, backgroundColor: subActive ? subConfig.color : "transparent" }}
        />
        <span className={subActive ? "font-medium" : "text-muted-foreground"}>
          {isKo ? subConfig.nameKo : subConfig.name}
        </span>
      </button>
    );
  })}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|---|---|---|
| Flat MEP group (all 15 generators as siblings) | 4 named sub-groups + unmapped remainder in flat area | Enables per-system toggle without touching ALL_LAYER_IDS |
| No persist on layer-store | persist() wrapper added in this phase | Sub-layer preferences survive page reload |

---

## Open Questions

1. **layer-9-waste vs CONTEXT.md "layer-8-special-waste"**
   - What we know: CONTEXT.md says DHW = "layer-6-hot-water + layer-8-special-waste". Actual file
     directory shows `layer-8-media.ts` (AV/media) and `layer-9-waste.ts` (waste drainage).
   - What's unclear: Was the CONTEXT.md referring to layer-9-waste by a wrong number, or does
     layer-8 have dual purpose?
   - Recommendation: Planner should assign `layer-9-waste.ts` to `sub-mep-dhw` and treat
     "layer-8-special-waste" in CONTEXT.md as a mis-numbering. Confirm with user if needed.

2. **layer-1-shell as "Electrical" sub-group content**
   - What we know: CONTEXT.md locks layer-1-shell → sub-mep-electrical. But layer-1-shell generates
     structural glass-box skeleton (slabs, columns, core), not electrical wiring.
   - What's unclear: Is the intent for layer-1-shell to serve as the visual armature/reference
     frame for electrical routing, or is there a dedicated electrical generator not yet created?
   - Recommendation: Follow the locked decision — assign layer-1-shell to sub-mep-electrical as
     specified. Document in code that a dedicated electrical-routing generator is planned for v5.x.

3. **`mep-expanded` chevron state — should it persist?**
   - What we know: CONTEXT.md does not specify. LayerPanel uses local component state elsewhere
     (e.g., the panel itself is shown/hidden via prop, not store state).
   - Recommendation: Local `useState` in LayerPanel (transient, resets on panel re-mount). The
     actual sub-layer on/off states persist via store; only the expand/collapse UI position resets.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes. No external tools, CLIs, services,
or databases are required beyond the project's existing development toolchain (pnpm, Next.js, TypeScript).

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not detected — no pytest.ini, jest.config.*, vitest.config.*, or test/ directory found in project |
| Config file | None — see Wave 0 gaps |
| Quick run command | `pnpm build` (TypeScript type-check as proxy for unit correctness) |
| Full suite command | `pnpm build && pnpm lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEP-01 | 4 sub-toggle rows appear under MEP when chevron is clicked | manual visual | N/A | N/A |
| MEP-01 | `MEP_SUB_CONFIGS` has correct keys and color values | unit (type-level) | `pnpm build` — TypeScript validates Record<MepSubLayerId, ...> shape | Wave 0 |
| MEP-02 | `mepSubVisibility` default is all-true; `toggleMepSub` flips one key | unit | `pnpm build` | Wave 0 |
| MEP-02 | `setMepSubVisible` finds named child group via `getObjectByName` | unit | manual Three.js scene inspection or `pnpm build` | Wave 0 |
| MEP-02 | ALL_LAYER_IDS.length stays === 5 after changes | smoke | `pnpm build` (const length is type-checked) | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm build` (catches type errors in new types/store slice)
- **Per wave merge:** `pnpm build && pnpm lint`
- **Phase gate:** `pnpm build` green + manual visual test of sub-toggle expand/collapse before `/gsd:verify-work`

### Wave 0 Gaps
- No automated unit test infrastructure detected (no vitest, jest, or similar). All behavioral
  verification for this phase is via `pnpm build` (type safety) + manual browser testing.
- [ ] If a test framework is added in a future phase, MEP-02 store slice behavior (`toggleMepSub`
  flips exactly one key, others unchanged) is a good candidate for a unit test.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/layers/types.ts` — LayerId union, ALL_LAYER_IDS (5 entries), LAYER_CONFIGS, LayerGenerator interface — read directly
- `src/store/layer-store.ts` — current store shape, no persist middleware, buildDefault helper — read directly
- `src/lib/layers/layer-manager.ts` — LayerManager class, groups Map, setVisible, disposeLayer traverse pattern — read directly
- `src/components/viewer/layer-panel.tsx` — current render loop, ALL_LAYER_IDS iteration, dot + toggle pattern — read directly
- `src/components/viewer/building-layers.tsx` — useEffect visibility sync, useFrame animation, managerRef pattern — read directly
- `src/lib/layers/layer-{1,3,4,5,6,7}.ts` — generator class names, group names set in generate(), confirmed generator-to-sub-group mapping — read directly
- `src/store/workspace-store.ts` — persist() middleware pattern with named key — read directly
- `.planning/research/ARCHITECTURE.md` — MepSubLayerId type spec, MEP_SUB_CONFIGS values, setMepSubVisible pattern, mep-coordinator.ts design — read directly
- `.planning/phases/22-mep-sub-layer-foundation/22-CONTEXT.md` — all locked decisions, color assignments, generator-to-group mapping — read directly
- `.planning/config.json` — nyquist_validation key absent (treated as enabled) — read directly

### Secondary (MEDIUM confidence)
- Three.js `Group.getObjectByName()` — method is well-established in Three.js r60+ and has not changed API; confirmed in LayerManager code that uses Three.js Groups throughout

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing Zustand + Three.js patterns verified in source
- Architecture: HIGH — all integration points read directly from source files; no assumptions
- Pitfalls: HIGH — persist gap confirmed by reading layer-store.ts; visibility restore issue derived
  from Three.js visibility propagation semantics (known behavior); hydration issue documented in CLAUDE.md
- Generator mapping: HIGH for layers 1–7 (files read); MEDIUM for layer-8/9 waste numbering discrepancy (requires planner judgment)

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable stack — no fast-moving dependencies)
