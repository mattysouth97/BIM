"use client";

import { useEffect } from "react";
import { useEditorModeStore, type EditorMode } from "@/store/editor-mode-store";
import { useBimModelStore } from "@/store/bim-model-store";

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
 *   Tab        → toggleEditMode()   (navigate ↔ last-edit-mode)
 *   Escape     → setMode('navigate')
 *   1 / 2 / 3 / 4  → set mode by index (no modifier keys)
 */
export function useEditorKeybinds(): void {
  const setMode = useEditorModeStore((s) => s.setMode);
  const toggleEditMode = useEditorModeStore((s) => s.toggleEditMode);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Never fire when user is typing in a form field
      if (isFocusInTextInput()) return;

      switch (e.key) {
        case "Tab": {
          // Prevent browser from moving focus to next element
          e.preventDefault();
          toggleEditMode();
          break;
        }

        case "Escape": {
          const bim = useBimModelStore.getState();
          if (bim.editingTypeId) {
            bim.setEditingType(null);
            break;
          }
          if (bim.selectedElementId) {
            bim.selectElement(null);
            break;
          }
          setMode("navigate");
          break;
        }

        case "z":
        case "Z": {
          if (!(e.ctrlKey || e.metaKey)) break;
          e.preventDefault();
          if (e.shiftKey) useBimModelStore.getState().redoLast();
          else useBimModelStore.getState().undoLast();
          break;
        }

        case "Delete":
        case "Backspace": {
          const selected = useBimModelStore.getState().selectedElementId;
          if (selected) {
            e.preventDefault();
            useBimModelStore.getState().applyDelete(selected);
          }
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
