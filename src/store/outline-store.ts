"use client";

import { create } from "zustand";
import type * as THREE from "three";

/**
 * Outline store — holds Three.js object refs for selection/hover highlight.
 * NOT persisted: Three.js Object3D refs must never be serialized.
 * Pattern matches material-store.ts (zustand, no persist).
 */
interface OutlineState {
  selectedObjects: THREE.Object3D[];
  hoveredObjects: THREE.Object3D[];
  hoveredOwner: HoverOwner;

  setSelected: (objects: THREE.Object3D[]) => void;
  setHovered: (objects: THREE.Object3D[], owner?: Exclude<HoverOwner, null>) => void;
  clearHovered: (owner?: Exclude<HoverOwner, null>) => void;
}

type HoverOwner = "building" | "equipment" | null;

export const useOutlineStore = create<OutlineState>()((set) => ({
  selectedObjects: [],
  hoveredObjects: [],
  hoveredOwner: null,

  setSelected: (objects) => set({ selectedObjects: objects }),
  setHovered: (objects, owner = "building") =>
    set((state) => {
      // Equipment is the more specific hit target. A lower-priority building
      // pointer event must not overwrite it between throttled MEP raycasts.
      if (state.hoveredOwner === "equipment" && owner === "building") {
        return state;
      }
      return { hoveredObjects: objects, hoveredOwner: owner };
    }),
  clearHovered: (owner) =>
    set((state) => {
      if (owner && state.hoveredOwner !== owner) return state;
      return { hoveredObjects: [], hoveredOwner: null };
    }),
}));
