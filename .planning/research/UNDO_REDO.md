# Undo/Redo Architecture Research

**Domain:** Cross-store command pattern for a web-based BIM authoring tool
**Researched:** 2026-03-30
**Confidence:** HIGH (Revit/Three.js patterns), MEDIUM (Zustand-specific cross-store), LOW (Spline/Vectary internals)

---

## 1. How BIM/3D Tools Actually Implement Undo

### Revit: TransactionGroup with Assimilation (HIGH confidence)

Revit's undo system is the most directly instructive model because it faces the same problem this codebase has: many independent subsystems must appear as one atomic operation to the user.

The Revit API exposes three levels:

- **Transaction** — a single atomic change to the document model. Every mutation must be wrapped in one.
- **SubTransaction** — a nested mutation within an open Transaction. Used for provisional work that may be rolled back without aborting the parent.
- **TransactionGroup** — wraps multiple sequential Transactions. Has two commit modes:
  - `Commit()` — all inner transactions remain visible as separate undo steps.
  - `Assimilate()` — merges all inner transactions into one named undo step.

When a user draws a wall that auto-joins two existing walls, Revit groups the "draw wall" transaction with the two "modify join" transactions via a TransactionGroup, then assimilates them. The undo stack shows one step: "Draw Wall", and a single undo reverses all three database mutations atomically.

**Takeaway:** The concept directly applicable to this project is "batch multiple store mutations, present as one undo step." The TransactionGroup/Assimilate pattern maps to a `CompoundCommand` that wraps N individual commands across stores.

