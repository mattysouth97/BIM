---
phase: 17-panel-content-workflow-stepper
plan: "03"
subsystem: undo-redo
tags: [undo, command-pattern, keyboard-shortcuts, wall-drawing, component-placement]
dependency_graph:
  requires: [14-02, 17-01, 17-02]
  provides: [UNDO-01, UNDO-02]
  affects: [wall-drawer, placed-components, workspace-shell]
tech_stack:
  added: [react-hotkeys-hook@5.2.4]
  patterns: [command-pattern, getState-mutation, compound-command, drag-coalescing]
key_files:
  created:
    - src/lib/undo/commands/plan-commands.ts
    - src/lib/undo/commands/component-commands.ts
    - src/lib/undo/commands/material-commands.ts
    - src/hooks/use-undo-shortcut.ts
  modified:
    - src/components/workspace/workspace-shell.tsx
    - src/components/viewer/wall-drawer.tsx
    - src/components/viewer/placed-components.tsx
    - package.json
decisions:
  - "commandHistory singleton exported from use-undo-shortcut.ts — single global undo stack shared by all authoring tools"
  - "beginCompound/execute/commitCompound pattern used for wall+room atomic undo (not CompoundCommand constructor) — matches existing CommandHistory API"
  - "RemoveWallCommand snapshots dependent openings at construction time per UNDO_REDO.md section 8 Case 1"
  - "OverrideMaterialCommand.update() coalesces slider drags with same pk+path into single undo step"
  - "UpdatePositionCommand.update() coalesces drag position updates for same pk+instanceId"
  - "addWall direct call removed from wall-drawer — replaced with commandHistory.execute(AddWallCommand) inside compound scope"
  - "placeComponent direct call removed from placed-components — replaced with commandHistory.execute(PlaceComponentCommand)"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_created: 4
  files_modified: 4
---

# Phase 17 Plan 03: Undo/Redo Command Wiring Summary

Concrete undo/redo command classes for plan-store, component-store, and material-store, plus a global Ctrl+Z/Y keyboard shortcut hook wired through wall drawing and component placement authoring flows.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create concrete command classes | c8bdabd | src/lib/undo/commands/{plan,component,material}-commands.ts |
| 2 | Undo shortcut hook + authoring wiring | f347c9f | src/hooks/use-undo-shortcut.ts, workspace-shell.tsx, wall-drawer.tsx, placed-components.tsx |

## What Was Built

### Command Classes (src/lib/undo/commands/)

**plan-commands.ts** — 5 command classes:
- `AddWallCommand` — adds wall via `usePlanStore.getState().addWall()`, undoes with `removeWall(id)`
- `RemoveWallCommand` — snapshots dependent openings at construction, removes openings then wall, restores in correct order on undo
- `SetRoomsCommand` — stores previousRooms/newRooms arrays for atomic room state swap; used in compound commands with wall ops
- `AddOpeningCommand` / `RemoveOpeningCommand` — opening lifecycle with full object capture

**component-commands.ts** — 3 command classes:
- `PlaceComponentCommand` — places component with caller-generated instanceId (stable across redo)
- `RemoveComponentCommand` — captures full PlacedComponent for restoration
- `UpdatePositionCommand` — drag coalescing via `update()`: same pk+instanceId merges into one undo step

**material-commands.ts** — 1 command class:
- `OverrideMaterialCommand` — coalesces slider drags with same pk+path via `update()`, keeping original oldValue

### Keyboard Shortcut Hook (src/hooks/use-undo-shortcut.ts)

- Exports singleton `commandHistory: CommandHistory` — shared global undo stack
- `useUndoShortcut()` hook registers:
  - `ctrl+z` → `commandHistory.undo()`
  - `ctrl+y, ctrl+shift+z` → `commandHistory.redo()`
- Active element check suppresses shortcuts when focus is in INPUT/TEXTAREA/SELECT
- react-hotkeys-hook `enableOnFormTags` defaults to false (double protection)

### Authoring Wiring

**workspace-shell.tsx**: `useUndoShortcut()` called after hydration check — registers keyboard listeners at workspace level.

**wall-drawer.tsx**: `addWall(wall)` replaced with compound command scope:
```
commandHistory.beginCompound()
  → commandHistory.execute(new AddWallCommand(wall))
  → commandHistory.execute(new SetRoomsCommand(roomsBefore, roomsAfter))
commandHistory.commitCompound("Draw wall")
```
Wall + auto-detected room changes undo as one atomic step per D-10.

**placed-components.tsx**: `placeComponent("__current__", comp)` replaced with:
```
commandHistory.execute(new PlaceComponentCommand("__current__", comp))
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Minor implementation note:** The plan listed `CompoundCommand` class import as needed for wall-drawer. After reading command-history.ts, the `beginCompound()/commitCompound()` API was the correct pattern (CommandHistory wraps the array internally). The `CompoundCommand` class import was not needed and was excluded. This matches the implementation note in the plan itself: "Read command-history.ts to determine which pattern fits."

## Verification

- `pnpm build` passes with zero type errors
- All 18 acceptance criteria grep checks pass
- 3 command files in `src/lib/undo/commands/` with correct exports
- `useUndoShortcut` hook exists and is called in WorkspaceShell
- react-hotkeys-hook@5.2.4 in package.json
- wall-drawer.tsx uses commandHistory + AddWallCommand (not direct addWall)
- placed-components.tsx uses commandHistory + PlaceComponentCommand (not direct placeComponent)

## Known Stubs

None — all command classes are fully implemented and wired into live authoring flows.

## Self-Check: PASSED
