// src/lib/layers/types.ts
// Type definitions for the 10-layer building systems visualization framework.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";

/** Layer identifier — 10 layers covering all building systems */
export type LayerId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Configuration metadata for each layer */
export interface LayerConfig {
  id: LayerId;
  name: string;
  color: string;
  icon: string;
  animated: boolean;
  description: string;
}

/** All 10 layer configurations keyed by LayerId */
export const LAYER_CONFIGS: Record<LayerId, LayerConfig> = {
  1: {
    id: 1,
    name: "Architecture & Structure",
    color: "#9e9e9e",
    icon: "building-2",
    animated: false,
    description: "Floor wireframes, structural grid, and building envelope outline",
  },
  2: {
    id: 2,
    name: "Standard MEP",
    color: "#ef4444",
    icon: "pipette",
    animated: false,
    description: "Mechanical, electrical, and plumbing pipe runs and risers",
  },
  3: {
    id: 3,
    name: "BAS, IoT & Controls",
    color: "#22c55e",
    icon: "cpu",
    animated: true,
    description: "Building automation sensor nodes with pulsing network connections",
  },
  4: {
    id: 4,
    name: "Transport & Logistics",
    color: "#f59e0b",
    icon: "truck",
    animated: true,
    description: "Elevator shafts and animated elevator cars",
  },
  5: {
    id: 5,
    name: "Life Safety & Security",
    color: "#f97316",
    icon: "shield-alert",
    animated: true,
    description: "Fire suppression, alarm systems, and security infrastructure",
  },
  6: {
    id: 6,
    name: "Specialized Media",
    color: "#a855f7",
    icon: "radio",
    animated: false,
    description: "Audio/video, broadcast, and specialized media distribution",
  },
  7: {
    id: 7,
    name: "Microgrid & Energy",
    color: "#eab308",
    icon: "battery-charging",
    animated: true,
    description: "On-site energy generation, storage, and distribution network",
  },
  8: {
    id: 8,
    name: "Telecom & IT",
    color: "#06b6d4",
    icon: "wifi",
    animated: true,
    description: "Telecommunications, data cabling, and IT infrastructure",
  },
  9: {
    id: 9,
    name: "Waste & Recovery",
    color: "#65a30d",
    icon: "recycle",
    animated: false,
    description: "Waste management, recycling, and resource recovery systems",
  },
  10: {
    id: 10,
    name: "Dynamic Envelope",
    color: "#3b82f6",
    icon: "layers",
    animated: true,
    description: "Adaptive facade, smart glazing, and dynamic building skin",
  },
};

/** Interface that all layer generators must implement */
export interface LayerGenerator {
  generate(recipe: BuildingRecipe): THREE.Group;
  dispose(): void;
}
