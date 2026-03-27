"use client";

import { create } from "zustand";
import type { ComponentPreset, PlacedComponent } from "@/lib/components/component-types";

interface ComponentState {
  /** Placed components keyed by buildingPk */
  placed: Record<string, PlacedComponent[]>;
  /** Currently being dragged from palette (null = not dragging) */
  dragging: ComponentPreset | null;

  placeComponent: (pk: string, component: PlacedComponent) => void;
  removeComponent: (pk: string, instanceId: string) => void;
  updatePosition: (pk: string, instanceId: string, pos: [number, number, number]) => void;
  setDragging: (preset: ComponentPreset | null) => void;
}

export const useComponentStore = create<ComponentState>()((set) => ({
  placed: {},
  dragging: null,

  placeComponent: (pk, component) =>
    set((state) => ({
      placed: {
        ...state.placed,
        [pk]: [...(state.placed[pk] ?? []), component],
      },
    })),

  removeComponent: (pk, instanceId) =>
    set((state) => ({
      placed: {
        ...state.placed,
        [pk]: (state.placed[pk] ?? []).filter((c) => c.instanceId !== instanceId),
      },
    })),

  updatePosition: (pk, instanceId, pos) =>
    set((state) => ({
      placed: {
        ...state.placed,
        [pk]: (state.placed[pk] ?? []).map((c) =>
          c.instanceId === instanceId ? { ...c, position: pos } : c
        ),
      },
    })),

  setDragging: (preset) => set({ dragging: preset }),
}));
