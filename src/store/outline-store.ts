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

  setSelected: (objects: THREE.Object3D[]) => void;
  setHovered: (objects: THREE.Object3D[]) => void;
  clearHovered: () => void;
}

export const useOutlineStore = create<OutlineState>()((set) => ({
  selectedObjects: [],
  hoveredObjects: [],

  setSelected: (objects) => set({ selectedObjects: objects }),
  setHovered: (objects) => set({ hoveredObjects: objects }),
  clearHovered: () => set({ hoveredObjects: [] }),
}));
