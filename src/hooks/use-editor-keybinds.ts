"use client";

import { useEffect } from "react";
import { useEditorModeStore, type EditorMode } from "@/store/editor-mode-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when focus is inside a text-entry element where key events
 *  should be left to the browser / form handler. */
function isFocusInTextInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// Mode order for digit-key cycling: 1–4 map to index 0–3
const MODE_ORDER: EditorMode[] = [
  "navigate",
  "floor-edit",
  "object-edit",
  "properties",
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useEditorKeybinds — install workspace-level keyboard shortcuts for editor
 * mode switching. Must be called once at the WorkspaceShell level.
 *
 * Bindings:
 *   ` (backquote) → toggleEditMode()  (navigate ↔ last-edit-mode)
 *   Escape        → setMode('navigate')
 *   1 / 2 / 3 / 4 → set mode by index (no modifier keys)
 *
 * P1-07 (a): the toggle was moved OFF Tab — hijacking Tab trapped keyboard
 * focus (WCAG 2.1.1/2.1.2). Backquote is a non-focus key following the same
 * no-modifier convention as the digit bindings.
 */
export function useEditorKeybinds(): void {
  const setMode = useEditorModeStore((s) => s.setMode);
  const toggleEditMode = useEditorModeStore((s) => s.toggleEditMode);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Never fire when user is typing in a form field
      if (isFocusInTextInput()) return;

      switch (e.key) {
        case "`": {
          // P1-07 (a): non-focus key — never preventDefault on Tab.
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) break;
          toggleEditMode();
          break;
        }

        case "Escape": {
          setMode("navigate");
          break;
        }

        case "1":
        case "2":
        case "3":
        case "4": {
          // Only activate when no modifier keys are held
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) break;
          const idx = parseInt(e.key, 10) - 1;
          const mode = MODE_ORDER[idx];
          if (mode) setMode(mode);
          break;
        }

        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setMode, toggleEditMode]);
}
