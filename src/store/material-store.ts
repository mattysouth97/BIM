"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MaterialProperties } from "@/lib/material-types";

interface MaterialState {
  // Material properties keyed by building PK (mgmBldrgstPk)
  properties: Record<string, MaterialProperties>;
  /** Source-model baseline; local persistence is not a save to that source. */
  baselineProperties: Record<string, MaterialProperties>;
  /** Distinct overridden field paths that still differ from the baseline. */
  overridePaths: Record<string, string[]>;

  /** PK of the building the workspace is currently showing. Not persisted. */
  activePk: string;

  // Currently selected element for the panel
  selectedElement: {
    type: "wall" | "window" | "roof" | "floor" | "hvac" | "lighting" | null;
    orientation?: "N" | "S" | "E" | "W";
    floorNo?: number;
  };

  // Set inferred properties for a building
  setProperties: (pk: string, props: MaterialProperties) => void;

  // Override a specific property path
  overrideProperty: (pk: string, path: string, value: unknown) => void;

  // Select an element to show in the panel
  selectElement: (element: MaterialState["selectedElement"]) => void;

  // Clear selection
  clearSelection: () => void;

  // Get properties for a building
  getProperties: (pk: string) => MaterialProperties | undefined;

  setActivePk: (pk: string) => void;
}

export const useMaterialStore = create<MaterialState>()(
  persist(
    (set, get) => ({
  properties: {},
  baselineProperties: {},
  overridePaths: {},
  activePk: "",
  selectedElement: { type: null },
  setActivePk: (pk) => set({ activePk: pk }),

  setProperties: (pk, props) =>
    set((state) => ({
      properties: { ...state.properties, [pk]: props },
      baselineProperties: { ...state.baselineProperties, [pk]: JSON.parse(JSON.stringify(props)) as MaterialProperties },
      overridePaths: { ...state.overridePaths, [pk]: [] },
    })),

  overrideProperty: (pk, path, value) =>
    set((state) => {
      const current = state.properties[pk];
      if (!current) return state;

      // Deep clone and set nested path
      const updated = JSON.parse(JSON.stringify(current)) as MaterialProperties;
      const parts = path.split(".");
      let obj: Record<string, unknown> = updated as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;
      if (path === "lighting.lightingPowerDensity") {
        updated.lighting.lpdProvenance = { source: "user_input" };
      }
      updated.source = "user-input";

      const baseline = state.baselineProperties[pk] ?? current;
      const baselineValue = parts.reduce<unknown>((node, part) =>
        node != null && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined, baseline);
      const paths = new Set(state.overridePaths[pk] ?? []);
      if (JSON.stringify(baselineValue) === JSON.stringify(value)) paths.delete(path);
      else paths.add(path);
      return {
        properties: { ...state.properties, [pk]: updated },
        baselineProperties: { ...state.baselineProperties, [pk]: baseline },
        overridePaths: { ...state.overridePaths, [pk]: [...paths] },
      };
    }),

  selectElement: (element) => set({ selectedElement: element }),
  clearSelection: () => set({ selectedElement: { type: null } }),
  getProperties: (pk) => get().properties[pk],
    }),
    {
      name: "bim-material-properties",
      partialize: (s) => ({ properties: s.properties, baselineProperties: s.baselineProperties, overridePaths: s.overridePaths }),
      merge: (persisted, current) => {
        const p = persisted as Partial<MaterialState> | undefined;
        return {
          ...current,
          properties: { ...current.properties, ...(p?.properties ?? {}) },
          baselineProperties: { ...current.baselineProperties, ...(p?.baselineProperties ?? {}) },
          overridePaths: { ...current.overridePaths, ...(p?.overridePaths ?? {}) },
        };
      },
    },
  ),
);
