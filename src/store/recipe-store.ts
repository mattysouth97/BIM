"use client";

import { create } from "zustand";
import type { RecipeOverrides } from "@/lib/procedural/types";

interface RecipeState {
  // Recipe overrides keyed by building PK (mgmBldrgstPk)
  overrides: Record<string, RecipeOverrides>;

  // Deep-set a value at a dot-separated path into overrides[pk]
  setOverride: (pk: string, path: string, value: unknown) => void;

  // Get overrides for a building
  getOverrides: (pk: string) => RecipeOverrides | undefined;

  // Delete all overrides for a building
  resetOverrides: (pk: string) => void;

  // Reset a specific section (facade, slab, column, roof)
  resetSection: (
    pk: string,
    section: "facade" | "slab" | "column" | "roof"
  ) => void;
}

export const useRecipeStore = create<RecipeState>()((set, get) => ({
  overrides: {},

  setOverride: (pk, path, value) =>
    set((state) => {
      const current = state.overrides[pk] ?? {};
      // Deep clone to avoid mutation
      const updated = JSON.parse(JSON.stringify(current)) as RecipeOverrides;

      // Navigate dot-separated path and set value
      const parts = path.split(".");
      let obj: Record<string, unknown> = updated as unknown as Record<
        string,
        unknown
      >;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]] === undefined || obj[parts[i]] === null) {
          obj[parts[i]] = {};
        }
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;

      return { overrides: { ...state.overrides, [pk]: updated } };
    }),

  getOverrides: (pk) => get().overrides[pk],

  resetOverrides: (pk) =>
    set((state) => {
      const { [pk]: _, ...rest } = state.overrides;
      return { overrides: rest };
    }),

  resetSection: (pk, section) =>
    set((state) => {
      const current = state.overrides[pk];
      if (!current) return state;

      const updated = JSON.parse(JSON.stringify(current)) as RecipeOverrides;
      delete updated[section];

      // If no sections left, remove the key entirely
      if (Object.keys(updated).length === 0) {
        const { [pk]: _, ...rest } = state.overrides;
        return { overrides: rest };
      }

      return { overrides: { ...state.overrides, [pk]: updated } };
    }),
}));
