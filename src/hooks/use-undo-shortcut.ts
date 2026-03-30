"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { CommandHistory } from "@/lib/undo/command-history";

/**
 * Singleton CommandHistory instance — the global undo/redo stack shared
 * across all authoring tools (wall drawing, component placement, material edits).
 */
export const commandHistory = new CommandHistory();

/**
 * Registers Ctrl+Z (undo) and Ctrl+Y / Ctrl+Shift+Z (redo) keyboard shortcuts.
 *
 * Must be called in a component that mounts while the workspace is active
 * (WorkspaceShell is the intended call site).
 *
 * Shortcuts are suppressed when focus is in a form input by default
 * (react-hotkeys-hook enableOnFormTags defaults to false).
 * An explicit activeElement check is also applied as a belt-and-suspenders guard.
 */
export function useUndoShortcut(): void {
  useHotkeys(
    "ctrl+z",
    () => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return;
      }
      commandHistory.undo();
    },
    { preventDefault: true }
  );

  useHotkeys(
    "ctrl+y, ctrl+shift+z",
    () => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return;
      }
      commandHistory.redo();
    },
    { preventDefault: true }
  );
}
