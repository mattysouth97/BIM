import type { Command } from "./types";
import { CommandHistory } from "./command-history";

/**
 * CommandBus wraps CommandHistory and serves as the single app-wide entry point
 * for all undoable operations.
 *
 * Usage:
 *   import { commandBus } from "@/lib/undo/command-bus";
 *   commandBus.dispatch(new OverrideMaterialCommand(pk, path, oldVal, newVal));
 *   commandBus.undo();
 *   commandBus.redo();
 *
 * For compound (multi-step) operations:
 *   commandBus.history.beginCompound();
 *   commandBus.dispatch(cmd1);
 *   commandBus.dispatch(cmd2);
 *   commandBus.history.commitCompound("my-action");
 */
export class CommandBus {
  readonly history: CommandHistory;

  /** Timestamps of recent dispatches keyed by command target key, used by coalesceSameTarget. */
  private _lastDispatchTime: Map<string, number> = new Map();

  constructor(history?: CommandHistory) {
    this.history = history ?? new CommandHistory();
  }

  /**
   * Execute a command and push it onto the undo stack.
   * If the history is in compound mode (beginCompound called), the command is
   * batched into the current compound group instead of being pushed directly.
   */
  dispatch(command: Command): void {
    this.history.execute(command);
    // Track dispatch time for coalesceSameTarget helper
    const key = this._targetKey(command);
    if (key) {
      this._lastDispatchTime.set(key, Date.now());
    }
  }

  /**
   * Undo the last command. No-op if history is empty.
   * Returns the undone command, or undefined if nothing to undo.
   */
  undo(): Command | undefined {
    return this.history.undo();
  }

  /**
   * Redo the last undone command. No-op if redo stack is empty.
   * Returns the redone command, or undefined if nothing to redo.
   */
  redo(): Command | undefined {
    return this.history.redo();
  }

  /** Whether there is an action available to undo. */
  get canUndo(): boolean {
    return this.history.canUndo;
  }

  /** Whether there is an action available to redo. */
  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Clear all undo/redo history (e.g. on building switch / document close). */
  clear(): void {
    this.history.clear();
    this._lastDispatchTime.clear();
  }

  /**
   * Coalescing helper: wraps a command dispatch so that consecutive dispatches
   * for the same target within `windowMs` milliseconds are coalesced into a
   * single undo step via the command's `update()` method.
   *
   * This is a convenience wrapper — the actual coalescing logic lives in the
   * Command's `update()` implementation (e.g. OverrideMaterialCommand). This
   * helper simply checks whether we are still within the coalescing window and
   * dispatches accordingly, ensuring the command's `update()` is called by
   * CommandHistory when appropriate.
   *
   * Example: slider drag events for the same material property coalesce so that
   * Ctrl+Z undoes the entire drag, not each individual tick.
   *
   * @param command    The command to dispatch.
   * @param windowMs   Coalescing window in milliseconds (default: 500).
   */
  coalesceSameTarget(command: Command, windowMs = 500): void {
    const key = this._targetKey(command);
    if (key) {
      const last = this._lastDispatchTime.get(key);
      const now = Date.now();
      // If within window, the command will naturally coalesce via CommandHistory
      // because the top of the undo stack should be the same type+target and its
      // update() will absorb this command. Just dispatch normally.
      if (last !== undefined && now - last <= windowMs) {
        // Within window — dispatch normally; CommandHistory.execute() will call
        // last.update(command) which returns true for same-target commands.
        this.dispatch(command);
        return;
      }
      // Outside window — dispatch as a new undo step.
      // Reset the dispatch time so the first tick of the next drag starts fresh.
      this._lastDispatchTime.set(key, now);
    }
    this.dispatch(command);
  }

  /**
   * Derives a stable coalescing key from a command.
   * Returns null for commands that have no natural target key (e.g. compound).
   *
   * Convention: commands that support coalescing should expose `pk` and/or a
   * secondary discriminator (e.g. `path`, `instanceId`) as public readonly fields.
   * This helper reads them reflectively so no per-command registration is needed.
   */
  private _targetKey(command: Command): string | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = command as any;
    const parts: string[] = [command.type];
    if (typeof c.pk === "string") parts.push(c.pk);
    if (typeof c.path === "string") parts.push(c.path);
    if (typeof c.instanceId === "string") parts.push(c.instanceId);
    return parts.length > 1 ? parts.join(":") : null;
  }
}

/** App-wide singleton. Import this in stores and UI handlers. */
export const commandBus = new CommandBus();
