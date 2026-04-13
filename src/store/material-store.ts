"use client";

import { create } from "zustand";
import type { MaterialProperties } from "@/lib/material-types";

interface MaterialState {
  // Material properties keyed by building PK (mgmBldrgstPk)
  properties: Record<string, MaterialProperties>;

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
}

export const useMaterialStore = create<MaterialState>()((set, get) => ({
  properties: {},
  selectedElement: { type: null },

  setProperties: (pk, props) =>
    set((state) => ({
      properties: { ...state.properties, [pk]: props },
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
      updated.source = "user-input";

      return { properties: { ...state.properties, [pk]: updated } };
    }),

  selectElement: (element) => set({ selectedElement: element }),
  clearSelection: () => set({ selectedElement: { type: null } }),
  getProperties: (pk) => get().properties[pk],
}));
