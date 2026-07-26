// src/lib/layers/types.ts
// Type definitions for the 5-layer Digital Twin visualization framework.
// Purpose-driven layers replacing the legacy 15-component layer system.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";

/** Layer identifier — 5 purpose-driven Digital Twin layers */
export type LayerId =
  | "envelope"
  | "structure"
  | "mep"
  | "energy-zones"
  | "retrofit-targets";

/** All valid layer IDs for iteration */
export const ALL_LAYER_IDS: LayerId[] = [
  "envelope",
  "structure",
  "mep",
  "energy-zones",
  "retrofit-targets",
];

/** Configuration metadata for each layer */
export interface LayerConfig {
  id: LayerId;
  name: string;
  nameKo: string;
  color: string;
  icon: string;
  description: string;
}

/** All 5 Digital Twin layer configurations */
export const LAYER_CONFIGS: Record<LayerId, LayerConfig> = {
  envelope: {
    id: "envelope",
    name: "Envelope",
    nameKo: "외피",
    color: "#3b82f6",
    icon: "layers",
    description: "Walls, roof, windows, doors — thermal boundary visualization",
  },
  structure: {
    id: "structure",
    name: "Structure",
    nameKo: "구조",
    color: "#9e9e9e",
    icon: "building-2",
    description: "Columns, slabs, foundation — load-bearing elements",
  },
  mep: {
    id: "mep",
    name: "MEP",
    nameKo: "기계전기설비",
    color: "#06b6d4",
    icon: "wind",
    description: "All MEP systems (pipes, ducts, electrical) — building services overview",
  },
  "energy-zones": {
    id: "energy-zones",
    name: "Energy Zones",
    nameKo: "에너지 존",
    color: "#f97316",
    icon: "flame",
    description: "Floor-level energy zones, heat loss coloring — energy audit visualization",
  },
  "retrofit-targets": {
    id: "retrofit-targets",
    name: "Retrofit Targets",
    nameKo: "개선 대상",
    color: "#22c55e",
    icon: "wrench",
    description: "Highlighted elements recommended for upgrade — retrofit recommendation overlay",
  },
};

/** Interface that all layer generators must implement */
export interface LayerGenerator {
  generate(recipe: BuildingRecipe, density?: number): THREE.Group;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// MEP Sub-Layer Type System
// Parallel to LayerId — does NOT extend ALL_LAYER_IDS (which stays at 5 entries)
// ---------------------------------------------------------------------------

/** MEP sub-layer identifier — 4 utility system groups within the MEP layer */
export type MepSubLayerId =
  | "mep-electrical"
  | "mep-hvac"
  | "mep-lighting"
  | "mep-dhw";

/** All valid MEP sub-layer IDs for iteration */
export const MEP_SUB_IDS: MepSubLayerId[] = [
  "mep-electrical",
  "mep-hvac",
  "mep-lighting",
  "mep-dhw",
];

/** Configuration metadata for each MEP sub-layer */
export interface MepSubConfig {
  name: string;
  nameKo: string;
  color: string;
}

/**
 * MEP sub-layer configurations with bilingual labels and industry-standard colors.
 * Colors: yellow=electrical, cyan=HVAC, lime=lighting, orange=DHW
 */
export const MEP_SUB_CONFIGS: Record<MepSubLayerId, MepSubConfig> = {
  "mep-electrical": {
    name: "Electrical",
    nameKo: "전기",
    color: "#f59e0b", // amber/yellow
  },
  "mep-hvac": {
    name: "HVAC",
    nameKo: "냉난방환기",
    color: "#06b6d4", // cyan
  },
  "mep-lighting": {
    name: "Lighting",
    nameKo: "조명",
    color: "#84cc16", // lime
  },
  "mep-dhw": {
    name: "DHW/Plumbing",
    nameKo: "급탕/배관",
    color: "#f97316", // orange
  },
};

/**
 * Maps generator group names to their MEP sub-layer.
 * Unmapped generators (layer-8-media, layer-10 through layer-14) have no entry
 * and their output falls through to the flat MEP group.
 *
 * Note: layer-1-shell is assigned to mep-electrical per locked decision in CONTEXT.md.
 * It provides the structural reference armature for electrical routing visualization.
 * A dedicated electrical-routing generator is planned for v5.x.
 *
 * Note: layer-9-waste is mapped to mep-dhw. CONTEXT.md referred to this as
 * "layer-8-special-waste" which is a mis-numbering — layer-8 is layer-8-media (AV/media).
 */
export const GENERATOR_TO_MEP_SUB: Record<string, MepSubLayerId> = {
  "layer-1-shell": "mep-electrical",
  "electrical-routing": "mep-electrical",
  "layer-3-cooling": "mep-hvac",
  "layer-4-heating": "mep-hvac",
  "layer-5-ventilation": "mep-hvac",
  "layer-6-dhw": "mep-dhw",
  "layer-7-lighting": "mep-lighting",
  "layer-9-waste": "mep-dhw",
};
