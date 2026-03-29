/** Command pattern interface for undoable operations. */
export interface Command {
  /** Identifies the command type for coalescing and debugging. */
  readonly type: string;
  /** Apply the change to application state. */
  execute(): void;
  /** Reverse the change from application state. */
  undo(): void;
  /**
   * Optional: merge a newer command of the same type into this one.
   * Used for drag coalescing — e.g., multiple position updates during a drag
   * should collapse into a single undo step.
   * Return true if merged (no new stack entry), false to push as separate entry.
   */
  update?(newer: Command): boolean;
}

/** Groups multiple commands into a single undo step. */
export class CompoundCommand implements Command {
  readonly type = "compound";

  constructor(
    public readonly commands: Command[],
    public readonly name: string
  ) {}

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
