import type { Command } from "./types";
import { CompoundCommand } from "./types";

export const MAX_HISTORY = 50;

export class CommandHistory {
  private _undoStack: Command[] = [];
  private _redoStack: Command[] = [];
  private _pending: Command[] | null = null;

  get undoStack(): readonly Command[] { return this._undoStack; }
  get redoStack(): readonly Command[] { return this._redoStack; }
  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }

  execute(command: Command): void {
    command.execute();

    if (this._pending !== null) {
      this._pending.push(command);
      return;
    }

    // Attempt coalescing with last command
    const last = this._undoStack[this._undoStack.length - 1];
    if (last && last.update && last.update(command)) {
      // Merged — no new stack entry, but still clear redo
      this._redoStack = [];
      return;
    }

    this._undoStack.push(command);
    this._redoStack = [];

    // Cap stack size — oldest entry dropped
    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
  }

  undo(): Command | undefined {
    const cmd = this._undoStack.pop();
    if (!cmd) return undefined;
    cmd.undo();
    this._redoStack.push(cmd);
    return cmd;
  }

  redo(): Command | undefined {
    const cmd = this._redoStack.pop();
    if (!cmd) return undefined;
    cmd.execute();
    this._undoStack.push(cmd);
    return cmd;
  }

  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this._pending = null;
  }

  beginCompound(): void {
    if (this._pending !== null) {
      throw new Error("CommandHistory: nested compound commands are not supported");
    }
    this._pending = [];
  }

  commitCompound(name: string): void {
    if (this._pending === null) return;
    const commands = this._pending;
    this._pending = null;
    if (commands.length === 0) return;
    const compound = new CompoundCommand(commands, name);
    // Commands already executed individually during batching.
    // Push the compound as a single undo entry.
    this._undoStack.push(compound);
    this._redoStack = [];
    if (this._undoStack.length > MAX_HISTORY) {
      this._undoStack.shift();
    }
  }

  abortCompound(): void {
    if (this._pending === null) return;
    const commands = this._pending;
    this._pending = null;
    // Undo in reverse order
    for (let i = commands.length - 1; i >= 0; i--) {
      commands[i].undo();
    }
  }
}
