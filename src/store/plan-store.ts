"use client";

import { create } from "zustand";
import type { RoomType } from "@/lib/plan/room-types";

export interface WallSegment {
  id: string;
  start: [number, number]; // x, z
  end: [number, number]; // x, z
  thickness: number; // meters, default 0.2
  height: number; // meters, default 3.0
  floor: number;
}

export interface Opening {
  id: string;
  wallId: string;
  t: number;        // 0-1 parametric offset along wall
  presetId: string; // ComponentPreset id (door-900, window-1200, etc.)
  floor: number;
}

export interface Room {
  id: string;
  polygon: [number, number][];
  area: number;
  centroid: [number, number];
  type: RoomType;
  floor: number;
}

interface PlanState {
  walls: WallSegment[];
  viewMode: "3d" | "plan";
  drawingWall: { start: [number, number] } | null;
  activeFloor: number;
  gridSize: number; // meters, default 0.5

  openings: Opening[];
  rooms: Room[];
  floorHeights: Record<number, number>; // floor index -> height in meters, default 3.0
  floorCount: number;                    // starts at 1
  drawingMode: "wall" | "opening" | null; // replaces implicit wall-only behavior

  // Snap configuration
  snapEnabled: boolean;         // master snap toggle, default true
  gridSnapEnabled: boolean;     // grid snapping, default true
  vertexSnapEnabled: boolean;   // vertex snapping, default true
  edgeSnapEnabled: boolean;     // edge snapping, default true
  proximityTolerance: number;   // snap proximity in meters, default 0.3

  addWall: (wall: WallSegment) => void;
  removeWall: (id: string) => void;
  setViewMode: (mode: "3d" | "plan") => void;
  startDrawing: (start: [number, number]) => void;
  cancelDrawing: () => void;
  setActiveFloor: (n: number) => void;
  setGridSize: (n: number) => void;

  addOpening: (o: Opening) => void;
  removeOpening: (id: string) => void;
  setRooms: (rooms: Room[]) => void;
  setRoomType: (roomId: string, type: RoomType) => void;
  setFloorHeight: (floor: number, height: number) => void;
  setFloorCount: (n: number) => void;
  copyFloor: (from: number, to: number) => void;
  setDrawingMode: (mode: "wall" | "opening" | null) => void;

  setSnapEnabled: (v: boolean) => void;
  setGridSnapEnabled: (v: boolean) => void;
  setVertexSnapEnabled: (v: boolean) => void;
  setEdgeSnapEnabled: (v: boolean) => void;
  setProximityTolerance: (v: number) => void;
}

export const usePlanStore = create<PlanState>()((set) => ({
  walls: [],
  viewMode: "3d",
  drawingWall: null,
  activeFloor: 0,
  gridSize: 0.5,

  openings: [],
  rooms: [],
  floorHeights: {},
  floorCount: 1,
  drawingMode: null,

  // Snap defaults
  snapEnabled: true,
  gridSnapEnabled: true,
  vertexSnapEnabled: true,
  edgeSnapEnabled: true,
  proximityTolerance: 0.3,

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

  addOpening: (o) =>
    set((state) => ({ openings: [...state.openings, o] })),

  removeOpening: (id) =>
    set((state) => ({ openings: state.openings.filter((o) => o.id !== id) })),

  setRooms: (rooms) =>
    set({ rooms }),

  setRoomType: (roomId, type) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, type } : r
      ),
    })),

  setFloorHeight: (floor, height) =>
    set((state) => ({ floorHeights: { ...state.floorHeights, [floor]: height } })),

  setFloorCount: (n) =>
    set({ floorCount: n }),

  copyFloor: (from, to) =>
    set((state) => {
      const newWalls = state.walls
        .filter((w) => w.floor === from)
        .map((w) => ({ ...w, id: crypto.randomUUID(), floor: to }));
      const newOpenings = state.openings
        .filter((o) => o.floor === from)
        .map((o) => ({ ...o, id: crypto.randomUUID(), floor: to }));
      return {
        walls: [...state.walls, ...newWalls],
        openings: [...state.openings, ...newOpenings],
      };
    }),

  setDrawingMode: (mode) =>
    set({ drawingMode: mode }),

  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setGridSnapEnabled: (v) => set({ gridSnapEnabled: v }),
  setVertexSnapEnabled: (v) => set({ vertexSnapEnabled: v }),
  setEdgeSnapEnabled: (v) => set({ edgeSnapEnabled: v }),
  setProximityTolerance: (v) => set({ proximityTolerance: v }),
}));