Source: [Revit API TransactionGroup Class](https://www.revitapidocs.com/2024/f1113d30-4c36-7844-1537-aad7f095cea0.htm), [The Building Coder: Using Transaction Groups](https://thebuildingcoder.typepad.com/blog/2015/02/using-transaction-groups.html)

### ArchiCAD: Scoped Undoable Command (HIGH confidence)

ArchiCAD's C++ API requires any function that creates, modifies, or deletes elements to be called within an "undoable command scope." Calling such functions outside a scope returns `APIERR_NEEDSUNDOSCOPE`. This is enforced at the API boundary — the application cannot accidentally create un-undoable state.

The user-facing behavior is a linear timeline. If a user edits history (makes a new action after undoing), the future is discarded — the new action becomes the present. This is the standard branching model, not a tree.

**Takeaway:** Enforce at the "entry point" that mutations only happen through the command system. This maps to: all store mutations that should be undoable must be called through `executeCommand()`, never directly through `usePlanStore.getState().addWall()`.

Source: [Graphisoft ArchiCAD API Docs: Element Grouping](https://graphisoft.github.io/archicad-api-devkit/group___grouping.html), [ArchiCAD Basics: Undo and Redo](https://shoegnome.com/2015/01/27/archicad-basics-undo-redo/)

### Blender: Unified Stack with Mode-Specific Step Types (HIGH confidence)

Blender maintains a **single undo stack** even though it has radically different modes (Object mode, Edit mode, Sculpt mode). Each step is typed:

- **Stateful (memfile) steps** — a full serialized snapshot of the data block. Can be loaded in either direction (undo or redo) without replaying history. Blender uses its `.blend` file serialization internally. Expensive but simple.
- **Differential steps** — store only the delta. Faster and smaller but must be applied/unapplied sequentially; cannot jump to an arbitrary step.

The critical insight is that switching between "global" (Object mode) and "local" (Edit mode) creates an implicit context boundary that has historically caused bugs in Blender — undoing a global step while inside a local step context can lose the local undo history. Blender's developers consider this a persistent problem.

**Takeaway for this project:** Context boundaries are dangerous. When a user switches floors in the plan view, or switches from 2D plan mode to 3D view, treat the mode switch itself as a non-undoable context transition, not as an undoable step. Don't put view/camera/mode state in the undo stack.

Source: [Blender Undo System Developer Documentation](https://developer.blender.org/docs/features/core/undo/), [Blender 2.8 Undo System Discussion](https://devtalk.blender.org/t/blender-2-8-undo-system-discussion/6898)

### Three.js Editor: Command Object with execute/undo/update (HIGH confidence)

The Three.js built-in editor (not a user project — the official mrdoob editor shipped with Three.js) implements the canonical command pattern used by most web 3D tools. This is directly relevant because the project already uses Three.js.

Structure:
```
Editor
  .history: History
    .undos: Command[]
    .redos: Command[]
  .execute(command: Command): void
```

Every `Command` implements:
- `execute()` — apply the change to scene state
- `undo()` — reverse the change
- `update(newCommand)` — optional; merges a newer command of the same type into this one (coalescing for drag operations)
- `toJSON()` / `fromJSON()` — for serialization/persistence to IndexedDB

Concrete command examples: `AddObjectCommand`, `RemoveObjectCommand`, `SetPositionCommand`, `SetMaterialValueCommand`. Each stores only the changed value (old + new), not the full scene.

All mutations go through `editor.execute()`. Components never mutate scene state directly.

**Takeaway:** This is the exact pattern to implement. The `Editor` singleton maps to a `CommandBus` singleton (or Zustand store). `editor.execute(cmd)` maps to `commandBus.execute(cmd)`.

Source: [Three.js Editor Undo/Redo PR #7337](https://github.com/mrdoob/three.js/pull/7337/files), [Three.js Fork: Implementing additional commands for undo-redo](https://github.com/makc/three.js.fork/blob/master/editor/docs/Implementing%20additional%20commands%20for%20undo-redo.md)

---

## 2. The Multi-Store Problem: Current Architecture Analysis

The existing codebase has 7 Zustand stores. The stores relevant to undoable authoring actions are:

| Store | Undoable State | Mutation Methods |
|-------|----------------|-----------------|
| `plan-store` | `walls`, `openings`, `rooms`, `floorHeights`, `floorCount` | `addWall`, `removeWall`, `addOpening`, `removeOpening`, `setFloorHeight`, `copyFloor` |
| `component-store` | `placed` (per-building component instances) | `placeComponent`, `removeComponent`, `updatePosition` |
| `material-store` | `properties` (per-building material overrides) | `overrideProperty` |
| `recipe-store` | `overrides` (per-building recipe overrides) | `setOverride`, `resetSection` |
| `authoring-store` | Has `editHistory` / `redoHistory` stacks (skeleton only) | `pushEdit`, `undo`, `redo` |

The `authoring-store` has the undo stack but the `ElementEdit` interface only captures `{elementId, property, oldValue, newValue}` — a simple property-bag. It does **not** capture which store to apply the change to, and it has no mechanism to actually reverse state in other stores. The `undo()` method returns the `ElementEdit` record to the caller, who is then supposed to do something with it. This is incomplete — the applying side is missing.

**The core problem:** A compound action like "draw wall → auto-detect room → place component on wall" touches `plan-store` (add wall), `plan-store` (setRooms), and `component-store` (placeComponent). There is no existing mechanism to undo these three mutations atomically as a single undo step.

---

## 3. Recommended Pattern: Central CommandBus with CompoundCommand Support

### Why not use zundo (snapshot middleware)?

zundo wraps individual stores with temporal middleware, storing full state snapshots on each change. For simple stores this is adequate, but:

- **Cross-store atomicity is impossible.** zundo wraps one store at a time. An undo on `plan-store` does not automatically roll back the coordinated change in `component-store`. You would need to manually trigger undo on multiple stores simultaneously and hope they stay in sync.
- **No coalescing for drag operations.** Wall drawing in the plan view produces a new `drawingWall` update on every pointer move. Snapshot-based middleware would create hundreds of undo steps for a single drag.
- **Transient state must be explicitly excluded.** `drawingMode`, `drawingWall`, `axisConstraint`, `selectedElementId` in various stores must never enter the undo history. zundo requires explicit `partialize` configuration per store.
- **Memory cost at scale.** Storing full `walls[]` snapshots for every wall operation is expensive at large floor counts.

zundo is the right choice for simple use cases (e.g., undo on a single material property store in isolation). It is the wrong choice for the cross-store coordination this project needs.

Source: [zundo GitHub](https://github.com/charkour/zundo), [Rethinking Undo/Redo - Why We Need Travels](https://dev.to/unadlib/rethinking-undoredo-why-we-need-travels-2lcc), [Zustand Discussion #1611](https://github.com/pmndrs/zustand/discussions/1611)

### Why the existing authoring-store skeleton is the right foundation

The existing `authoring-store` has the correct instinct — a central undo/redo history that all stores report to. The missing piece is that the commands need to be executable, not just descriptive.

### Recommended Architecture: Executable Command Objects

**Step 1 — Define the Command interface**

```typescript
// src/lib/undo/types.ts

export interface Command {
  readonly type: string;
  execute(): void;          // apply to stores
  undo(): void;             // reverse from stores
  /** Optional: merge a newer command of the same type into this one.
   *  Used for drag coalescing. Return true if merged, false to push new command. */
  update?(newer: Command): boolean;
}

export interface CompoundCommand extends Command {
  readonly type: "compound";
  commands: Command[];
}
```

**Step 2 — Upgrade authoring-store to hold Command objects**

```typescript
// src/store/authoring-store.ts (upgrade)
interface AuthoringState {
  // replace ElementEdit stacks with Command stacks:
  undoStack: Command[];
  redoStack: Command[];

  execute: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  beginCompound: () => void;        // start batching
  commitCompound: (name: string) => void;  // flush batch as one step
  abortCompound: () => void;        // discard batch and undo pending changes
}
```

`execute()` implementation:
```typescript
execute: (command) => {
  const { pendingCompound } = get();
  command.execute();   // immediately applies to the store
  if (pendingCompound) {
    pendingCompound.commands.push(command);
  } else {
    set((state) => ({
      undoStack: [...state.undoStack, command],
      redoStack: [],
    }));
  }
}
```

**Step 3 — Implement concrete commands per domain**

Each command calls the Zustand store's getState() directly — no React hooks, no subscription. This is safe from outside components.

```typescript
// src/lib/undo/commands/plan-commands.ts

import { usePlanStore } from "@/store/plan-store";
import type { WallSegment } from "@/store/plan-store";
import type { Command } from "../types";

export class AddWallCommand implements Command {
  readonly type = "AddWall";
  constructor(private wall: WallSegment) {}

  execute() {
    usePlanStore.getState().addWall(this.wall);
  }
  undo() {
    usePlanStore.getState().removeWall(this.wall.id);
  }
}

export class RemoveWallCommand implements Command {
  readonly type = "RemoveWall";
  private removedOpenings: Opening[];
  constructor(private wall: WallSegment) {
    // capture dependent openings at construction time
    this.removedOpenings = usePlanStore.getState().openings.filter(
      (o) => o.wallId === wall.id
    );
  }
  execute() {
    const store = usePlanStore.getState();
    this.removedOpenings.forEach((o) => store.removeOpening(o.id));
    store.removeWall(this.wall.id);
  }
  undo() {
    const store = usePlanStore.getState();
    store.addWall(this.wall);
    this.removedOpenings.forEach((o) => store.addOpening(o));
  }
}
```

```typescript
// src/lib/undo/commands/material-commands.ts

import { useMaterialStore } from "@/store/material-store";
import type { Command } from "../types";

export class OverrideMaterialCommand implements Command {
  readonly type = "OverrideMaterial";
  private previousValue: unknown;
  constructor(
    private pk: string,
    private path: string,
    private newValue: unknown
  ) {
    // snapshot old value at construction time
    const props = useMaterialStore.getState().getProperties(pk);
    // navigate path to get current value
    this.previousValue = getNestedValue(props, path);
  }
  execute() {
    useMaterialStore.getState().overrideProperty(this.pk, this.path, this.newValue);
  }
  undo() {
    useMaterialStore.getState().overrideProperty(this.pk, this.path, this.previousValue);
  }
  update(newer: OverrideMaterialCommand): boolean {
    if (newer.pk === this.pk && newer.path === this.path) {
      this.newValue = newer.newValue;
      return true;  // coalesced — same property, update newValue
    }
    return false;
  }
}
```

**Step 4 — CompoundCommand for multi-store operations**

```typescript
// src/lib/undo/commands/compound-command.ts

export class CompoundCommand implements Command {
  readonly type = "compound";
  constructor(
    public commands: Command[],
    public name: string
  ) {}

  execute() {
    this.commands.forEach((c) => c.execute());
  }
  undo() {
    // reverse order on undo
    [...this.commands].reverse().forEach((c) => c.undo());
  }
}
```

Usage for a compound operation (e.g., "draw wall + auto-detect rooms"):

```typescript
const { beginCompound, commitCompound } = useAuthoringStore.getState();
beginCompound();
execute(new AddWallCommand(wall));
execute(new SetRoomsCommand(computedRooms));
commitCompound("Draw Wall");
// result: one undo step "Draw Wall" that reverses both mutations
```

---

## 4. Undo Granularity by Operation Type

| Operation | Undo Granularity | Notes |
|-----------|-----------------|-------|
| Draw wall (click-click) | Single step: AddWall | Includes auto-detected room update (CompoundCommand) |
| Wall segment drag | Coalesced to single step | Use `update()` to merge intermediate positions |
| Delete wall | Single step: RemoveWall | Must snapshot dependent openings at command construction time |
| Place opening (door/window) | Single step: AddOpening | |
| Remove opening | Single step: RemoveOpening | |
| Copy floor | Single step: CopyFloor | Wraps all copied walls + openings |
| Adjust floor height | Coalesced step | Slider drag → merge via `update()` |
| Material property slider | Coalesced step | Same path = merge, different path = separate steps |
| Recipe override | Single step: SetRecipeOverride | Per property |
| Place component | Single step: PlaceComponent | |
| Move component (drag) | Coalesced step | Use `update()` on UpdatePositionCommand |
| Delete component | Single step: RemoveComponent | |

---

## 5. What Belongs in the Undo Stack vs What Doesn't

### DO track (undoable)

- `plan-store`: `walls`, `openings`, `rooms`
- `plan-store`: `floorHeights`, `floorCount`
- `material-store`: `properties` (only user-overridden values)
- `recipe-store`: `overrides`
- `component-store`: `placed` positions

### DO NOT track (transient / view state)

- `plan-store`: `drawingWall`, `drawingMode`, `activeFloor`, `viewMode`, `snapEnabled`, `axisConstraint` — these are UI configuration, not content
- `authoring-store`: `selectedElementId`, `selectedElementType`, `transformMode`, `annotationMode`
- `layer-store`: `visibility`, `density` — display preferences, not authoring data
- `material-store`: `selectedElement` — selection cursor

Blender's most persistent undo bug category is mode/view state leaking into the undo stack and creating inconsistencies when the user switches modes. Enforce this boundary strictly.

---

## 6. Keyboard Shortcut Binding

Undo/redo must be bound globally and intercepted before default browser behavior.

```typescript
// src/hooks/use-undo-shortcut.ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      useAuthoringStore.getState().undo();
    }
    if ((e.key === "z" && e.shiftKey) || e.key === "y") {
      e.preventDefault();
      useAuthoringStore.getState().redo();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

This hook should be mounted once at the top-level layout, not inside the canvas or panel components.

---

## 7. Drag Coalescing Implementation

Without coalescing, moving a component in the 3D viewport creates one undo step per animation frame — potentially 60 steps per second of dragging. Users expect one undo per drag gesture.

The Three.js editor handles this with the `update()` method and a `commandState` flag:

```typescript
// src/lib/undo/command-bus.ts

execute(command: Command) {
  const { undoStack } = useAuthoringStore.getState();
  const last = undoStack[undoStack.length - 1];

  command.execute();

  // Attempt coalescing with the last command
  if (last && last.update && last.update(command)) {
    // Merged — no new stack entry needed. Update the command in-place.
    // Force a re-render notification if needed.
    return;
  }

  useAuthoringStore.getState().pushCommand(command);
}
```

The `update()` method on a command should:
1. Check that the newer command is the same type and targets the same element/property
2. If yes: update `this.newValue` (keep original `oldValue` as the pre-drag baseline)
3. Return `true`

For drag start/end, the TransformControls (drei) fires `onMouseDown` and `onMouseUp`. The `onMouseDown` handler should mark a "coalescing window open" flag. `onMouseUp` closes it. Only commands within an open coalescing window merge. This prevents unrelated sequential edits from accidentally coalescing.

---

## 8. Cross-Store Consistency: The Dependent-Object Problem

The most dangerous bug class in BIM undo is **dangling references** after undo. Specific cases for this codebase:

### Case 1: Wall deletion with dependent openings

`RemoveWallCommand` must snapshot and store all `Opening` records whose `wallId === wall.id` at construction time (before executing). On undo, it restores both the wall and its openings. If only the wall is restored without the openings, the plan is in an invalid state (orphaned openings are filtered out by the room-detection algorithm, silently breaking room detection).

### Case 2: Floor copy and subsequent edits

`copyFloor(from, to)` creates new IDs with `crypto.randomUUID()`. The `CopyFloorCommand` must capture the generated IDs. If an undo later removes the floor copy, it must remove by those exact IDs — not by re-running the copy logic (which would generate different UUIDs).

**Pattern:** Commands must be deterministic. All random IDs must be generated at command construction time (before `execute()`), stored in the command object, and reused on redo.

### Case 3: Recipe overrides and component placement

If a recipe override changes `wallThickness` and a component was placed assuming the old geometry, undo of the recipe override does not automatically recompute the component position. This is the "semantic consistency" problem described in collaborative 3D modeling research. Resolution: accept this limitation and document it. The alternative (cascading recalculation on undo) is disproportionate complexity for v3.0.

---

## 9. Stack Size and Memory Management

A history of 50 steps is sufficient for professional authoring tools (Revit defaults to 20). The Three.js editor defaults to unlimited, which causes memory leaks on large projects.

Recommended cap: **50 commands**. When the stack exceeds 50, drop the oldest entry.

Each command stores only the delta (changed values), not full state snapshots. A `WallSegment` is ~7 fields × 64 bytes = negligible. The expensive case is `SetRoomsCommand` which stores a `Room[]` polygon array — these should be stored by reference if rooms are immutable value objects, or deep-cloned if mutable.

---

## 10. Persistence (Optional but Recommended for v3.0)

The Three.js editor persists its undo history to IndexedDB via `toJSON()` / `fromJSON()` on each command. This allows undo across page refreshes.

For this project, full persistence is likely premature. However, all commands should be designed with serialization in mind:

- All command constructor arguments must be JSON-serializable (no class instances, no Three.js objects, no React refs)
- `PlacedComponent` positions are `[number, number, number]` — already serializable
- `WallSegment` is already plain data
- `MaterialProperties` nested paths use dot-notation strings — already serializable

This makes future persistence a matter of adding `toJSON`/`fromJSON` without redesigning the command interface.

---

## 11. What NOT to Do: Pitfalls

### Pitfall 1: Snapshot the entire store on every mutation (memento-at-scale)

**What goes wrong:** Using zundo or a manual "store snapshot" approach causes the undo stack to hold full copies of `walls[]`, `openings[]`, `placed{}`, and `properties{}` on every change. At 100 walls across 5 floors with 50 history steps, this is ~5MB of duplicated data kept in memory.

**Prevention:** Use delta commands (old value + new value), not snapshots.

### Pitfall 2: Calling store mutations directly (bypassing the command bus)

**What goes wrong:** A component calls `usePlanStore.getState().addWall(wall)` directly. The wall is added to the scene but not to the undo stack. The user presses Ctrl-Z and nothing happens. Now state is permanently dirty.

**Prevention:** All undoable mutations must go through `commandBus.execute()`. Create ESLint rules or TypeScript nominal typing to enforce this boundary if the team is larger than 2 people.

### Pitfall 3: View/selection/mode state in the undo stack

**What goes wrong:** `activeFloor`, `viewMode`, `selectedElementId` are stored as undo steps. User draws three walls, switches to 3D view, presses Ctrl-Z three times — each undo goes back one view-mode change, not one wall. This is the root cause of Blender's most-reported undo bugs.

**Prevention:** Separate undoable authoring state from view/interaction state. The command pattern naturally enforces this because you only create command objects for content mutations.

### Pitfall 4: Compound commands with partial execution failure

**What goes wrong:** A `CompoundCommand` has 3 sub-commands. The first two execute successfully, the third throws. The store is now in a partially-modified state that doesn't match either the before or after snapshot. Undo reverses the first two successfully, but the user sees an error and doesn't know the state was recovered.

**Prevention:** In JavaScript/TypeScript with synchronous Zustand mutations, failures are rare (no network calls in the command's `execute()`). Keep commands synchronous. Do not put async operations (API calls, file I/O) inside commands — run async operations before constructing the command, then construct the command with the already-fetched data.

### Pitfall 5: Random IDs regenerated on redo

**What goes wrong:** `AddWallCommand.undo()` removes wall by ID. `AddWallCommand.redo()` calls `addWall({ ...this.wall, id: crypto.randomUUID() })` instead of reusing `this.wall.id`. Any openings or rooms that reference `this.wall.id` are now orphaned after redo.

**Prevention:** Generate all IDs in the command constructor before `execute()`. Store them. Reuse them on redo.

### Pitfall 6: Merging un-mergeable commands (over-coalescing)

**What goes wrong:** Two different users drag two different walls in rapid succession. The `update()` method only checks command type but not element ID. Command 2 merges into command 1. Undo now reverts both walls to command 1's baseline, silently discarding command 2's baseline position.

**Prevention:** The `update()` method must check both command type AND element identity (wall ID, component instanceId, property path). Return `false` if either differs.

---

## 12. Library Recommendation

**Recommendation: Custom implementation over any library.**

**Why not zundo:** Cross-store atomicity is not supported. Coalescing requires custom `equality` functions that are essentially reimplementing the command pattern. Partialize config across 4 stores is error-prone.

**Why not zustand-travel (mutativejs):** JSON Patch storage is valuable for large states but introduces a dependency on immer-style mutation syntax that conflicts with the existing store code which uses explicit `set()` with spread operators.

**The custom implementation is ~150 lines:** `Command` interface, `CompoundCommand` class, `executeCommand()` function, and upgrades to `authoring-store`. This is less code than the configuration overhead of bending zundo to cross-store needs.

**If forced to use a library:** Use zundo with explicit `partialize` on each store, and wrap multi-store operations with a manually-synchronized compound step — but this is significantly more complex than the custom approach.

Sources: [zundo GitHub](https://github.com/charkour/zundo), [zustand-travel GitHub](https://github.com/mutativejs/zustand-travel), [Zustand Discussions #2496: Multiple stores vs slices](https://github.com/pmndrs/zustand/discussions/2496)

---

## 13. Stores That Need Undo Support: Summary

| Store | Needs Undo | Reason |
|-------|-----------|--------|
| `plan-store` | YES — core content | Walls, openings, rooms are primary authoring content |
| `component-store` | YES — placed instances | Placement and position moves are undoable |
| `material-store` | YES — user overrides only | Inferred (non-user) properties should not be undoable |
| `recipe-store` | YES — overrides only | `baseRecipes` is read from API, not user-authored |
| `authoring-store` | NO — upgrade to command bus | Becomes the undo coordinator, not a subject of undo |
| `layer-store` | NO | Layer visibility/density is display config, not authored content |
| `app-store` | NO | API key and language settings are not authoring content |

---

## 14. Migration Path from Existing Skeleton

The existing `authoring-store` `editHistory: ElementEdit[]` / `redoHistory: ElementEdit[]` must be replaced. This is a breaking change to the store interface, but since the undo/redo functionality is currently incomplete (callers receive the `ElementEdit` back and do nothing with it), no production behavior is lost.

Migration steps:

1. Add `Command` interface and concrete command classes (no store changes yet)
2. Replace `EditElement` stacks with `Command` stacks in `authoring-store`
3. Add `execute`, `beginCompound`, `commitCompound`, `abortCompound` to `authoring-store`
4. Add `undo`/`redo` keyboard shortcut hook to layout
5. Migrate one operation at a time: start with `AddWall` / `RemoveWall` (highest user impact, easiest to test)
6. Add coalescing to material property sliders (prevents undo stack flooding during live editing)

---

## Sources

- [Revit API TransactionGroup Class](https://www.revitapidocs.com/2024/f1113d30-4c36-7844-1537-aad7f095cea0.htm)
- [The Building Coder: Using Transaction Groups](https://thebuildingcoder.typepad.com/blog/2015/02/using-transaction-groups.html)
- [Autodesk Community: Combine Multiple Transactions into One Undo](https://forums.autodesk.com/t5/revit-api-forum/combine-multiple-transactions-into-one-undo/td-p/5500362)
- [Graphisoft ArchiCAD C++ API: Element Grouping (undoable scope)](https://graphisoft.github.io/archicad-api-devkit/group___grouping.html)
- [ArchiCAD Basics: Undo and Redo - Shoegnome](https://shoegnome.com/2015/01/27/archicad-basics-undo-redo/)
- [Blender Undo System Developer Documentation](https://developer.blender.org/docs/features/core/undo/)
- [Blender 2.8 Undo System Discussion (mode boundary bugs)](https://devtalk.blender.org/t/blender-2-8-undo-system-discussion/6898)
- [Three.js Editor Undo/Redo PR #7337](https://github.com/mrdoob/three.js/pull/7337/files)
- [Three.js Fork: Implementing Additional Commands for Undo-Redo](https://github.com/makc/three.js.fork/blob/master/editor/docs/Implementing%20additional%20commands%20for%20undo-redo.md)
- [zundo GitHub (Zustand undo middleware)](https://github.com/charkour/zundo)
- [zustand-travel GitHub (JSON Patch undo middleware)](https://github.com/mutativejs/zustand-travel)
- [Rethinking Undo/Redo - Why We Need Travels (zundo vs travel comparison)](https://dev.to/unadlib/rethinking-undoredo-why-we-need-travels-2lcc)
- [Zustand Discussion #1611: Undo/redo middleware](https://github.com/pmndrs/zustand/discussions/1611)
- [Zustand Discussion #2496: Multiple stores vs slices](https://github.com/pmndrs/zustand/discussions/2496)
- [Implementing a Robust Undo/Redo in a 3D Application with Redux](https://chamallakshika09.medium.com/implementing-a-robust-undo-redo-mechanism-in-a-3d-application-with-redux-3d1e35b84bdd)
- [Undo, the art of - Part 1 (3D editor deep-dive)](https://maxliani.wordpress.com/2021/09/01/undo-the-art-of-part-1/)
- [You Don't Know Undo/Redo - DEV Community](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol)
