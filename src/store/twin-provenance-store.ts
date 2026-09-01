"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TwinProvenance {
  hasCadFootprint: boolean;
  /** Closed interior polylines were classified (core and/or rooms). */
  hasCadPlan: boolean;
  /**
   * The outline came from the evidence-to-CAD reconstruction, not from a
   * drawing anyone produced of this building. Deliberately NOT folded into
   * `hasCadFootprint`: a synthesised outline is an inference, and calling it
   * CAD evidence is exactly the laundering this flag exists to prevent.
   * Optional so existing persisted entries stay valid without a migration.
   */
  reconstructedFootprint?: boolean;
  hasEquipmentSchedule: boolean;
  hasIfcModel: boolean;
  /** Bbox centre of the CAD outline, native metres — used to pin later cores. */
  cadOrigin?: { x: number; y: number };
  /** Confirmed plant install year (does not drive energy; capacity does). */
  equipmentInstallYear?: number;
}

const EMPTY: TwinProvenance = {
  hasCadFootprint: false,
  hasCadPlan: false,
  reconstructedFootprint: false,
  hasEquipmentSchedule: false,
  hasIfcModel: false,
};

interface TwinProvenanceState {
  byPk: Record<string, TwinProvenance>;
  get: (pk: string) => TwinProvenance;
  patch: (pk: string, partial: Partial<TwinProvenance>) => void;
  reset: (pk: string) => void;
}

export const useTwinProvenanceStore = create<TwinProvenanceState>()(
  persist(
    (set, get) => ({
      byPk: {},

      get: (pk) => get().byPk[pk] ?? { ...EMPTY },

      patch: (pk, partial) =>
        set((state) => {
          const current = state.byPk[pk] ?? { ...EMPTY };
          return {
            byPk: {
              ...state.byPk,
              [pk]: { ...current, ...partial },
            },
          };
        }),

      reset: (pk) =>
        set((state) => {
          const { [pk]: _, ...rest } = state.byPk;
          return { byPk: rest };
        }),
    }),
    {
      name: "bim-twin-provenance",
      partialize: (s) => ({ byPk: s.byPk }),
    },
  ),
);
