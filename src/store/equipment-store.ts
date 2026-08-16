"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  MepEquipmentParams,
} from "@/lib/layers/mep-equipment-params";
import { DEFAULT_MEP_EQUIPMENT_PARAMS } from "@/lib/layers/mep-equipment-params";

interface EquipmentState {
  /** MEP equipment geometry params keyed by mgmBldrgstPk */
  params: Record<string, MepEquipmentParams>;

  /** Replace all params for a building */
  setParams: (pk: string, params: MepEquipmentParams) => void;

  /**
   * Override a single nested property by dot-path, e.g. "chiller.bodyWidth".
   * Unlike material-store.overrideProperty, if pk is absent the entry is
   * INITIALIZED from DEFAULT_MEP_EQUIPMENT_PARAMS before applying the override.
   * This prevents silent data loss when the user adjusts a param before the
   * building has been fully loaded.
   */
  overrideParam: (pk: string, path: string, value: unknown) => void;

  /**
   * Get params for a building. Returns a deep copy of DEFAULT_MEP_EQUIPMENT_PARAMS
   * when no entry exists — never returns undefined.
   */
  getParams: (pk: string) => MepEquipmentParams;
}

export const useEquipmentStore = create<EquipmentState>()(
  persist(
    (set, get) => ({
  params: {},

  setParams: (pk, params) =>
    set((state) => ({
      params: { ...state.params, [pk]: params },
    })),

  overrideParam: (pk, path, value) =>
    set((state) => {
      // Initialize from defaults if pk absent — critical divergence from material-store
      const current =
        state.params[pk] ??
        (JSON.parse(JSON.stringify(DEFAULT_MEP_EQUIPMENT_PARAMS)) as MepEquipmentParams);

      // Deep clone to avoid mutating any shared references (including DEFAULT_MEP_EQUIPMENT_PARAMS)
      const updated = JSON.parse(JSON.stringify(current)) as MepEquipmentParams;

      // Walk the dot-path and set the leaf value
      const parts = path.split(".");
      let obj: Record<string, unknown> = updated as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;

      return { params: { ...state.params, [pk]: updated } };
    }),

  getParams: (pk) =>
    get().params[pk] ??
    (JSON.parse(JSON.stringify(DEFAULT_MEP_EQUIPMENT_PARAMS)) as MepEquipmentParams),
    }),
    {
      name: "bim-equipment-params",
      partialize: (s) => ({ params: s.params }),
      merge: (persisted, current) => {
        const p = persisted as Partial<EquipmentState> | undefined;
        return {
          ...current,
          params: { ...current.params, ...(p?.params ?? {}) },
        };
      },
    },
  ),
);
