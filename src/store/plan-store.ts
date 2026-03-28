"use client";

import { create } from "zustand";

export interface WallSegment {
  id: string;
  start: [number, number]; // x, z
  end: [number, number]; // x, z
  thickness: number; // meters, default 0.2
  height: number; // meters, default 3.0
  floor: number;
}

interface PlanState {
  walls: WallSegment[];
  viewMode: "3d" | "plan";
  drawingWall: { start: [number, number] } | null;
  activeFloor: number;
  gridSize: number; // meters, default 0.5

  addWall: (wall: WallSegment) => void;
  removeWall: (id: string) => void;
  setViewMode: (mode: "3d" | "plan") => void;
  startDrawing: (start: [number, number]) => void;
  cancelDrawing: () => void;
  setActiveFloor: (n: number) => void;
  setGridSize: (n: number) => void;
}

export const usePlanStore = create<PlanState>()((set) => ({
  walls: [],
  viewMode: "3d",
  drawingWall: null,
  activeFloor: 0,
  gridSize: 0.5,

  addWall: (wall) =>
    set((state) => ({ walls: [...state.walls, wall] })),

  removeWall: (id) =>
    set((state) => ({ walls: state.walls.filter((w) => w.id !== id) })),

  setViewMode: (mode) =>
    set({ viewMode: mode, drawingWall: null }),

  startDrawing: (start) =>
    set({ drawingWall: { start } }),

  cancelDrawing: () =>
    set({ drawingWall: null }),

  setActiveFloor: (n) =>
    set({ activeFloor: n }),

  setGridSize: (n) =>
    set({ gridSize: n }),
}));
