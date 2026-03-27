// src/lib/components/component-types.ts
// Type definitions and Korean-standard presets for BIM authoring components.

import type { LayerId } from "@/lib/layers/types";

/** Component category discriminator */
export type ComponentCategory = "door" | "window" | "mep" | "stair";

/** A preset template for a placeable component */
export interface ComponentPreset {
  id: string;
  name: string;
  nameKo: string;
  category: ComponentCategory;
  /** Width in meters */
  width: number;
  /** Height in meters */
  height: number;
  /** Depth in meters */
  depth: number;
  /** For MEP fixtures: which building-system layer they belong to */
  layerId?: LayerId;
  /** Type-specific properties */
  metadata: Record<string, unknown>;
}

/** A placed instance of a component in the scene */
export interface PlacedComponent {
  instanceId: string;
  presetId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  /** For doors/windows snapped to walls */
  parentWallId?: string;
  buildingPk: string;
}

// ---------------------------------------------------------------------------
// Korean standard door presets (KS F 3109)
// ---------------------------------------------------------------------------
export const DOOR_PRESETS: ComponentPreset[] = [
  {
    id: "door-900",
    name: "Single Door 900",
    nameKo: "단문 900",
    category: "door",
    width: 0.9,
    height: 2.1,
    depth: 0.05,
    metadata: { type: "single", material: "wood" },
  },
  {
    id: "door-1000",
    name: "Single Door 1000",
    nameKo: "단문 1000",
    category: "door",
    width: 1.0,
    height: 2.1,
    depth: 0.05,
    metadata: { type: "single", material: "wood" },
  },
  {
    id: "door-1200",
    name: "Double Door 1200",
    nameKo: "양문 1200",
    category: "door",
    width: 1.2,
    height: 2.1,
    depth: 0.05,
    metadata: { type: "double", material: "wood" },
  },
];

// ---------------------------------------------------------------------------
// Korean standard window presets
// ---------------------------------------------------------------------------
export const WINDOW_PRESETS: ComponentPreset[] = [
  {
    id: "window-1200",
    name: "Window 1200x1500",
    nameKo: "창문 1200x1500",
    category: "window",
    width: 1.2,
    height: 1.5,
    depth: 0.06,
    metadata: { panes: 1 },
  },
  {
    id: "window-1800",
    name: "Window 1800x1500",
    nameKo: "창문 1800x1500",
    category: "window",
    width: 1.8,
    height: 1.5,
    depth: 0.06,
    metadata: { panes: 2 },
  },
  {
    id: "window-2400",
    name: "Window 2400x1500",
    nameKo: "창문 2400x1500",
    category: "window",
    width: 2.4,
    height: 1.5,
    depth: 0.06,
    metadata: { panes: 3 },
  },
];

// ---------------------------------------------------------------------------
// MEP fixture presets — each bound to its building-system layer
// ---------------------------------------------------------------------------
export const MEP_PRESETS: ComponentPreset[] = [
  {
    id: "sprinkler",
    name: "Sprinkler Head",
    nameKo: "스프링클러 헤드",
    category: "mep",
    width: 0.08,
    height: 0.1,
    depth: 0.08,
    layerId: 13, // Safety — Immune System
    metadata: { mountType: "ceiling" },
  },
  {
    id: "bas-sensor",
    name: "BAS Sensor",
    nameKo: "BAS 센서",
    category: "mep",
    width: 0.1,
    height: 0.1,
    depth: 0.1,
    layerId: 10, // BAS/IoT
    metadata: { mountType: "ceiling" },
  },
  {
    id: "light-fixture",
    name: "LED Light Fixture",
    nameKo: "LED 조명기구",
    category: "mep",
    width: 0.6,
    height: 0.02,
    depth: 0.3,
    layerId: 7, // Electrical Lighting
    metadata: { mountType: "ceiling" },
  },
  {
    id: "hvac-vent",
    name: "HVAC Vent",
    nameKo: "공조 환기구",
    category: "mep",
    width: 0.4,
    height: 0.05,
    depth: 0.4,
    layerId: 5, // Ventilation
    metadata: { mountType: "ceiling" },
  },
  {
    id: "fire-alarm",
    name: "Fire Alarm",
    nameKo: "화재 경보기",
    category: "mep",
    width: 0.12,
    height: 0.06,
    depth: 0.04,
    layerId: 13, // Safety — Immune System
    metadata: { mountType: "wall" },
  },
];

// ---------------------------------------------------------------------------
// Stair presets
// ---------------------------------------------------------------------------
export const STAIR_PRESETS: ComponentPreset[] = [
  {
    id: "stair-standard",
    name: "Standard Stair",
    nameKo: "표준 계단",
    category: "stair",
    width: 1.2,
    height: 3.3, // typical floor height
    depth: 5.0,
    metadata: { type: "straight", riserHeight: 0.17 },
  },
  {
    id: "stair-wide",
    name: "Wide Stair",
    nameKo: "광폭 계단",
    category: "stair",
    width: 1.5,
    height: 3.3,
    depth: 5.5,
    metadata: { type: "straight", riserHeight: 0.17 },
  },
  {
    id: "stair-spiral",
    name: "Spiral Stair",
    nameKo: "나선 계단",
    category: "stair",
    width: 2.0,
    height: 3.3,
    depth: 2.0,
    metadata: { type: "spiral", riserHeight: 0.2 },
  },
];
