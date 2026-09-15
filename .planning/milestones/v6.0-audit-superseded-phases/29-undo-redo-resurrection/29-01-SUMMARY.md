---
phase: 29
plan: "01"
subsystem: undo
tags: [undo, command-pattern, infrastructure]
dependency_graph:
  requires: []
  provides: [undo-infrastructure, command-bus-singleton]
  affects: [recipe-store, equipment-store, material-store, layer-store]
tech_stack:
  added: []
  patterns: [command-pattern, coalescing-updates, compound-commands]
key_files:
  created:
    - src/lib/undo/types.ts
    - src/lib/undo/command-history.ts
    - src/lib/undo/command-bus.ts
    - src/lib/undo/commands/material-commands.ts
    - src/lib/undo/commands/component-commands.ts
    - src/lib/undo/commands/plan-commands.ts
    - src/lib/undo/__tests__/command-history.test.ts
  modified: []
decisions:
  - "component-commands.ts and plan-commands.ts stubbed to empty exports because component-store and plan-store were removed in v5.0 cleanup; material-commands.ts wired to existing material-store"
  - "CommandBus._targetKey() uses reflective field inspection (pk, path, instanceId) so no per-command registration is needed for coalesceSameTarget"
  - "coalesceSameTarget dispatches to CommandHistory.execute() which calls last.update(cmd) — coalescing logic stays in the Command itself, CommandBus only tracks timing"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-12"
  tasks_completed: 1
  files_created: 7
---

# Phase 29 Plan 01: Undo/Redo Resurrection — Infrastructure Summary

Undo command-history infrastructure ported from worktree `agent-a494a07c` into main repo at `src/lib/undo/`, extended with a `CommandBus` singleton and timing-based coalescing helper. Ready for store-wiring follow-up.

## What Was Built

### Core module (ported from worktree)

**`src/lib/undo/types.ts`** — `Command` interface + `CompoundCommand` class. The `Command` interface defines `execute()`, `undo()`, and the optional `update(newer)` coalescing hook.

**`src/lib/undo/command-history.ts`** — `CommandHistory` class with 50-step capped undo/redo stacks, inline coalescing via `update()`, and `beginCompound` / `commitCompound` / `abortCompound` batch API.

**`src/lib/undo/__tests__/command-history.test.ts`** — 32 unit tests covering execute, undo, redo, canUndo/canRedo, MAX_HISTORY overflow, coalescing, compound grouping, and abort. All pass.

### Command implementations (ported + stubbed)

**`src/lib/undo/commands/material-commands.ts`** — `OverrideMaterialCommand` wired to `useMaterialStore`. Supports same-pk+path coalescing for rapid slider changes.

**`src/lib/undo/commands/component-commands.ts`** — Empty stub. `component-store` was removed in v5.0 cleanup. Restored in Phase 29 follow-up once component authoring system is defined.

**`src/lib/undo/commands/plan-commands.ts`** — Empty stub. `plan-store` was removed in v5.0 cleanup. Will be restored in Phase 31 (Annotation Lifecycle).

### New: CommandBus singleton

**`src/lib/undo/command-bus.ts`** — `CommandBus` class wrapping `CommandHistory`:

| Method | Purpose |
|--------|---------|
| `dispatch(command)` | Execute + push onto undo stack |
| `undo()` | Undo last command, returns it |
| `redo()` | Redo last undone command, returns it |
| `canUndo` / `canRedo` | Boolean state for UI button enable/disable |
| `clear()` | Reset all history (on building switch) |
| `coalesceSameTarget(cmd, windowMs=500)` | Time-windowed coalescing for same-target edits |

`coalesceSameTarget()` tracks last dispatch timestamp per target key (`type:pk:path:instanceId`). Dispatches within `windowMs` naturally coalesce via `CommandHistory.execute() → last.update(cmd)`. Dispatches outside the window start a fresh undo step.

`commandBus` is the app-wide singleton export — import it anywhere with:
```ts
import { commandBus } from "@/lib/undo/command-bus";
```

## Verification

- **Tests:** 32/32 pass (`pnpm test src/lib/undo`)
- **TypeScript:** Zero errors in `src/lib/undo/` (`npx tsc --noEmit 2>&1 | grep src/lib/undo` → empty)
- **Pre-existing TS errors:** Several unrelated test files have pre-existing type errors (building-geometry, structural-codes, layers tests) — out of scope, not introduced by this plan

## What Is Ready for Store Integration

Phase 29 follow-up workers can now:

1. **recipe-store / equipment-store / layer-store** — Import `commandBus` and wrap mutations in `new SomeCommand(...)` + `commandBus.dispatch(cmd)`
2. **material-store** — `OverrideMaterialCommand` already exists; wire store's `overrideProperty` calls to dispatch through `commandBus.coalesceSameTarget()`
3. **Keyboard handler** — Wire `useUndoShortcut` hook (already exists at `src/hooks/use-undo-shortcut.ts`) to call `commandBus.undo()` / `commandBus.redo()`
4. **UI state** — Subscribe to `commandBus.canUndo` / `commandBus.canRedo` for toolbar button enable/disable

## Deviations from Plan

**1. [Rule 1 - Bug] Stubbed component-commands.ts and plan-commands.ts**
- **Found during:** TypeScript build check
- **Issue:** `@/store/component-store` and `@/store/plan-store` do not exist in main (removed in v5.0 cleanup). The worktree had them; main does not. Build failed with `Cannot find module`.
- **Fix:** Replaced both files with empty `export {}` stubs with explanatory comments indicating which phase will restore them.
- **Files modified:** `src/lib/undo/commands/component-commands.ts`, `src/lib/undo/commands/plan-commands.ts`

## Known Stubs

- `src/lib/undo/commands/component-commands.ts` — empty stub; component store not yet in main
- `src/lib/undo/commands/plan-commands.ts` — empty stub; plan store not yet in main (Phase 31)

These stubs do not block the plan goal (undo infrastructure ready for store wiring) — the core `CommandHistory` + `CommandBus` + `OverrideMaterialCommand` are fully functional.

## Self-Check: PASSED

Files created:
- src/lib/undo/types.ts — present
- src/lib/undo/command-history.ts — present
- src/lib/undo/command-bus.ts — present
- src/lib/undo/commands/material-commands.ts — present
- src/lib/undo/commands/component-commands.ts — present
- src/lib/undo/commands/plan-commands.ts — present
- src/lib/undo/__tests__/command-history.test.ts — present
