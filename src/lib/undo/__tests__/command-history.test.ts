import { describe, it, expect, beforeEach } from "vitest";
import { CommandHistory, MAX_HISTORY } from "../command-history";
import { CompoundCommand } from "../types";
import type { Command } from "../types";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

class MockCommand implements Command {
  readonly type = "mock";
  executed = 0;
  undone = 0;
  execute() { this.executed++; }
  undo() { this.undone++; }
}

class CoalescingCommand implements Command {
  readonly type = "coalesce";
  value: number;
  executed = 0;
  undone = 0;
  constructor(value: number) { this.value = value; }
  execute() { this.executed++; }
  undo() { this.undone++; }
  update(newer: Command): boolean {
    if (newer instanceof CoalescingCommand) {
      this.value = newer.value;
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MAX_HISTORY", () => {
  it("is 50", () => {
    expect(MAX_HISTORY).toBe(50);
  });
});

describe("CommandHistory", () => {
  let history: CommandHistory;

  beforeEach(() => {
    history = new CommandHistory();
  });

  // -------------------------------------------------------------------------
  // Basic execute
  // -------------------------------------------------------------------------

  describe("execute()", () => {
    it("calls cmd.execute()", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      expect(cmd.executed).toBe(1);
    });

    it("pushes command to undoStack", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      expect(history.undoStack).toHaveLength(1);
      expect(history.undoStack[0]).toBe(cmd);
    });

    it("clears the redoStack on execute", () => {
      const cmd1 = new MockCommand();
      const cmd2 = new MockCommand();
      history.execute(cmd1);
      history.undo();
      expect(history.redoStack).toHaveLength(1);
      history.execute(cmd2);
      expect(history.redoStack).toHaveLength(0);
    });

    it("caps undoStack at MAX_HISTORY (50) entries — oldest dropped", () => {
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        history.execute(new MockCommand());
      }
      expect(history.undoStack).toHaveLength(MAX_HISTORY);
    });
  });

  // -------------------------------------------------------------------------
  // Undo
  // -------------------------------------------------------------------------

  describe("undo()", () => {
    it("calls cmd.undo() and returns the command", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      const returned = history.undo();
      expect(cmd.undone).toBe(1);
      expect(returned).toBe(cmd);
    });

    it("moves command from undoStack to redoStack", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      history.undo();
      expect(history.undoStack).toHaveLength(0);
      expect(history.redoStack).toHaveLength(1);
    });

    it("is a no-op on empty undoStack (returns undefined)", () => {
      const result = history.undo();
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Redo
  // -------------------------------------------------------------------------

  describe("redo()", () => {
    it("calls cmd.execute() and returns the command", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      history.undo();
      const returned = history.redo();
      expect(cmd.executed).toBe(2); // original execute + redo
      expect(returned).toBe(cmd);
    });

    it("moves command from redoStack to undoStack", () => {
      const cmd = new MockCommand();
      history.execute(cmd);
      history.undo();
      history.redo();
      expect(history.redoStack).toHaveLength(0);
      expect(history.undoStack).toHaveLength(1);
    });

    it("is a no-op on empty redoStack (returns undefined)", () => {
      const result = history.redo();
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // canUndo / canRedo
  // -------------------------------------------------------------------------

  describe("canUndo / canRedo", () => {
    it("canUndo is false when undoStack is empty", () => {
      expect(history.canUndo).toBe(false);
    });

    it("canUndo is true after executing a command", () => {
      history.execute(new MockCommand());
      expect(history.canUndo).toBe(true);
    });

    it("canRedo is false initially", () => {
      expect(history.canRedo).toBe(false);
    });

    it("canRedo is true after undo", () => {
      history.execute(new MockCommand());
      history.undo();
      expect(history.canRedo).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe("clear()", () => {
    it("empties both stacks", () => {
      history.execute(new MockCommand());
      history.execute(new MockCommand());
      history.undo();
      history.clear();
      expect(history.undoStack).toHaveLength(0);
      expect(history.redoStack).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Coalescing via update()
  // -------------------------------------------------------------------------

  describe("coalescing via update()", () => {
    it("merges second command into first when update() returns true", () => {
      const cmd1 = new CoalescingCommand(10);
      const cmd2 = new CoalescingCommand(20);
      history.execute(cmd1);
      history.execute(cmd2);
      // Only one entry in stack
      expect(history.undoStack).toHaveLength(1);
      // The value was merged
      expect(cmd1.value).toBe(20);
    });

    it("does not push a new entry when coalesced", () => {
      const cmd1 = new CoalescingCommand(1);
      const cmd2 = new CoalescingCommand(2);
      const cmd3 = new CoalescingCommand(3);
      history.execute(cmd1);
      history.execute(cmd2);
      history.execute(cmd3);
      expect(history.undoStack).toHaveLength(1);
    });

    it("still clears redoStack even when coalescing", () => {
      const cmd1 = new CoalescingCommand(1);
      history.execute(new MockCommand());
      history.undo();
      expect(history.redoStack).toHaveLength(1);
      history.execute(cmd1); // coalesces? no — different type than MockCommand
      // MockCommand.update is undefined — no coalescing — just clears redo
      expect(history.redoStack).toHaveLength(0);
    });

    it("does not coalesce commands of different types", () => {
      const mock = new MockCommand();
      const coalesce = new CoalescingCommand(5);
      history.execute(mock);
      history.execute(coalesce);
      expect(history.undoStack).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Compound commands
  // -------------------------------------------------------------------------

  describe("beginCompound / commitCompound", () => {
    it("groups commands into one undo step", () => {
      history.beginCompound();
      history.execute(new MockCommand());
      history.execute(new MockCommand());
      history.commitCompound("multi-step");
      expect(history.undoStack).toHaveLength(1);
      expect(history.undoStack[0]).toBeInstanceOf(CompoundCommand);
    });

    it("compound command name is set correctly", () => {
      history.beginCompound();
      history.execute(new MockCommand());
      history.commitCompound("my-action");
      const compound = history.undoStack[0] as CompoundCommand;
      expect(compound.name).toBe("my-action");
    });

    it("undoing a compound undoes all sub-commands in reverse order", () => {
      const results: string[] = [];
      const cmdA: Command = {
        type: "a",
        execute: () => results.push("exec-a"),
        undo: () => results.push("undo-a"),
      };
      const cmdB: Command = {
        type: "b",
        execute: () => results.push("exec-b"),
        undo: () => results.push("undo-b"),
      };
      history.beginCompound();
      history.execute(cmdA);
      history.execute(cmdB);
      history.commitCompound("ab");
      history.undo();
      expect(results).toEqual(["exec-a", "exec-b", "undo-b", "undo-a"]);
    });

    it("empty compound does not push to undoStack", () => {
      history.beginCompound();
      history.commitCompound("empty");
      expect(history.undoStack).toHaveLength(0);
    });

    it("clears redoStack when compound is committed", () => {
      history.execute(new MockCommand());
      history.undo();
      expect(history.redoStack).toHaveLength(1);
      history.beginCompound();
      history.execute(new MockCommand());
      history.commitCompound("step");
      expect(history.redoStack).toHaveLength(0);
    });

    it("nested beginCompound throws an error", () => {
      history.beginCompound();
      expect(() => history.beginCompound()).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // abortCompound
  // -------------------------------------------------------------------------

  describe("abortCompound()", () => {
    it("undoes all pending commands in reverse order", () => {
      const results: string[] = [];
      const cmdA: Command = {
        type: "a",
        execute: () => results.push("exec-a"),
        undo: () => results.push("undo-a"),
      };
      const cmdB: Command = {
        type: "b",
        execute: () => results.push("exec-b"),
        undo: () => results.push("undo-b"),
      };
      history.beginCompound();
      history.execute(cmdA);
      history.execute(cmdB);
      history.abortCompound();
      expect(results).toEqual(["exec-a", "exec-b", "undo-b", "undo-a"]);
    });

    it("does not push anything to undoStack", () => {
      history.beginCompound();
      history.execute(new MockCommand());
      history.abortCompound();
      expect(history.undoStack).toHaveLength(0);
    });

    it("is a no-op when not in compound mode", () => {
      expect(() => history.abortCompound()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// CompoundCommand tests
// ---------------------------------------------------------------------------

describe("CompoundCommand", () => {
  it("execute() calls sub-commands in order", () => {
    const results: string[] = [];
    const cmdA: Command = {
      type: "a",
      execute: () => results.push("a"),
      undo: () => {},
    };
    const cmdB: Command = {
      type: "b",
      execute: () => results.push("b"),
      undo: () => {},
    };
    const compound = new CompoundCommand([cmdA, cmdB], "test");
    compound.execute();
    expect(results).toEqual(["a", "b"]);
  });

  it("undo() calls sub-commands in reverse order", () => {
    const results: string[] = [];
    const cmdA: Command = {
      type: "a",
      execute: () => {},
      undo: () => results.push("undo-a"),
    };
    const cmdB: Command = {
      type: "b",
      execute: () => {},
      undo: () => results.push("undo-b"),
    };
    const compound = new CompoundCommand([cmdA, cmdB], "test");
    compound.undo();
    expect(results).toEqual(["undo-b", "undo-a"]);
  });

  it("has type 'compound'", () => {
    const compound = new CompoundCommand([], "test");
    expect(compound.type).toBe("compound");
  });
});
