// src/lib/layers/types.ts
// Type definitions for the 14-layer building systems visualization framework.
// Based on Building Systems Procedural Generation Matrix with ZEB loads.

import * as THREE from "three";
import type { BuildingRecipe } from "@/lib/procedural/types";

/** Layer identifier — 15 systems covering all building infrastructure + structural analysis */
export type LayerId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** All valid layer IDs for iteration */
export const ALL_LAYER_IDS: LayerId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Configuration metadata for each layer */
export interface LayerConfig {
  id: LayerId;
  name: string;
  nameKo: string;
  category: string;
  color: string;
  icon: string;
  animated: boolean;
  zebLoad: boolean;
  description: string;
}

/** All 14 layer configurations per Building Systems Procedural Generation Matrix */
export const LAYER_CONFIGS: Record<LayerId, LayerConfig> = {
  1: {
    id: 1,
    name: "Shell — Base Architecture",
    nameKo: "쉘 — 기본 건축",
    category: "Structure",
    color: "#9e9e9e",
    icon: "building-2",
    animated: false,
    zebLoad: false,
    description: "Slabs, columns, core walls, exterior footprint as semi-transparent wireframes",
  },
  2: {
    id: 2,
    name: "Envelope — Dynamic Skin",
    nameKo: "외피 — 동적 스킨",
    category: "Envelope",
    color: "#3b82f6",
    icon: "layers",
    animated: true,
    zebLoad: false,
    description: "Smart glass, automated louvers, motorized blinds — adaptive color/transparency",
  },
  3: {
    id: 3,
    name: "MEP Cooling 냉방",
    nameKo: "기계설비 — 냉방",
    category: "MEP (Thermal)",
    color: "#3b82f6",
    icon: "snowflake",
    animated: true,
    zebLoad: true,
    description: "Chillers, cooling towers, cold water pumps — blue spline pipes from plant to ceilings",
  },
  4: {
    id: 4,
    name: "MEP Heating 난방",
    nameKo: "기계설비 — 난방",
    category: "MEP (Thermal)",
    color: "#ef4444",
    icon: "flame",
    animated: true,
    zebLoad: true,
    description: "Boilers, heat exchangers, radiators, underfloor — red splines with heat gradients",
  },
  5: {
    id: 5,
    name: "MEP Ventilation 환기",
    nameKo: "기계설비 — 환기",
    category: "MEP (Air)",
    color: "#06b6d4",
    icon: "wind",
    animated: true,
    zebLoad: true,
    description: "AHUs, ERVs, exhaust fans — cyan particle trails and airflow dashed lines",
  },
  6: {
    id: 6,
    name: "MEP Water DHW 급탕",
    nameKo: "기계설비 — 급탕",
    category: "MEP (Water)",
    color: "#f97316",
    icon: "droplets",
    animated: false,
    zebLoad: true,
    description: "Hot water boilers, storage tanks — orange vertical core pipes with restricted branching",
  },
  7: {
    id: 7,
    name: "Electrical Lighting 조명",
    nameKo: "전기 — 조명",
    category: "Electrical",
    color: "#fbbf24",
    icon: "lightbulb",
    animated: true,
    zebLoad: true,
    description: "LED fixtures, dimming panels, daylight sensors — glowing ceiling grids",
  },
  8: {
    id: 8,
    name: "Specialized Media",
    nameKo: "특수 매체",
    category: "Media",
    color: "#a855f7",
    icon: "radio",
    animated: false,
    zebLoad: false,
    description: "Med-gas, compressed air, ultra-pure water — neon tubes with 90° elbows",
  },
  9: {
    id: 9,
    name: "Waste & Recovery",
    nameKo: "폐기물 — 자원회수",
    category: "Waste",
    color: "#65a30d",
    icon: "recycle",
    animated: true,
    zebLoad: false,
    description: "Greywater, trash chutes — downward-flowing dark green/brown segmented lines",
  },
  10: {
    id: 10,
    name: "BAS/IoT — Nervous System",
    nameKo: "BAS/IoT — 신경계",
    category: "Automation",
    color: "#22c55e",
    icon: "cpu",
    animated: true,
    zebLoad: false,
    description: "DDC controllers, thermostats, sensors — pulsing green nodes with data webs",
  },
  11: {
    id: 11,
    name: "Telecom — IT & Data",
    nameKo: "통신 — IT/데이터",
    category: "Telecom",
    color: "#d946ef",
    icon: "wifi",
    animated: true,
    zebLoad: false,
    description: "Server racks, fiber optic backbones, WAPs — magenta/cyan high-speed pulses",
  },
  12: {
    id: 12,
    name: "Kinetic Transport",
    nameKo: "수직이동 — 운송",
    category: "Transport",
    color: "#f59e0b",
    icon: "arrow-up-down",
    animated: true,
    zebLoad: false,
    description: "Elevators, escalators — vertical shafts with moving light blocks",
  },
  13: {
    id: 13,
    name: "Safety — Immune System",
    nameKo: "안전 — 면역체계",
    category: "Safety",
    color: "#ef4444",
    icon: "shield-alert",
    animated: true,
    zebLoad: false,
    description: "Pressurized stairwells, fire zones, CCTV — volumetric red forcefields with Fresnel",
  },
  14: {
    id: 14,
    name: "Power — Microgrid",
    nameKo: "전력 — 마이크로그리드",
    category: "Power",
    color: "#eab308",
    icon: "battery-charging",
    animated: true,
    zebLoad: false,
    description: "Solar PV, BESS, backup generators — glowing batteries with bi-directional flow",
  },
  15: {
    id: 15,
    name: "Structural Analysis",
    nameKo: "구조 해석",
    category: "Engineering",
    color: "#f97316",
    icon: "construction",
    animated: true,
    zebLoad: false,
    description: "Load path arrows, stress color coding, member sizing — KBC 2016 structural overlay",
  },
};

/** Interface that all layer generators must implement */
export interface LayerGenerator {
  generate(recipe: BuildingRecipe, density?: number): THREE.Group;
  dispose(): void;
}
